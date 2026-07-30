-- AlterTable
ALTER TABLE "PriceSheet" ADD COLUMN "expiresAt" DATETIME;

-- AlterTable
ALTER TABLE "PriceSheetRecipient" ADD COLUMN "lastNudgeAt" DATETIME;
ALTER TABLE "PriceSheetRecipient" ADD COLUMN "ownerLastReadAt" DATETIME;

-- AlterTable
ALTER TABLE "PriceSheetResponse" ADD COLUMN "agreedTotal" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealRecipientId" TEXT,
    "priceSheetRecipientId" TEXT,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'message',
    "content" TEXT NOT NULL,
    "bidAmount" REAL,
    "bidUnit" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_dealRecipientId_fkey" FOREIGN KEY ("dealRecipientId") REFERENCES "DealRecipient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_priceSheetRecipientId_fkey" FOREIGN KEY ("priceSheetRecipientId") REFERENCES "PriceSheetRecipient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("bidAmount", "bidUnit", "content", "createdAt", "dealRecipientId", "id", "senderName", "senderType", "type") SELECT "bidAmount", "bidUnit", "content", "createdAt", "dealRecipientId", "id", "senderName", "senderType", "type" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_dealRecipientId_idx" ON "Message"("dealRecipientId");
CREATE INDEX "Message_priceSheetRecipientId_idx" ON "Message"("priceSheetRecipientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
