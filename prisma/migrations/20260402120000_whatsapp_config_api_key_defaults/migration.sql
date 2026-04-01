-- Campos opcionais para compatibilidade com clientes Prisma/schema antigos (Cloud API).
-- Com Baileys permanecem vazios; o create() não precisa mais preencher apiKey à mão.

ALTER TABLE "WhatsAppConfig" ADD COLUMN "apiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WhatsAppConfig" ADD COLUMN "webhookUrl" TEXT NOT NULL DEFAULT '';
