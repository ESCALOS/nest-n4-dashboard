-- CreateEnum
CREATE TYPE "SspPermissionScope" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "ssp_permission_classifications" (
    "id" TEXT NOT NULL,
    "manifest_id" TEXT NOT NULL,
    "bl_item_gkey" INTEGER NOT NULL,
    "permission_nbr" TEXT NOT NULL,
    "scope" "SspPermissionScope" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ssp_permission_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ssp_permission_classifications_manifest_id_idx" ON "ssp_permission_classifications"("manifest_id");

-- CreateIndex
CREATE INDEX "ssp_permission_classifications_permission_nbr_idx" ON "ssp_permission_classifications"("permission_nbr");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ssp_permission_classifications_manifest_id_bl_item_gkey_key" ON "ssp_permission_classifications"("manifest_id", "bl_item_gkey");
