// Read-only: print a fresh Idaho trophy snapshot (the input of scripts/build-idaho-noquota-tiers.ts)
// straight from production, in the same shape as data/id/trophy-shadow-2026-11-16.json, which was
// assembled from the public /api/export CSVs in Chrome. Rows go through the same read-time Idaho
// corrections as the export (withIdahoVerifiedArea). Output: SNAPSHOT_META, SNAPSHOT_HUNTS (chunks),
// SNAPSHOT_UNITS lines; reassemble with scripts/id-trophy-snapshot-join.mjs.
import { PrismaClient, type HuntSummary } from '@prisma/client';
import { withIdahoVerifiedArea } from '../src/lib/idahoHuntCorrections';
import { idahoV2Excluded } from '../src/lib/trophyHunt';

const db = new PrismaClient();
const SPECIES = ['DEER', 'ELK', 'PRONGHORN'] as const;
const r3 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10); // as /api/export: 0-1 ratio -> percent, 1 decimal
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function main() {
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return tx.huntSummary.findMany({ where: { state: 'ID', species: { in: [...SPECIES] }, antlerClass: { in: ['ANTLERED', 'EITHER'] }, type: { in: ['CONTROLLED', 'GENERAL'] } } });
  });
  const fixed = rows.map((r) => withIdahoVerifiedArea(r as HuntSummary));
  const hunts = fixed.filter((r) => r.type === 'CONTROLLED' && r.huntNumber).map((r) => ({
    species: r.species, code: String(r.huntNumber), units: r.units, weapon: r.weapon, antlerClass: r.antlerClass,
    open: day(r.openDate), close: day(r.closeDate), tags: r.tags, applications: r.appsLast, drawYear: r.oddsLastYear,
    success5: r3(r.success5), hunters5: r.hunters5, harvest5: r.harvest5, liveTrophy: r.scoreTrophy, bigPct5: r3(r.bigPct5),
    deerType: r.deerType, smallSample: r.smallSample,
  })).sort((a, b) => a.species.localeCompare(b.species) || Number(a.code) - Number(b.code));
  // 5-year antlered/either-sex harvest per unit from general and controlled rows; a multi-unit hunt is split evenly.
  const bySpecies: Record<string, Record<string, number>> = {};
  for (const r of fixed) {
    if (r.nrTag || r.harvest5 === null || !r.units.length) continue;
    const m = (bySpecies[r.species] ??= {});
    for (const u of r.units) m[u] = (m[u] ?? 0) + r.harvest5 / r.units.length;
  }
  for (const m of Object.values(bySpecies)) for (const u of Object.keys(m)) m[u] = Math.round(m[u]);
  console.log('SNAPSHOT_META ' + JSON.stringify({ taken: new Date().toISOString(), rows: rows.length, hunts: hunts.length, general: fixed.filter((r) => r.type === 'GENERAL').length }));
  for (let i = 0; i < hunts.length; i += 20) console.log('SNAPSHOT_HUNTS ' + JSON.stringify(hunts.slice(i, i + 20)));
  for (const [sp, m] of Object.entries(bySpecies)) console.log('SNAPSHOT_UNITS ' + JSON.stringify({ species: sp, units: m }));
  // General-season rows (resident unit x weapon hunts) and nonresident general tags, with the latest
  // nonresident tag draw per code, for the general trophy ranking (owner, Nov 26).
  const generals = fixed.filter((r) => r.type === 'GENERAL').map((r) => ({
    id: r.id, species: r.species, nrTag: !!r.nrTag, tagCode: r.tagCode, units: r.units, weapon: r.weapon, weapons: r.weapons,
    antlerClass: r.antlerClass, open: day(r.openDate), close: day(r.closeDate), hunters5: r.hunters5, harvest5: r.harvest5,
    harvestYears: r.harvestYears, bigPct5: r3(r.bigPct5), deerType: r.deerType, youthOnly: r.youthOnly,
    excluded: idahoV2Excluded(r as HuntSummary), liveTrophy: r.scoreTrophy,
  })).sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < generals.length; i += 25) console.log('SNAPSHOT_GENERAL ' + JSON.stringify(generals.slice(i, i + 25)));
  const draws = await db.nrDraw.findMany({ where: { state: 'ID' }, orderBy: { year: 'asc' } });
  const latest = new Map(draws.map((d) => [d.code, d]));
  console.log('SNAPSHOT_NRDRAW ' + JSON.stringify([...latest.values()].map((d) => ({ code: d.code, year: d.year, species: d.species, zone: d.zone, tag: d.tag, unit: d.unit, tags: d.tags, applied1: d.applied[0] ?? null, drew1: d.drew[0] ?? null }))));
  console.log('SNAPSHOT_END');
}
main().finally(() => db.$disconnect());
