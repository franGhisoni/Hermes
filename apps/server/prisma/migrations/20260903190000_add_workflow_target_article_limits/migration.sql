-- CreateTable
CREATE TABLE "WorkflowTargetLimit" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "limit" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTargetLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowTargetLimit_targetId_idx" ON "WorkflowTargetLimit"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTargetLimit_workflowId_targetId_section_key" ON "WorkflowTargetLimit"("workflowId", "targetId", "section");

-- AddForeignKey
ALTER TABLE "WorkflowTargetLimit" ADD CONSTRAINT "WorkflowTargetLimit_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTargetLimit" ADD CONSTRAINT "WorkflowTargetLimit_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;
