-- CreateTable
CREATE TABLE "Letterhead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Letterhead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Letterhead_organizationId_idx" ON "Letterhead"("organizationId");

-- AddForeignKey
ALTER TABLE "Letterhead" ADD CONSTRAINT "Letterhead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
