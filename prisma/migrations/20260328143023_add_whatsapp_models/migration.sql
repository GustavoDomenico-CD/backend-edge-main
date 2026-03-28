-- CreateTable
CREATE TABLE "WhatsAppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instanceName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profilePicUrl" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" DATETIME,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contactId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "templateName" TEXT,
    "sentAt" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WhatsAppContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_phoneNumber_key" ON "WhatsAppContact"("phoneNumber");
