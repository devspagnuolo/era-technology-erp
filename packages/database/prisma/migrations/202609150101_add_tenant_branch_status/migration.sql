-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
