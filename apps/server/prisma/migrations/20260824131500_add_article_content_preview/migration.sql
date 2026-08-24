ALTER TABLE "Article" ADD COLUMN "contentPreview" TEXT;

UPDATE "Article"
SET "contentPreview" = LEFT(
    REGEXP_REPLACE(
        REGEXP_REPLACE(COALESCE("rewrittenContent", "originalContent"), '<[^>]*>', ' ', 'g'),
        E'\\s+',
        ' ',
        'g'
    ),
    280
);
