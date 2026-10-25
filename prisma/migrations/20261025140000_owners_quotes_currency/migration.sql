-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NEW', 'QUOTED', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('RON', 'EUR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'OWNER';
ALTER TYPE "Role" ADD VALUE 'COMPANY';

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "county" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'RON',
ADD COLUMN     "paid_amount" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "description" TEXT,
ADD COLUMN     "listing_status" "ListingStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "owner_id" TEXT;

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "location_id" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
    "quoted_amount" INTEGER,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

