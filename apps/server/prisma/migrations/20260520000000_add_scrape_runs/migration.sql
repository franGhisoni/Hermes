CREATE TYPE "ScrapeRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'EMPTY', 'ERROR');

CREATE TYPE "ScrapeRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sectionName" TEXT,
    "path" TEXT,
    "requestedLimit" INTEGER NOT NULL,
    "scrapedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ScrapeRunStatus" NOT NULL,
    "trigger" "ScrapeRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");
CREATE INDEX "ScrapeRun_source_startedAt_idx" ON "ScrapeRun"("source", "startedAt");
CREATE INDEX "ScrapeRun_sectionName_startedAt_idx" ON "ScrapeRun"("sectionName", "startedAt");
