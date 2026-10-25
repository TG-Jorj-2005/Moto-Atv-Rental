-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PERSON', 'COMPANY');

-- Keep company accounts distinguishable once COMPANY disappears from Role
ALTER TABLE "users" ADD COLUMN "account_type" "AccountType" NOT NULL DEFAULT 'PERSON';
UPDATE "users" SET "account_type" = 'COMPANY' WHERE "role"::text = 'COMPANY';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'USER');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'USER' END::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "commission_amount" INTEGER,
ADD COLUMN     "commission_bps" INTEGER,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "location_id" TEXT,
ADD COLUMN     "owner_amount" INTEGER,
ADD COLUMN     "quote_id" TEXT,
ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "discount_bps" INTEGER,
ADD COLUMN     "offered_quantity" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commission_bps" INTEGER,
ALTER COLUMN "role" SET DEFAULT 'USER';

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

