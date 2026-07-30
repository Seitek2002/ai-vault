-- AlterTable
ALTER TABLE "User" ADD COLUMN     "backgroundImageScope" TEXT,
ADD COLUMN     "sidebarBackgroundId" TEXT,
ADD COLUMN     "sidebarImageFilter" JSONB,
ADD COLUMN     "sidebarImageUrl" TEXT;
