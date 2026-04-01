/*
  Warnings:

  - You are about to drop the column `apiKey` on the `WhatsAppConfig` table. All the data in the column will be lost.
  - You are about to drop the column `webhookUrl` on the `WhatsAppConfig` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WhatsAppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instanceName" TEXT NOT NULL DEFAULT 'default',
    "phoneNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WhatsAppConfig" ("createdAt", "id", "instanceName", "isActive", "phoneNumber", "status", "updatedAt") SELECT "createdAt", "id", "instanceName", "isActive", "phoneNumber", "status", "updatedAt" FROM "WhatsAppConfig";
DROP TABLE "WhatsAppConfig";
ALTER TABLE "new_WhatsAppConfig" RENAME TO "WhatsAppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
