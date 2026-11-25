// Read-only: print the production rows behind the open Idaho audit items (docs/idaho-draw-audit-2026-11-23.md).
// Usage: tsx scripts/id-audit-read.ts   (no writes; one READ ONLY transaction)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const HUNTS: [string, number][] = [['DEER', 1074], ['DEER', 1076], ['ELK', 2133], ['ELK', 2281], ['ELK', 2282], ['ELK', 2280], ['ELK', 2285]];
async function main() {
  const out = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const summaries = await tx.huntSummary.findMany({
      where: { state: 'ID', OR: HUNTS.map(([species, huntNumber]) => ({ species: species as 'DEER', huntNumber })) },
      select: { id: true, species: true, huntNumber: true, areaName: true, units: true, weapon: true, openDate: true, closeDate: true, oddsLastYear: true, permitsLast: true, hunters5: true, harvest5: true, harvestYears: true, success5: true, bigPct5: true, acres: true, publicPct: true, huntersSqMi: true, scoreQuality: true, scoreTrophy: true, smallSample: true },
    });
    const nums = [...new Set(HUNTS.map(([, n]) => n))].concat([1078]);
    const harvest = await tx.controlledHarvest.findMany({ where: { state: 'ID', huntNumber: { in: nums }, year: { gte: 2019 } }, select: { id: true, areaName: true, hunters: true, harvest: true, pct4: true, est4: true, antlered: true }, orderBy: { id: 'asc' } });
    const odds = await tx.drawOdds.findMany({ where: { state: 'ID', huntNumber: { in: nums }, year: { gte: 2019 }, draw: 1 }, select: { species: true, year: true, huntNumber: true, areaName: true, permits: true, resApps: true, nrApps: true }, orderBy: [{ species: 'asc' }, { huntNumber: 'asc' }, { year: 'asc' }] });
    const areaOdds = await tx.drawOdds.findMany({ where: { state: 'ID', species: 'DEER', areaName: { in: ['41-1', '41-2'] }, year: { gte: 2021 }, draw: 1 }, select: { year: true, huntNumber: true, areaName: true, permits: true }, orderBy: [{ year: 'asc' }, { huntNumber: 'asc' }] });
    const units = await tx.unit.findMany({ where: { state: 'ID', name: { in: ['41', '42'] } } });
    return { summaries, harvest, odds, areaOdds, units };
  }, { timeout: 60000 });
  console.log('AUDIT_READ ' + JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}
main().finally(() => db.$disconnect());
