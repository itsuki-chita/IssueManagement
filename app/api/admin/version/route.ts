import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  const cwd = process.cwd();
  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
    const isoDate = execSync("git log -1 --format=%cI", { cwd, encoding: "utf-8" }).trim();
    const message = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8" }).trim();
    const date = isoDate.slice(0, 10); // YYYY-MM-DD
    return NextResponse.json({ hash, date, message });
  } catch {
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}
