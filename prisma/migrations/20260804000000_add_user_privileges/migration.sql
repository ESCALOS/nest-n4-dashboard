-- CreateEnum
CREATE TYPE "Privilege" AS ENUM (
    'VIEW_GENERAL_CARGO_MONITORING',
    'VIEW_CONTAINER_MONITORING',
    'VIEW_PENDING_APPOINTMENTS',
    'VIEW_IN_PROGRESS_APPOINTMENTS',
    'VIEW_GENERAL_CARGO_IN_PROGRESS_APPOINTMENTS',
    'VIEW_TPR_REPORT'
);

-- Existing users intentionally receive no view privileges.
ALTER TABLE "users"
ADD COLUMN "privileges" "Privilege"[] NOT NULL DEFAULT ARRAY[]::"Privilege"[];
