import type { DrawOdds, Prisma } from '@prisma/client';
import { db, thisYear, type StepResult } from '../core/context';
import { unitsFromName, parentUnit } from '../core/parse';
import { loadElkTagSeasons } from '../core/datafiles';
import {
  lineage,
  summarizeOdds,
  summarizeHarvest,
  tagAndFill,
  BOUNDARY_CHANGED_2022,
  monthsOpen,
  odds as capOdds,
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
  // only this season's hunts get listed; older rows survive only because someone saved them
  // the season = the most common year among current listings (not the max: Jan-Mar hunts carry next year's date)
  const yc = new Map<number, number>();
  for (const h of hunts) if (h.source === 'regs' || h.source === 'huntlist') yc.set(h.year, (yc.get(h.year) ?? 0) + 1);
  const season = [...yc.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  let skippedOld = 0;

  for (const h of hunts) {
    if (h.year < season) {
      skippedOld++;
      continue;
    }
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

    if (h.source === 'nrtag') {
      const row = await nrTagSummary(h, base, unitMap);
      if (row) out.push(row);
      continue;
    }

    if (h.type === 'CONTROLLED' && h.huntNumber) {
      // the hunt's most recent drawing-odds row tells us its area
      // IDFG reuses hunt numbers across areas: the drawing history must be for this hunt's area
      const cur = odds
        .filter((o) => o.species === h.species && o.huntNumber === h.huntNumber && o.year <= h.year && (!h.areaName || o.areaName === h.areaName))
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
        appsLast: o.resAppsLast === null && o.nrAppsLast === null ? null : (o.resAppsLast ?? 0) + (o.nrAppsLast ?? 0),
        success5: hs.success5,
        hunters5: hs.hunters5,
        harvest5: hs.harvest5,
        whitetailPct5: hs.whitetailPct5,
        deerType: hs.deerType,
        bigPct5: hs.bigPct5,
        antlerlessShare5: hs.antlerlessShare5,
        harvestYears: hs.years,
        smallSample: hs.smallSample,
        harvestLastYear: hs.harvestLastYear,
        successLast: hs.successLast,
        successPrev: hs.successPrev,
        // regs say "Unlimited" or a tag count wasn't parsed: fall back to the latest drawing's permits
        tags: h.tags ?? cur.permits,
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
        harvestLastYear: hs.harvestLastYear,
        successLast: hs.successLast,
        successPrev: hs.successPrev,
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
  if (skippedOld) details.push(`Skipped ${skippedOld} hunts from earlier seasons (kept only because they're saved)`);
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

type UnitRow = { name: string; publicPct: number | null; privatePct: number | null; accessYesAcres: number | null; accessYesCount: number | null; acres: number | null };

/**
 * One nonresident general tag (elk zone A/B, deer RD/WD unit): latest draw (1st-choice odds), newest quota,
 * general-season success across its units (all weapons, last 5 seasons) and acreage-weighted land numbers.
 */
async function nrTagSummary(
  h: { idfgId: number; species: 'DEER' | 'ELK'; rawText: string | null; units: string[] },
  base: Omit<Prisma.HuntSummaryCreateManyInput, 'id'>,
  unitMap: Map<string, UnitRow>,
): Promise<Prisma.HuntSummaryCreateManyInput | null> {
  const [, key, code] = (h.rawText ?? '').split('|');
  if (!key) return null;
  const [draw, quota] = await Promise.all([
    db.nrDraw.findFirst({ where: { code: key }, orderBy: { year: 'desc' } }),
    code ? db.nrQuota.findFirst({ where: { code }, orderBy: { year: 'desc' } }) : null,
  ]);
  const gen = await db.generalHarvest.findMany({
    where: { species: h.species, unit: { in: h.units }, takeMethod: 'All Weapons Combined', year: { gte: thisYear() - 6 } },
  });
  const lastYear = Math.max(0, ...gen.map((g) => g.year));
  const recent = gen.filter((g) => g.year > lastYear - 5);
  const hunters = recent.reduce((a, g) => a + (g.hunters ?? 0), 0);
  const harvest = recent.reduce((a, g) => a + (g.harvest ?? 0), 0);
  const success = hunters ? harvest / hunters : null;
  const nrOdds = draw ? capOdds(draw.drew[0], draw.applied[0]) : null;
  const us = h.units.map((u) => unitMap.get(u)).filter((u): u is UnitRow => !!u && !!u.acres);
  const acres = us.reduce((a, u) => a + u.acres!, 0);
  const wavg = (f: (u: UnitRow) => number | null) => {
    const w = us.filter((u) => f(u) !== null);
    const tot = w.reduce((a, u) => a + u.acres!, 0);
    return tot ? w.reduce((a, u) => a + f(u)! * u.acres!, 0) / tot : null;
  };
  const zone = key.startsWith('ELK:') ? key.split(':')[1] : null;
  // elk A/B tag seasons from the regulations: dates feed the Season Dates filter and the tag's open/close
  const tagLetter = key.split(':')[2];
  const ts = zone ? loadElkTagSeasons() : null;
  const seasons = ts?.zones.find((z) => z.zone.toLowerCase() === zone!.toLowerCase())?.tags[tagLetter]?.seasons ?? [];
  const spans = seasons.flatMap((x) => x.dates).map((d) => ({ open: new Date(`${d.open}T00:00:00Z`), close: new Date(`${d.close}T00:00:00Z`) }));
  const months = [...new Set(spans.flatMap((d) => monthsOpen(d.open, d.close)))];
  const openDate = spans.length ? new Date(Math.min(...spans.map((d) => +d.open))) : null;
  const closeDate = spans.length ? new Date(Math.max(...spans.map((d) => +d.close))) : null;
  return {
    ...base,
    id: `t:${key}`,
    nrTag: true,
    tagCode: code || null,
    tagSeasons: seasons.length ? (JSON.parse(JSON.stringify({ year: ts!.year, seasons })) as Prisma.InputJsonValue) : undefined,
    weapons: [...new Set(seasons.map((x) => x.weapon))],
    months,
    openDate,
    closeDate,
    openMonth: openDate ? openDate.getUTCMonth() + 1 : null,
    closeMonth: closeDate ? closeDate.getUTCMonth() + 1 : null,
    areaName: zone ? `${zone} Zone` : h.units[0],
    unit: zone ? null : h.units[0],
    units: h.units,
    quota: quota?.quota ?? null,
    quotaYear: quota?.year ?? null,
    capped: quota?.capped ?? false,
    tags: quota?.quota ?? draw?.tags ?? null,
    nrDraw: draw ? { year: draw.year, tags: draw.tags, applied: draw.applied, drew: draw.drew } : undefined,
    nrOddsLast: nrOdds,
    nrOdds5: nrOdds,
    nrAppsLast: draw?.applied[0] ?? null,
    appsLast: draw?.applied[0] ?? null,
    oddsLastYear: draw?.year ?? null,
    oddsYears: draw ? 1 : 0,
    success5: success,
    hunters5: hunters || null,
    harvest5: harvest || null,
    harvestYears: new Set(recent.map((g) => g.year)).size,
    harvestLastYear: lastYear || null,
    smallSample: hunters < 50,
    nrTagAndFill: tagAndFill(nrOdds, success),
    publicPct: wavg((u) => u.publicPct),
    privatePct: wavg((u) => u.privatePct),
    accessYesAcres: us.reduce((a, u) => a + (u.accessYesAcres ?? 0), 0),
    accessYesCount: us.reduce((a, u) => a + (u.accessYesCount ?? 0), 0),
    acres: acres || null,
    boundaryChanged: false,
  };
}
