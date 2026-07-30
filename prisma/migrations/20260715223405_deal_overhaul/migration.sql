/*
  Warnings:

  - You are about to drop the column `description` on the `Deal` table. All the data in the column will be lost.
  - You are about to drop the column `metalType` on the `Deal` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Deal` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `Deal` table. All the data in the column will be lost.
  - Added the required column `material` to the `Deal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numLoads` to the `Deal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `packaging` to the `Deal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shippingTypes` to the `Deal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightPerLoad` to the `Deal` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "packaging" TEXT NOT NULL,
    "numLoads" INTEGER NOT NULL,
    "weightPerLoad" REAL NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'lbs',
    "shippingTypes" TEXT NOT NULL,
    "notes" TEXT,
    "askingPrice" REAL,
    "priceUnit" TEXT NOT NULL DEFAULT 'per lb',
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("askingPrice", "createdAt", "expiresAt", "id", "location", "priceUnit", "status", "title", "updatedAt", "userId") SELECT "askingPrice", "createdAt", "expiresAt", "id", "location", "priceUnit", "status", "title", "updatedAt", "userId" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE INDEX "Deal_userId_idx" ON "Deal"("userId");
CREATE INDEX "Deal_status_idx" ON "Deal"("status");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "encryptionKey" TEXT NOT NULL,
    "preferredWeightUnit" TEXT NOT NULL DEFAULT 'lbs',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("companyName", "createdAt", "email", "encryptionKey", "id", "name", "passwordHash", "updatedAt") SELECT "companyName", "createdAt", "email", "encryptionKey", "id", "name", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
