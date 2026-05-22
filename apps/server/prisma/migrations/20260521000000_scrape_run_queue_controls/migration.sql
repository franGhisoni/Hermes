ALTER TYPE "ScrapeRunStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "ScrapeRunStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "ScrapeRun"
ADD COLUMN "queueJobId" TEXT,
ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "ScrapeRun_queueJobId_idx" ON "ScrapeRun"("queueJobId");
