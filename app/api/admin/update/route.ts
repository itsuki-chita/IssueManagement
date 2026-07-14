import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

type Step = { label: string; output: string; success: boolean };

export async function POST() {
  const cwd = process.cwd();
  const steps: Step[] = [];

  function run(label: string, cmd: string): string {
    const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] });
    steps.push({ label, output: output.trim(), success: true });
    return output.trim();
  }

  try {
    // リモートの最新を取得
    run("git fetch", "git fetch origin main");

    // 差分があるか確認
    const behind = execSync("git rev-list HEAD..origin/main --count", {
      cwd, encoding: "utf-8",
    }).trim();

    if (behind === "0") {
      return NextResponse.json({ success: true, upToDate: true, steps });
    }

    // アップデート前に DB バックアップ
    const dbPath = path.join(cwd, "prisma", "dev.db");
    if (fs.existsSync(dbPath)) {
      const backupDir = path.join(cwd, "prisma", "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      const hash = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
      const now = new Date();
      const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const backupFile = path.join(backupDir, `dev.db.${hash}.${ts}`);
      fs.copyFileSync(dbPath, backupFile);
      steps.push({ label: "DB バックアップ", output: `prisma/backups/dev.db.${hash}.${ts}`, success: true });
    } else {
      steps.push({ label: "DB バックアップ", output: "dev.db が存在しないためスキップしました（初回セットアップの場合は正常です）", success: true });
    }

    // 変更されるファイル一覧を取得
    const changedFiles = execSync("git diff HEAD origin/main --name-only", {
      cwd, encoding: "utf-8",
    });

    // git pull 実行
    run("git pull", "git pull origin main");

    // package.json が変わっていれば npm install
    if (changedFiles.includes("package.json")) {
      run("npm install", "npm install");
    }

    // prisma/schema.prisma が変わっていれば DB 反映
    if (changedFiles.includes("prisma/schema.prisma")) {
      run("prisma generate", "npx prisma generate");
      run("prisma db push", "npx prisma db push --accept-data-loss");
    }

    return NextResponse.json({ success: true, upToDate: false, steps });
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: Buffer; stdout?: Buffer };
    const errorOutput = e.stderr?.toString() || e.stdout?.toString() || e.message || "不明なエラー";
    steps.push({ label: "エラー", output: errorOutput, success: false });
    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}
