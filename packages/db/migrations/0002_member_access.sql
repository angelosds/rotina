ALTER TABLE "profile"
  ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;
