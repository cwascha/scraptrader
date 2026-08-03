-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DealRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT,
    "accessToken" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" DATETIME,
    "viewedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sendError" TEXT,
    "sendAttempts" INTEGER NOT NULL DEFAULT 0,
    "ownerLastReadAt" DATETIME,
    "lastNudgeAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealRecipient_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DealRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DealRecipient" ("accessToken", "channel", "contactId", "createdAt", "dealId", "id", "lastNudgeAt", "ownerLastReadAt", "sentAt", "status", "viewedAt") SELECT "accessToken", "channel", "contactId", "createdAt", "dealId", "id", "lastNudgeAt", "ownerLastReadAt", "sentAt", "status", "viewedAt" FROM "DealRecipient";
DROP TABLE "DealRecipient";
ALTER TABLE "new_DealRecipient" RENAME TO "DealRecipient";
CREATE UNIQUE INDEX "DealRecipient_accessToken_key" ON "DealRecipient"("accessToken");
CREATE INDEX "DealRecipient_dealId_idx" ON "DealRecipient"("dealId");
CREATE INDEX "DealRecipient_accessToken_idx" ON "DealRecipient"("accessToken");
CREATE TABLE "new_PriceSheetRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "contactId" TEXT,
    "accessToken" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "viewedAt" DATETIME,
    "sendError" TEXT,
    "sendAttempts" INTEGER NOT NULL DEFAULT 0,
    "ownerLastReadAt" DATETIME,
    "lastNudgeAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSheetRecipient_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PriceSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceSheetRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PriceSheetRecipient" ("accessToken", "channel", "contactId", "createdAt", "id", "lastNudgeAt", "ownerLastReadAt", "sentAt", "sheetId", "status", "viewedAt") SELECT "accessToken", "channel", "contactId", "createdAt", "id", "lastNudgeAt", "ownerLastReadAt", "sentAt", "sheetId", "status", "viewedAt" FROM "PriceSheetRecipient";
DROP TABLE "PriceSheetRecipient";
ALTER TABLE "new_PriceSheetRecipient" RENAME TO "PriceSheetRecipient";
CREATE UNIQUE INDEX "PriceSheetRecipient_accessToken_key" ON "PriceSheetRecipient"("accessToken");
CREATE INDEX "PriceSheetRecipient_sheetId_idx" ON "PriceSheetRecipient"("sheetId");
CREATE INDEX "PriceSheetRecipient_accessToken_idx" ON "PriceSheetRecipient"("accessToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
