/*
  Warnings:

  - You are about to drop the column `targetId` on the `Workflow` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Workflow" DROP CONSTRAINT "Workflow_targetId_fkey";

-- AlterTable
ALTER TABLE "Workflow" DROP COLUMN "targetId",
ADD COLUMN     "minScore" INTEGER,
ADD COLUMN     "sources" TEXT[];

-- CreateTable
CREATE TABLE "_TargetToWorkflow" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_TargetToWorkflow_AB_unique" ON "_TargetToWorkflow"("A", "B");

-- CreateIndex
CREATE INDEX "_TargetToWorkflow_B_index" ON "_TargetToWorkflow"("B");

-- AddForeignKey
ALTER TABLE "_TargetToWorkflow" ADD CONSTRAINT "_TargetToWorkflow_A_fkey" FOREIGN KEY ("A") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TargetToWorkflow" ADD CONSTRAINT "_TargetToWorkflow_B_fkey" FOREIGN KEY ("B") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
