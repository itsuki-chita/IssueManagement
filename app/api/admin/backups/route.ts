import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export type BackupEntry = {
  filename: string;
  hash: string;
  timestamp: string; // "YYYY-MM-DD HH:MM"
  sizeKB: number;
  type: "auto" | "update";
};

export async function GET() {
  const backupDir = path.join(process.cwd(), "prisma", "backups");
  if (!fs.existsSync(backupDir)) {
    return NextResponse.json([]);
  }

  const files = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("dev.db."))
    .sort()
    .reverse(); // 新しい順

  const entries: BackupEntry[] = files.map((filename) => {
    // update: dev.db.{hash}.{YYYYMMDDHHMMSS}
    // auto:   dev.db.auto.{YYYYMMDDHHMMSS}
    const parts = filename.split(".");
    const isAuto = parts[2] === "auto";
    const hash = isAuto ? "auto" : (parts[2] ?? "unknown");
    const ts = isAuto ? (parts[3] ?? "") : (parts[3] ?? "");
    const timestamp = ts.length === 14
      ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}`
      : ts;
    const stat = fs.statSync(path.join(backupDir, filename));
    return { filename, hash, timestamp, sizeKB: Math.round(stat.size / 1024), type: isAuto ? "auto" : "update" };
  });

  return NextResponse.json(entries);
}
