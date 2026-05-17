-- CreateTable
CREATE TABLE "SectionOverride" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "path" TEXT,
    "scrapeLimit" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SectionOverride_sectionId_source_key" ON "SectionOverride"("sectionId", "source");

-- AddForeignKey
ALTER TABLE "SectionOverride" ADD CONSTRAINT "SectionOverride_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
