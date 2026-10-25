-- Stage 5: offers keep the exact vehicles and prices of each version (quote_items) and a revision number.
-- Additive only. Existing offers get revision 1 and have no items: they are recalculated before they can be accepted.

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "list_price" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_items_vehicle_id_idx" ON "quote_items"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_items_quote_id_vehicle_id_key" ON "quote_items"("quote_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

