import data from "../../data/co-land.json";
import type { HuntSummary } from "@prisma/client";
export const CO_LAND_SOURCE = data.source;
export const CO_LAND_DATE = data.retrievedAt.slice(0, 10);
export const coLandUnit = (unit: string) =>
  (
    data.units as Record<
      string,
      {
        acres: number;
        publicPct: number;
        privatePct: number;
        tribalPct: number;
        unknownPct: number;
        coverage: number;
        ownership: Record<string, number>;
      }
    >
  )[unit] ?? null;
export function coLandSummary(units: string[]) {
  const areas = [...new Set(units)].map(coLandUnit);
  if (!areas.length || areas.some((x) => !x)) return null;
  const acres = areas.reduce((a, u) => a + u!.acres, 0);
  const pct = (k: "publicPct" | "privatePct" | "tribalPct" | "unknownPct") =>
    areas.reduce((a, u) => a + u![k] * u!.acres, 0) / acres;
  return {
    acres,
    publicPct: pct("publicPct"),
    privatePct: pct("privatePct"),
    tribalPct: pct("tribalPct"),
    unknownPct: pct("unknownPct"),
  };
}
export function withCoLand<T extends HuntSummary>(r: T): T {
  const land = coLandSummary(r.units);
  return land
    ? {
        ...r,
        acres: land.acres,
        publicPct: land.publicPct,
        privatePct: land.privatePct,
        huntersSqMi:
          r.hunters5 !== null && r.harvestYears
            ? r.hunters5 / Math.min(5, r.harvestYears) / (land.acres / 640)
            : null,
      }
    : r;
}
