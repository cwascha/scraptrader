-- CreateTable
CREATE TABLE "MaterialGrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialGrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MaterialGrade_userId_idx" ON "MaterialGrade"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialGrade_userId_name_key" ON "MaterialGrade"("userId", "name");
