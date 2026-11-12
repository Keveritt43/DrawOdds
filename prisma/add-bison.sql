-- Additive: the BISON species value for Utah's once-in-a-lifetime bison hunts (docs/states/ut-onboarding.md).
-- No rows change. Run once with: npx prisma db execute --file prisma/add-bison.sql --schema prisma/schema.prisma
ALTER TYPE "Species" ADD VALUE IF NOT EXISTS 'BISON';
