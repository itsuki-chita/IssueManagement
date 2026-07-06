import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

type Step = { label: string; output: string; success: boolean };

export async function POST(request: Request) {
  const { backupFile } = await request.json() as { backupFile: string };

  if (!backupFile || !backupFile.startsWith("dev.db.")) {
    return NextResponse.json({ error: "不正なバックアップ名" }, { status: 400 });
  }

  const cwd = process.cwd();
  const backupDir = path.join(cwd, "prisma", "backups");
  const backupPath = path.join(backupDir, backupFile);
  const dbPath = path.join(cwd, "prisma", "dev.db");
  const steps: Step[] = [];

  function run(label: string, cmd: string): string {
    const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] });
    steps.push({ label, output: output.trim(), success: true });
    return output.trim();
  }

  try {
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "バックアップが見つかりません" }, { status: 404 });
    }

    const parts = backupFile.split(".");
    const isAuto = parts[2] === "auto";

    if (!isAuto) {
      // アップデートバックアップ: git reset でコードも戻す
      const hash = parts[2];
      if (!hash) {
        return NextResponse.json({ error: "ハッシュが不正です" }, { status: 400 });
      }
      run("git reset", `git reset --hard ${hash}`);
    }

    // DB を復元
    fs.copyFileSync(backupPath, dbPath);
    steps.push({ label: "DB 復元", output: `prisma/backups/${backupFile} → prisma/dev.db`, success: true });

    // Prisma クライアント再生成（スキーマが戻った場合に備えて）
    run("prisma generate", "npx prisma generate");

    return NextResponse.json({ success: true, steps });
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: Buffer; stdout?: Buffer };
    const errorOutput = e.stderr?.toString() || e.stdout?.toString() || e.message || "不明なエラー";
    steps.push({ label: "エラー", output: errorOutput, success: false });
    return NextResponse.json({ success: false, steps }, { status: 500 });
  }
}
