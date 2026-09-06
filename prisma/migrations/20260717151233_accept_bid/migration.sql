-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "acceptedAt" DATETIME;
ALTER TABLE "Deal" ADD COLUMN "acceptedPrice" REAL;
ALTER TABLE "Deal" ADD COLUMN "acceptedRecipientId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "acceptedUnit" TEXT;
