export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { default: cron } = await import("node-cron");
    const { default: fs } = await import("fs");
    const { default: path } = await import("path");

    // 開発時のホットリロードで二重登録しないようにグローバルフラグで管理
    const g = globalThis as unknown as { __autoBackupScheduled?: boolean };
    if (g.__autoBackupScheduled) return;
    g.__autoBackupScheduled = true;

    cron.schedule("0 3 * * *", () => {
      const cwd = process.cwd();
      const dbPath = path.join(cwd, "prisma", "dev.db");
      if (!fs.existsSync(dbPath)) return;

      try {
        const backupDir = path.join(cwd, "prisma", "backups");
        fs.mkdirSync(backupDir, { recursive: true });

        const now = new Date();
        const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
        const backupFile = `dev.db.auto.${ts}`;
        fs.copyFileSync(dbPath, path.join(backupDir, backupFile));

        // ローテーション: autoバックアップは3件のみ保持
        const autoFiles = fs
          .readdirSync(backupDir)
          .filter((f: string) => f.startsWith("dev.db.auto."))
          .sort()
          .reverse();
        for (const f of autoFiles.slice(3)) {
          fs.unlinkSync(path.join(backupDir, f));
        }

        console.log(`[AutoBackup] created: ${backupFile} (kept ${Math.min(autoFiles.length, 3)})`);
      } catch (err) {
        console.error("[AutoBackup] failed:", err);
      }
    });

    console.log("[AutoBackup] scheduled at 03:00 daily");
  }
}
