-- Stage 6: vehicle specifications and a photo gallery. Additive only.

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "engine_cc" INTEGER,
ADD COLUMN     "license_category" TEXT,
ADD COLUMN     "power_hp" INTEGER,
ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_photos_vehicle_id_position_idx" ON "vehicle_photos"("vehicle_id", "position");

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Copy the existing cover images into the new gallery table (images/vehicles used by the demo data). The old
-- image_url column is kept untouched.
INSERT INTO "vehicle_photos" ("id", "vehicle_id", "path", "position", "created_at")
SELECT 'vp_' || replace(gen_random_uuid()::text, '-', ''), "id", "image_url", 0, CURRENT_TIMESTAMP
FROM "vehicles" WHERE "image_url" IS NOT NULL;
