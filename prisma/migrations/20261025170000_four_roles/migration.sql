-- Replace Role {ADMIN, USER} by the hierarchy {ADMIN, CUSTOMER, OWNER, RENTAL_COMPANY} without losing data.
-- Mapping: ADMIN stays; USER with account_type COMPANY -> RENTAL_COMPANY;
--          USER owning at least one vehicle -> OWNER; any other USER -> CUSTOMER.
-- The deprecated users.account_type column is intentionally left untouched.

CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'CUSTOMER', 'OWNER', 'RENTAL_COMPANY');

-- ALTER TYPE ... USING cannot contain a subquery, so the new role is computed into a helper column first.
ALTER TABLE "users" ADD COLUMN "role_tmp" TEXT;
UPDATE "users" SET "role_tmp" = CASE
  WHEN "role"::text = 'ADMIN' THEN 'ADMIN'
  WHEN "account_type"::text = 'COMPANY' THEN 'RENTAL_COMPANY'
  WHEN EXISTS (SELECT 1 FROM "vehicles" v WHERE v."owner_id" = "users"."id") THEN 'OWNER'
  ELSE 'CUSTOMER'
END;

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role_tmp"::"Role_new");
ALTER TABLE "users" DROP COLUMN "role_tmp";

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
