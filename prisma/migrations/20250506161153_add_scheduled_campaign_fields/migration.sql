-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT,
ALTER COLUMN "status" SET DEFAULT 'draft';

-- CreateIndex
CREATE INDEX "Broadcast_status_idx" ON "Broadcast"("status");

-- CreateIndex
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_startDate_idx" ON "Broadcast"("startDate");
