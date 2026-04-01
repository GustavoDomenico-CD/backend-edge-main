-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WhatsAppContact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profilePicUrl" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "agentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" DATETIME,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WhatsAppContact" ("createdAt", "id", "isBlocked", "lastMessageAt", "name", "phoneNumber", "profilePicUrl", "tags", "updatedAt") SELECT "createdAt", "id", "isBlocked", "lastMessageAt", "name", "phoneNumber", "profilePicUrl", "tags", "updatedAt" FROM "WhatsAppContact";
DROP TABLE "WhatsAppContact";
ALTER TABLE "new_WhatsAppContact" RENAME TO "WhatsAppContact";
CREATE UNIQUE INDEX "WhatsAppContact_phoneNumber_key" ON "WhatsAppContact"("phoneNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
