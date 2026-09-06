/*
  Warnings:

  - A unique constraint covering the columns `[portalToken]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_portalToken_key" ON "Contact"("portalToken");
