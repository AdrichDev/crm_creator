-- Auto-registro de cliente: campos de usuario + roles/propósitos de token.
-- Migración ADITIVA (sin DROP de tablas externas crm_project / tenants_registry).

-- AlterEnum
ALTER TYPE "AuthTokenPurpose" ADD VALUE 'verify_email';

-- AlterEnum
ALTER TYPE "MemberRole" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
