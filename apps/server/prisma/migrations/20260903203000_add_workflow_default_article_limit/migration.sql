-- Add a single default publication quota per workflow.
ALTER TABLE "Workflow" ADD COLUMN "defaultArticleLimit" INTEGER NOT NULL DEFAULT 1;

-- Preserve the previous per-medium defaults when possible. If they differed,
-- use the smallest value as the safest workflow-wide default.
UPDATE "Workflow" AS workflow
SET "defaultArticleLimit" = COALESCE((
    SELECT MIN(target_limit."limit")
    FROM "WorkflowTargetLimit" AS target_limit
    WHERE target_limit."workflowId" = workflow."id"
      AND target_limit."section" = ''
), 1);

-- Empty-section rows belonged to the replaced per-medium default model.
DELETE FROM "WorkflowTargetLimit" WHERE "section" = '';

ALTER TABLE "WorkflowTargetLimit" ALTER COLUMN "section" DROP DEFAULT;
