-- CreateTable
CREATE TABLE "ChatbotCadastro" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "consultationType" TEXT,
    "consultationCategory" TEXT,
    "role" TEXT NOT NULL DEFAULT 'paciente',
    "userId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotCadastro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotCadastro_userId_key" ON "ChatbotCadastro"("userId");

-- CreateIndex
CREATE INDEX "ChatbotCadastro_email_idx" ON "ChatbotCadastro"("email");

-- CreateIndex
CREATE INDEX "ChatbotCadastro_createdAt_idx" ON "ChatbotCadastro"("createdAt");
