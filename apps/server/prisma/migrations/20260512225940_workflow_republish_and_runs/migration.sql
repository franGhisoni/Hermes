-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'EMPTY', 'ERROR');

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "allowRepublish" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "status" "WorkflowRunStatus" NOT NULL,
    "targetsTotal" INTEGER NOT NULL DEFAULT 0,
    "targetsCovered" INTEGER NOT NULL DEFAULT 0,
    "targetsSkipped" INTEGER NOT NULL DEFAULT 0,
    "articlesUnique" INTEGER NOT NULL DEFAULT 0,
    "articlesRefilled" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_startedAt_idx" ON "WorkflowRun"("workflowId", "startedAt");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
