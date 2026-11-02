import { db } from '@/lib/db';
import { classBreaks } from '@/lib/breaks';

// rendered per request (the DB isn't reachable at build time on Railway); browsers/CDN cache it for an hour
export const dynamic = 'force-dynamic';

const ALL = 'All Weapons Combined';
/** Under this many hunter-seasons in the window, a unit's success rate is noise (3 of 5 hunters = 60%). */
const MIN_HUNTERS = 50;

/** Fields the map can color by. Breaks are computed from the live data on every request. */
const SHADED = ['publicPct', 'huntablePct', 'genSuccessDeer', 'genSuccessElk', 'huntersSqMiDeer', 'huntersSqMiElk', 'bestResOdds', 'bestNrOdds'] as const;

/** Unit boundaries + per-unit metrics for the map, as one GeoJSON FeatureCollection (plus class breaks). */
export async function GET() {
  const [units, sums, general] = await Promise.all([
    db.unit.findMany({ where: { geometry: { not: undefined } } }),
    db.huntSummary.findMany({
      select: { species: true, type: true, unit: true, units: true, weapon: true, success5: true, resOdds5: true, nrOdds5: true, deerType: true },
    }),
    db.generalHarvest.findMany({ where: { takeMethod: ALL }, select: { species: true, unit: true, year: true, hunters: true, harvest: true } }),
  ]);
  const by = new Map<string, Record<string, number | string | null>>();
  const bump = (u: string, k: string, v: number | null, mode: 'max' | 'count' = 'max') => {
    const m = by.get(u) ?? by.set(u, {}).get(u)!;
    if (mode === 'count') m[k] = ((m[k] as number) ?? 0) + 1;
    else if (v !== null && (m[k] === undefined || m[k] === null || v > (m[k] as number))) m[k] = v;
  };
  for (const s of sums) {
    if (s.type === 'GENERAL' && s.unit && s.weapon === 'ANY' && s.species === 'DEER' && s.deerType) {
      (by.get(s.unit) ?? by.set(s.unit, {}).get(s.unit)!).deerType = s.deerType;
    }
    if (s.type === 'CONTROLLED')
      for (const u of s.units) {
        bump(u, 'controlled', null, 'count');
        bump(u, 'bestResOdds', s.resOdds5);
        bump(u, 'bestNrOdds', s.nrOdds5);
      }
  }

  // General season, all weapons, last 5 seasons of data. Units redrawn in 2022 only count 2022+ (the old
  // numbers describe a different piece of ground).
  const unitInfo = new Map(units.map((u) => [u.name, u]));
  const lastYear = { DEER: 0, ELK: 0 } as Record<string, number>;
  for (const g of general) lastYear[g.species] = Math.max(lastYear[g.species], g.year);
  const agg = new Map<string, { hunters: number; harvest: number; years: Set<number> }>();
  for (const g of general) {
    const u = unitInfo.get(g.unit);
    const from = Math.max(lastYear[g.species] - 4, u?.boundaryChanged2022 ? 2022 : 0);
    if (g.year < from || g.hunters === null) continue;
    const k = `${g.species}|${g.unit}`;
    const a = agg.get(k) ?? agg.set(k, { hunters: 0, harvest: 0, years: new Set() }).get(k)!;
    a.hunters += g.hunters;
    a.harvest += g.harvest ?? 0;
    a.years.add(g.year);
  }
  for (const [k, a] of agg) {
    const [species, unit] = k.split('|');
    const sp = species === 'DEER' ? 'Deer' : 'Elk';
    const m = by.get(unit) ?? by.set(unit, {}).get(unit)!;
    const perYear = a.hunters / a.years.size;
    const acres = unitInfo.get(unit)?.acres;
    m[`genHunters${sp}`] = Math.round(perYear);
    m[`genYears${sp}`] = a.years.size;
    m[`genSuccess${sp}`] = a.hunters >= MIN_HUNTERS ? (a.harvest / a.hunters) * 100 : null;
    m[`genSuccessRaw${sp}`] = a.hunters ? (a.harvest / a.hunters) * 100 : null;
    m[`huntersSqMi${sp}`] = acres ? perYear / (acres / 640) : null;
  }

  const features = units
    .filter((u) => u.geometry)
    .map((u) => {
      const ayPct = u.acres ? Math.min(100, ((u.accessYesAcres ?? 0) / u.acres) * 100) : null;
      return {
        type: 'Feature' as const,
        id: u.name,
        geometry: u.geometry,
        properties: {
          name: u.name,
          elkZone: u.elkZone,
          acres: u.acres,
          publicPct: u.publicPct,
          accessYesAcres: u.accessYesAcres ?? 0,
          accessYesPct: ayPct,
          huntablePct: u.publicPct !== null ? Math.min(100, u.publicPct + (ayPct ?? 0)) : null,
          wildernessPct: u.wildernessPct,
          boundaryChanged2022: u.boundaryChanged2022,
          ...(by.get(u.name) ?? {}),
        } as Record<string, unknown>,
      };
    });

  const classes = Object.fromEntries(
    SHADED.map((f) => [f, classBreaks(features.map((x) => x.properties[f]).filter((v): v is number => typeof v === 'number'))]),
  );
  return Response.json(
    { type: 'FeatureCollection', features, classes, years: lastYear },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
