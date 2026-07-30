-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "pickupCity" TEXT;
ALTER TABLE "Deal" ADD COLUMN "pickupState" TEXT;
ALTER TABLE "Deal" ADD COLUMN "pickupStreet" TEXT;
ALTER TABLE "Deal" ADD COLUMN "pickupZip" TEXT;

-- CreateTable
CREATE TABLE "YardAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "YardAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "YardAddress_userId_idx" ON "YardAddress"("userId");
