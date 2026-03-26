-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProactiveRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "buttons" JSONB NOT NULL DEFAULT [],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProactiveRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProactiveRule" ("condition", "createdAt", "id", "isActive", "lastFiredAt", "message", "trigger", "updatedAt", "userId") SELECT "condition", "createdAt", "id", "isActive", "lastFiredAt", "message", "trigger", "updatedAt", "userId" FROM "ProactiveRule";
DROP TABLE "ProactiveRule";
ALTER TABLE "new_ProactiveRule" RENAME TO "ProactiveRule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
