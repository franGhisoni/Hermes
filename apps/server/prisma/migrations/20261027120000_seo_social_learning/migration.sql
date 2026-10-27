-- SEO rewrite and social copy prompts
ALTER TYPE "PromptType" ADD VALUE IF NOT EXISTS 'REWRITE_SEO';
ALTER TYPE "PromptType" ADD VALUE IF NOT EXISTS 'SOCIAL_COPY';

-- Learning from editor changes (FeedbackReport already exists from 20261006120000_feedback_reports)
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "aiRewriteSnapshot" JSONB;

CREATE TABLE "RewritePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT,
    "instruction" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RewritePreference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RewritePreference_userId_active_createdAt_idx" ON "RewritePreference"("userId", "active", "createdAt");
ALTER TABLE "RewritePreference" ADD CONSTRAINT "RewritePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
