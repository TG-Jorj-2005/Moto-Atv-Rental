-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('CRUISER', 'ADVENTURE', 'NAKED_SPORT', 'DUAL_SPORT', 'ATV_SPORT', 'ATV_UTILITY');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "category" "VehicleCategory";

-- CreateIndex
CREATE INDEX "vehicles_category_idx" ON "vehicles"("category");

