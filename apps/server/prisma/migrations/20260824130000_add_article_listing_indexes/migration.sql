CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Source_name_idx" ON "Source"("name");
CREATE INDEX "Article_createdAt_idx" ON "Article"("createdAt");
CREATE INDEX "Article_status_createdAt_idx" ON "Article"("status", "createdAt");
CREATE INDEX "Article_status_interestScore_idx" ON "Article"("status", "interestScore");
CREATE INDEX "Article_sourceId_createdAt_idx" ON "Article"("sourceId", "createdAt");

CREATE INDEX "Article_originalTitle_trgm_idx"
ON "Article" USING GIN ("originalTitle" gin_trgm_ops);

CREATE INDEX "Article_rewrittenTitle_trgm_idx"
ON "Article" USING GIN ("rewrittenTitle" gin_trgm_ops);

CREATE INDEX "Article_section_trgm_idx"
ON "Article" USING GIN ("section" gin_trgm_ops);

CREATE INDEX "Article_originalUrl_trgm_idx"
ON "Article" USING GIN ("originalUrl" gin_trgm_ops);
