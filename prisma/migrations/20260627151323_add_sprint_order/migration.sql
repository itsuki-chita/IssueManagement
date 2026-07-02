-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sprint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Sprint" ("createdAt", "endDate", "id", "name", "startDate", "status") SELECT "createdAt", "endDate", "id", "name", "startDate", "status" FROM "Sprint";
DROP TABLE "Sprint";
ALTER TABLE "new_Sprint" RENAME TO "Sprint";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
