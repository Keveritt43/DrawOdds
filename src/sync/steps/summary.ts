import type { DrawOdds, Prisma } from '@prisma/client';
import { db, thisYear, type StepResult } from '../core/context';
import { unitsFromName, parentUnit } from '../core/parse';
import {
  lineage,
  summarizeOdds,
  summarizeHarvest,
  tagAndFill,
  BOUNDARY_CHANGED_2022,
  monthsOpen,
  type OddsRow,
  type HarvestRow,
} from '../core/math';

const METHOD: Record<string, string> = { ANY: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };

const month = (d: Date | null) => (d ? d.getUTCMonth() + 1 : null);

/** Rebuilds the filter-ready HuntSummary table from the raw tables. Pure DB work - no IDFG requests. */
export async function buildSummaries(): Promise<StepResult> {
  const details: string[] = [];
  const [hunts, odds, areas, unitRows] = await Promise.all([
    db.hunt.findMany(),
    db.drawOdds.findMany({ where: { draw: 1 } }),
    db.huntArea.findMany({ select: { areaId: true, name: true, publicPct: true, privatePct: true, accessYesAcres: true, accessYesCount: true, units: true, acres: true } }),
    db.unit.findMany({ select: { name: true, publicPct: true, privatePct: true, accessYesAcres: true, accessYesCount: true, acres: true } }),
  ]);
  const unitMap = new Map(unitRows.map((u) => [u.name, u]));
  const areaMap = new Map(areas.map((a) => [a.areaId, a]));
  const oddsBy = new Map<string, DrawOdds[]>(); // species|area
  for (const o of odds) (oddsBy.get(`${o.species}|${o.areaName}`) ?? oddsBy.set(`${o.species}|${o.areaName}`, []).get(`${o.species}|${o.areaName}`)!).push(o);

  const out: Prisma.HuntSummaryCreateManyInput[] = [];

  for (const h of hunts) {
    const base = {
      huntId: h.idfgId,
      species: h.species,
      type: h.type,
      huntNumber: h.huntNumber,
      name: h.name,
      weapon: h.weapon,
      takeMethod: h.takeMethod,
      antlerClass: h.antlerClass,
      openDate: h.openDate,
      closeDate: h.closeDate,
      openMonth: month(h.openDate),
      closeMonth: month(h.closeDate),
      months: monthsOpen(h.openDate, h.closeDate),
      tags: h.tags,
      youthOnly: h.youthOnly,
      units: h.units,
    };

    if (h.type === 'CONTROLLED' && h.huntNumber) {
      // the hunt's most recent drawing-odds row tells us its area
      const cur = odds
        .filter((o) => o.species === h.species && o.huntNumber === h.huntNumber && o.year <= h.year)
        .sort((a, b) => b.year - a.year)[0];
      if (!cur) {
        // new hunt with no draw history yet: area and units still come from the regs + GIS
        const named = h.areaName ? areas.find((a) => a.name === h.areaName) : undefined;
        const units = ((named?.units as { unit: string; pct: number }[] | null) ?? []).map((x) => x.unit);
        const all = units.length ? units : h.areaName ? [parentUnit(h.areaName)] : h.units;
        details.push(`${h.species} hunt ${h.huntNumber}: no drawing-odds history (new hunt?)`);
        out.push({ ...base, id: `c:${h.idfgId}`, areaName: h.areaName, units: all, boundaryChanged: all.some((u) => BOUNDARY_CHANGED_2022.has(u)) });
        continue;
      }
      const hist = oddsBy.get(`${h.species}|${cur.areaName}`) ?? [];
      const lin = lineage(cur as OddsRow, hist as OddsRow[]);
      const linOdds = hist.filter((o) => lin.get(o.year) === o.huntNumber);
      const { years: oddsYears, ...o } = summarizeOdds(linOdds as OddsRow[]);

      const harvestRows = await db.controlledHarvest.findMany({
        where: { species: h.species, OR: [...lin.entries()].map(([year, huntNumber]) => ({ year, huntNumber })) },
      });
      const hs = summarizeHarvest(h.species, harvestRows as HarvestRow[]);
      const area = cur.areaId ? areaMap.get(cur.areaId) : undefined;
      // units come from IDFG's hunt-area boundary (authoritative); fall back to the area's parent unit
      const areaUnits = ((area?.units as { unit: string; pct: number }[] | null) ?? []).map((x) => x.unit);
      const allUnits = (areaUnits.length ? areaUnits : [parentUnit(cur.areaName)]).slice().sort();
      // land: the hunt area's own numbers; fall back to the acreage-unweighted mean of its units
      const fallback = allUnits.map((u) => unitMap.get(u)).filter(Boolean) as typeof unitRows;
      const mean = (f: (u: (typeof unitRows)[number]) => number | null) => {
        const v = fallback.map(f).filter((x): x is number => x !== null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      };
      out.push({
        ...base,
        id: `c:${h.idfgId}`,
        areaName: cur.areaName,
        areaId: cur.areaId,
        units: allUnits,
        ...o,
        oddsYears,
        success5: hs.success5,
        hunters5: hs.hunters5,
        harvest5: hs.harvest5,
        whitetailPct5: hs.whitetailPct5,
        deerType: hs.deerType,
        bigPct5: hs.bigPct5,
        antlerlessShare5: hs.antlerlessShare5,
        harvestYears: hs.years,
        smallSample: hs.smallSample,
        resTagAndFill: tagAndFill(o.resOdds5, hs.success5),
        nrTagAndFill: tagAndFill(o.nrOdds5, hs.success5),
        publicPct: area?.publicPct ?? mean((u) => u.publicPct),
        privatePct: area?.privatePct ?? mean((u) => u.privatePct),
        accessYesAcres: area?.accessYesAcres ?? (fallback.length ? fallback.reduce((a, u) => a + (u.accessYesAcres ?? 0), 0) : null),
        accessYesCount: area?.accessYesCount ?? (fallback.length ? fallback.reduce((a, u) => a + (u.accessYesCount ?? 0), 0) : null),
        acres: area?.acres ?? (fallback.length ? fallback.reduce((a, u) => a + (u.acres ?? 0), 0) || null : null),
        boundaryChanged: allUnits.some((u) => BOUNDARY_CHANGED_2022.has(u)),
      });
      continue;
    }

    // general hunt: one row per unit (named in the hunt title when possible), using that unit's harvest for the same weapon
    const named = unitsFromName(h.name);
    for (const unit of named.length ? named : h.units) {
      const method = METHOD[h.weapon] ?? 'All Weapons Combined';
      const rows = await db.generalHarvest.findMany({ where: { species: h.species, unit, takeMethod: method, year: { gte: thisYear() - 6 } } });
      const hs = summarizeHarvest(h.species, rows as HarvestRow[]);
      const u = unitMap.get(unit);
      out.push({
        ...base,
        id: `g:${h.idfgId}:${unit}`,
        unit,
        areaName: unit,
        units: [unit],
        success5: hs.success5,
        hunters5: hs.hunters5,
        harvest5: hs.harvest5,
        whitetailPct5: hs.whitetailPct5,
        deerType: hs.deerType,
        bigPct5: hs.bigPct5,
        antlerlessShare5: hs.antlerlessShare5,
        harvestYears: hs.years,
        smallSample: hs.smallSample,
        publicPct: u?.publicPct ?? null,
        privatePct: u?.privatePct ?? null,
        accessYesAcres: u?.accessYesAcres ?? null,
        accessYesCount: u?.accessYesCount ?? null,
        acres: u?.acres ?? null,
        boundaryChanged: BOUNDARY_CHANGED_2022.has(unit),
      });
    }
  }

  // Access Yes! is mostly private land opened by lease, so it is reported separately from public land
  for (const r of out) {
    if (r.acres && r.accessYesAcres !== null && r.accessYesAcres !== undefined) {
      r.accessYesPct = Math.min(100, (r.accessYesAcres / r.acres) * 100);
    }
    if (r.publicPct !== null && r.publicPct !== undefined) r.huntablePct = Math.min(100, r.publicPct + (r.accessYesPct ?? 0));
  }

  const seen = new Map<string, Prisma.HuntSummaryCreateManyInput>();
  const deduped: Prisma.HuntSummaryCreateManyInput[] = [];
  for (const r of out) {
    if (r.type !== 'CONTROLLED' || !r.huntNumber) {
      deduped.push(r);
      continue;
    }
    const k = `${r.species}|${r.huntNumber}`;
    const prev = seen.get(k);
    const score = (x: Prisma.HuntSummaryCreateManyInput) => (x.openDate ? 2 : 0) + (x.tags ? 1 : 0) + (x.huntId > 0 ? 4 : 0);
    if (!prev) {
      seen.set(k, r);
      deduped.push(r);
    } else if (score(r) > score(prev)) {
      deduped[deduped.indexOf(prev)] = r;
      seen.set(k, r);
    }
  }
  if (deduped.length < out.length) details.push(`Merged ${out.length - deduped.length} duplicate controlled-hunt listings`);
  out.length = 0;
  out.push(...deduped);

  await db.$transaction(
    async (tx) => {
      await tx.huntSummary.deleteMany({});
      await tx.huntSummary.createMany({ data: out });
    },
    { timeout: 120_000 },
  );
  return { rows: out.length, details: details.slice(0, 200) };
}
