-- CreateEnum
CREATE TYPE "EditorialRuleMatchType" AS ENUM ('GLOBAL', 'SECTION', 'SCORE_RANGE', 'LOCATION');

-- CreateEnum
CREATE TYPE "BlockedPersonAction" AS ENUM ('LOWER_SCORE', 'BLOCK_PUBLICATION');

-- CreateTable
CREATE TABLE "EditorialRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchType" "EditorialRuleMatchType" NOT NULL DEFAULT 'GLOBAL',
    "section" TEXT,
    "minScore" INTEGER,
    "maxScore" INTEGER,
    "location" TEXT,
    "styleInstruction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedPerson" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action" "BlockedPersonAction" NOT NULL DEFAULT 'LOWER_SCORE',
    "scoreWhenMatched" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedPerson_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Article" ADD COLUMN "location" TEXT,
ADD COLUMN "editorialData" JSONB,
ADD COLUMN "publicationBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicationBlockReason" TEXT;

-- CreateIndex
CREATE INDEX "EditorialRule_active_priority_idx" ON "EditorialRule"("active", "priority");
CREATE INDEX "EditorialRule_matchType_idx" ON "EditorialRule"("matchType");
CREATE UNIQUE INDEX "BlockedPerson_name_key" ON "BlockedPerson"("name");
CREATE INDEX "BlockedPerson_active_idx" ON "BlockedPerson"("active");
CREATE INDEX "Article_publicationBlocked_status_idx" ON "Article"("publicationBlocked", "status");
