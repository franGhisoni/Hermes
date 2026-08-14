-- CreateTable
CREATE TABLE "FilterCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilterCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Section" ADD COLUMN "filterCategoryId" TEXT;

-- Preserve the current Dashboard behavior by creating one filter category for
-- every existing section name and associating those sections automatically.
INSERT INTO "FilterCategory" ("id", "name", "createdAt", "updatedAt")
SELECT
    SUBSTRING(md5("name") FROM 1 FOR 8) || '-' ||
    SUBSTRING(md5("name") FROM 9 FOR 4) || '-' ||
    SUBSTRING(md5("name") FROM 13 FOR 4) || '-' ||
    SUBSTRING(md5("name") FROM 17 FOR 4) || '-' ||
    SUBSTRING(md5("name") FROM 21 FOR 12),
    "name",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Section"
GROUP BY "name";

UPDATE "Section" AS section
SET "filterCategoryId" = category."id"
FROM "FilterCategory" AS category
WHERE category."name" = section."name";

-- CreateIndex
CREATE UNIQUE INDEX "FilterCategory_name_key" ON "FilterCategory"("name");
CREATE INDEX "Section_filterCategoryId_idx" ON "Section"("filterCategoryId");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_filterCategoryId_fkey"
FOREIGN KEY ("filterCategoryId") REFERENCES "FilterCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
