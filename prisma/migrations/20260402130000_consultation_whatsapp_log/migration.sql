-- CreateTable
CREATE TABLE "ConsultationWhatsAppLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appointmentId" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "patientName" TEXT,
    "status" TEXT NOT NULL,
    "partsSent" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
