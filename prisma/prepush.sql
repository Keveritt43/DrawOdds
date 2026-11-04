-- Runs before `prisma db push` on every start (package.json "start", railway.sync.json).
-- Schema changes that db push can only make with --accept-data-loss go here, written so they're safe to run
-- again and again: each block checks the current state first and does nothing once it's done.

-- 1. Unit: primary key name -> (state, name). Colorado has units with Idaho's numbers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'Unit' AND c.contype = 'p' AND array_length(c.conkey, 1) = 1
  ) THEN
    ALTER TABLE "Unit" DROP CONSTRAINT "Unit_pkey";
    ALTER TABLE "Unit" ADD CONSTRAINT "Unit_pkey" PRIMARY KEY ("state", "name");
  END IF;
END $$;

-- 2. SavedUnit: primary key (userId, unit) -> (userId, state, unit).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'SavedUnit' AND c.contype = 'p' AND array_length(c.conkey, 1) = 2
  ) THEN
    ALTER TABLE "SavedUnit" DROP CONSTRAINT "SavedUnit_pkey";
    ALTER TABLE "SavedUnit" ADD CONSTRAINT "SavedUnit_pkey" PRIMARY KEY ("userId", "state", "unit");
  END IF;
END $$;
