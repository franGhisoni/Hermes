CREATE TABLE "DailyOperationalLog" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "scrapeRuns" INTEGER NOT NULL DEFAULT 0,
    "candidatesDetected" INTEGER NOT NULL DEFAULT 0,
    "scrapedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "discardedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "publishFailedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyOperationalLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyOperationalLog_day_key" ON "DailyOperationalLog"("day");
CREATE INDEX "DailyOperationalLog_day_idx" ON "DailyOperationalLog"("day");
