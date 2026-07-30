-- CreateTable
CREATE TABLE "PriceSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Delivered Prices',
    "headerNote" TEXT,
    "effectiveDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PriceSheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSheetItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" REAL,
    "priceNote" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'lb',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PriceSheetItem_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PriceSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSheetRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "contactId" TEXT,
    "accessToken" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "viewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSheetRecipient_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PriceSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceSheetRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSheetResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "buyerNote" TEXT,
    "dealerNote" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PriceSheetResponse_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "PriceSheetRecipient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceSheetResponseLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'lbs',
    "buyerPrice" REAL,
    "dealerPrice" REAL,
    CONSTRAINT "PriceSheetResponseLine_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "PriceSheetResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PriceSheet_userId_idx" ON "PriceSheet"("userId");

-- CreateIndex
CREATE INDEX "PriceSheetItem_sheetId_idx" ON "PriceSheetItem"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSheetRecipient_accessToken_key" ON "PriceSheetRecipient"("accessToken");

-- CreateIndex
CREATE INDEX "PriceSheetRecipient_sheetId_idx" ON "PriceSheetRecipient"("sheetId");

-- CreateIndex
CREATE INDEX "PriceSheetRecipient_accessToken_idx" ON "PriceSheetRecipient"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSheetResponse_recipientId_key" ON "PriceSheetResponse"("recipientId");

-- CreateIndex
CREATE INDEX "PriceSheetResponseLine_responseId_idx" ON "PriceSheetResponseLine"("responseId");
