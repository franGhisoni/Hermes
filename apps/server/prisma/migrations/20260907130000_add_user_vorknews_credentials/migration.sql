-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vorknewsUsername" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vorknewsPassword" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vorknewsAuthorName" TEXT;
