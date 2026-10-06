ALTER TABLE "FeedbackReport" ADD COLUMN "publicationContext" JSONB;

CREATE TABLE "ArticlePublication" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "category" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticlePublication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ArticlePublication_articleId_sentAt_idx" ON "ArticlePublication"("articleId", "sentAt");
ALTER TABLE "ArticlePublication" ADD CONSTRAINT "ArticlePublication_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
