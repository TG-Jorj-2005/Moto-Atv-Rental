-- Indexes for the filters used by the dashboards, the account pages and the pending-booking limit. Additive only.
-- CreateIndex
CREATE INDEX "bookings_user_id_status_idx" ON "bookings"("user_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_start_at_idx" ON "bookings"("status", "start_at");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "maintenance_vehicle_id_type_performed_at_idx" ON "maintenance"("vehicle_id", "type", "performed_at");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payouts_owner_id_idx" ON "payouts"("owner_id");

-- CreateIndex
CREATE INDEX "quote_requests_user_id_status_idx" ON "quote_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "vehicles_listing_status_status_idx" ON "vehicles"("listing_status", "status");

-- CreateIndex
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles"("owner_id");

