-- CreateEnum
CREATE TYPE "AgentWorkflow" AS ENUM ('single', 'multi_agent');

-- CreateEnum
CREATE TYPE "AgentStageRole" AS ENUM ('planner', 'executor', 'critic');

-- CreateEnum
CREATE TYPE "AgentStageStatus" AS ENUM ('running', 'completed', 'failed', 'canceled');

-- AlterTable
ALTER TABLE "AgentRun"
ADD COLUMN "workflow" "AgentWorkflow" NOT NULL DEFAULT 'single';

-- CreateTable
CREATE TABLE "AgentStage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "AgentStageRole" NOT NULL,
    "status" "AgentStageStatus" NOT NULL DEFAULT 'running',
    "output" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentStage_runId_sequence_key" ON "AgentStage"("runId", "sequence");

-- CreateIndex
CREATE INDEX "AgentStage_runId_status_idx" ON "AgentStage"("runId", "status");

-- AddForeignKey
ALTER TABLE "AgentStage" ADD CONSTRAINT "AgentStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
