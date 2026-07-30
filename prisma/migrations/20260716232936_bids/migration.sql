-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dealRecipientId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'message',
    "content" TEXT NOT NULL,
    "bidAmount" REAL,
    "bidUnit" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_dealRecipientId_fkey" FOREIGN KEY ("dealRecipientId") REFERENCES "DealRecipient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("content", "createdAt", "dealRecipientId", "id", "senderName", "senderType") SELECT "content", "createdAt", "dealRecipientId", "id", "senderName", "senderType" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_dealRecipientId_idx" ON "Message"("dealRecipientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
