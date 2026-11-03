import type { DrawOdds, Prisma } from '@prisma/client';
import { boundarySince } from '../../lib/boundaries';
import { db, thisYear, type StepResult } from '../core/context';
import { unitsFromName, parentUnit } from '../core/parse';
import { seasonsClass, seasonRules } from '../../lib/tagSeasons';
import { scoreHunts } from '../../lib/score';
import { loadElkTagSeasons, loadDeerTagSeasons, loadElkZones, type TagSeason } from '../core/datafiles';
import {
  lineage,
  summarizeOdds,
  summarizeHarvest,
  tagAndFill,
  BOUNDARY_CHANGED_2022,
  monthsOpen,
  odds as capOdds,
  validHarvest,
  type OddsRow,
  type HarvestRow,
  type SpeciesName,
} from '../core/math';

const METHOD: Record<string, string> = { ANY: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };

const month = (d: Date | null) => (d ? d.getUTCMonth() + 1 : null);

/** Rebuilds the filter-ready HuntSummary table from the raw tables. Pure DB work - no IDFG requests. */
export async function buildSummaries(): Promise<StepResult> {
  const details: string[] = [];
  const [hunts, odds, areas, unitRows] = await Promise.all([
    db.hunt.findMany(),
    db.drawOdds.findMany({ where: { draw: { in: [1, 2] } } }),
    db.huntArea.findMany({ select: { areaId: true, name: true, publicPct: true, privatePct: true, accessYesAcres: true, accessYesCount: true, units: true, acres: true } }),
    db.unit.findMany({ select: { name: true, publicPct: true, privatePct: true, accessYesAcres: true, accessYesCount: true, acres: true } }),
  ]);
  const unitMap = new Map(unitRows.map((u) => [u.name, u]));
  const areaMap = new Map(areas.map((a) => [a.areaId, a]));
  // second drawing (leftover tags): species|year|hunt -> row; the rest is the main drawing
  const second = new Map(odds.filter((o) => o.draw === 2).map((o) => [`${o.species}|${o.year}|${o.huntNumber}`, o]));
  const oddsBy = new Map<string, DrawOdds[]>(); // species|area
  for (const o of odds.filter((x) => x.draw === 1)) (oddsBy.get(`${o.species}|${o.areaName}`) ?? oddsBy.set(`${o.species}|${o.areaName}`, []).get(`${o.species}|${o.areaName}`)!).push(o);

  const out: Prisma.HuntSummaryCreateManyInput[] = [];

  // nonresident general tags: latest draw per tag, for the general-season rows they unlock
  const nrDraws = new Map<string, { year: number; tags: number; applied: number[]; drew: number[] }>();
  for (const d of await db.nrDraw.findMany({ orderBy: { year: 'asc' } })) nrDraws.set(d.code, d);
  const elkZones = loadElkZones().zones;
  const elkSeasons = loadElkTagSeasons();
  type NrOdds = { label: string; code: string; odds: number | null; applied: number; drew: number; tags: number; year: number };
  /** The nonresident tag(s) a general season needs: deer = the unit's Regular (and White-tailed) tag, elk = the zone tag(s) with a season for this weapon. */
  const nrTagsFor = (species: string, unit: string, weapon: string): NrOdds[] => {
    if (species !== 'DEER' && species !== 'ELK') return []; // general tags exist for deer and elk only
    const mk = (label: string, code: string, key: string): NrOdds | null => {
      const d = nrDraws.get(key);
      return d ? { label, code, odds: capOdds(d.drew[0], d.applied[0]), applied: d.applied[0] ?? 0, drew: d.drew[0] ?? 0, tags: d.tags, year: d.year } : null;
    };
    if (species === 'DEER') {
      const [, n, sfx] = unit.match(/^(\d+)([A-Z]?)$/) ?? [];
      if (!n) return [];
      const code = `${n.padStart(2, '0')}${sfx}`;
      return [mk('Regular Deer tag', `RD${code}`, `RD${code}`), mk('White-tailed Deer tag', `WD${code}`, `WD${code}`)].filter((x): x is NrOdds => !!x);
    }
    const zone = elkZones.find((z) => z.units.includes(unit));
    if (!zone) return [];
    const want = weapon === 'ANY' ? ['ANY', 'SHORT_RANGE'] : [weapon];
    const zs = elkSeasons?.zones.find((z) => z.zone.toLowerCase() === zone.zone.toLowerCase());
    return zone.tags
      .filter((t) => !zs || (zs.tags[t.tag]?.seasons ?? []).some((x) => want.includes(x.weapon)))
      .map((t) => mk(`${zone.zone} ${t.tag} tag`, t.code, `ELK:${zone.zone}:${t.tag}`))
      .filter((x): x is NrOdds => !!x);
  };
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
        .filter((o) => o.draw === 1 && o.species === h.species && o.huntNumber === h.huntNumber && o.year <= h.year && (!h.areaName || o.areaName === h.areaName))
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
      // leftover tags: the most recent second drawing this hunt (by its number that year) was in
      const left = [...lin.entries()].sort((a, b) => b[0] - a[0]).map(([y, n]) => second.get(`${h.species}|${y}|${n}`)).find((x) => x && (x.permits ?? 0) > 0);
      const leftover = left ? { leftoverYear: left.year, leftoverTags: left.permits, leftoverApps: left.apps1, leftoverDrew: left.drew1 } : {};

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
        ...leftover,
        oddsYears,
        appsLast: o.resAppsLast === null && o.nrAppsLast === null ? null : (o.resAppsLast ?? 0) + (o.nrAppsLast ?? 0),
        success5: hs.success5,
        hunters5: hs.hunters5,
        harvest5: hs.harvest5,
        whitetailPct5: hs.whitetailPct5,
        deerType: hs.deerType,
        bigPct5: hs.bigPct5,
        avgSize5: hs.avgSize5,
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

    // general hunt: one row per unit (named in the hunt title when possible), using that unit's harvest for the same weapon.
    // Listings with no weapon are controlled hunts IDFG linked by a bare area code ("10A"): skip them.
    if (h.weapon === 'OTHER') continue;
    const named = unitsFromName(h.name);
    for (const unit of named.length ? named : h.units) {
      const method = METHOD[h.weapon] ?? 'All Weapons Combined';
      // a unit redrawn by IDFG: only seasons on the current ground count toward the 5-yr numbers
      const since = boundarySince(unit) ?? 0;
      const rows = await db.generalHarvest.findMany({ where: { species: h.species, unit, takeMethod: method, year: { gte: Math.max(thisYear() - 6, since) } } });
      const hs = summarizeHarvest(h.species, rows as HarvestRow[]);
      const u = unitMap.get(unit);
      // general seasons from the regulations for this unit and weapon (deer: Regular Deer tag table, elk: the
      // zone's A and B tag seasons). Fills the "see regulations" dates on harvest-derived rows.
      // Always kept as tagSeasons (they carry the antler rules: "2-point deer only", "antlered" only); their
      // dates are used only when the listing has none.
      const gs = generalSeasons(h.species, unit, h.weapon);
      const gspans = h.openDate ? [] : (gs?.seasons ?? []).flatMap((x) => x.dates).map((d) => ({ open: new Date(`${d.open}T00:00:00Z`), close: new Date(`${d.close}T00:00:00Z`) }));
      const gdates: Partial<Prisma.HuntSummaryCreateManyInput> & { openDate?: Date; closeDate?: Date } = {
        ...(gs ? { tagSeasons: JSON.parse(JSON.stringify({ year: gs.year, seasons: gs.seasons })) as Prisma.InputJsonValue, antlerClass: seasonsClass(gs.seasons) } : {}),
        ...(gspans.length
          ? {
              openDate: new Date(Math.min(...gspans.map((d) => +d.open))),
              closeDate: new Date(Math.max(...gspans.map((d) => +d.close))),
              months: [...new Set(gspans.flatMap((d) => monthsOpen(d.open, d.close)))],
            }
          : {}),
      };
      if (gdates.openDate) Object.assign(gdates, { openMonth: gdates.openDate.getUTCMonth() + 1, closeMonth: gdates.closeDate!.getUTCMonth() + 1 });
      // nonresidents need the unit's / zone's tag to hunt this season: carry its draw odds
      const nrt = nrTagsFor(h.species, unit, h.weapon);
      const primary = h.species === 'DEER' ? nrt[0] : nrt.slice().sort((a, b) => (b.odds ?? 0) - (a.odds ?? 0))[0];
      const nrFields = primary
        ? {
            nrTagOdds: JSON.parse(JSON.stringify(nrt)) as Prisma.InputJsonValue,
            nrOddsLast: primary.odds,
            nrOdds5: primary.odds,
            nrAppsLast: primary.applied,
            oddsLastYear: primary.year,
            nrTagAndFill: tagAndFill(primary.odds, hs.success5),
            tagCode: nrt.map((x) => x.code).join(' / '),
          }
        : {};
      out.push({
        ...base,
        ...gdates,
        ...nrFields,
        // residents buy general tags over the counter: drawing is certain, so draw x fill = success
        resTagAndFill: hs.success5,
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
    // crowding: average yearly hunters for this hunt / season (same years as its success) per square mile
    if (r.hunters5 && r.harvestYears && r.acres) r.huntersSqMi = r.hunters5 / r.harvestYears / (r.acres / 640);
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

  // DrawOdds Score: ranks need every hunt, so it runs once all rows are built
  const scores = scoreHunts(out.map((r) => ({
    id: r.id, species: r.species, type: r.type, nrTag: r.nrTag, weapon: r.weapon, antlerClass: r.antlerClass,
    hunters5: r.hunters5, harvest5: r.harvest5, huntersSqMi: r.huntersSqMi, publicPct: r.publicPct, huntablePct: r.huntablePct,
    bigPct5: r.bigPct5, deerType: r.deerType, twoPoint: seasonRules(r.tagSeasons, r.species).includes('2-point bucks only'),
    resOdds5: r.resOdds5, nrOdds5: r.nrOdds5, capped: r.capped,
  })));
  for (const r of out) Object.assign(r, scores.get(r.id));
  details.push(`DrawOdds Score: ${[...scores.values()].filter((s) => s.scoreQuality !== null).length} of ${out.length} hunts scored`);

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
  h: { idfgId: number; species: SpeciesName; rawText: string | null; units: string[] },
  base: Omit<Prisma.HuntSummaryCreateManyInput, 'id'>,
  unitMap: Map<string, UnitRow>,
): Promise<Prisma.HuntSummaryCreateManyInput | null> {
  const [, key, code] = (h.rawText ?? '').split('|');
  if (!key) return null;
  const [draw, quota] = await Promise.all([
    db.nrDraw.findFirst({ where: { code: key }, orderBy: { year: 'desc' } }),
    code ? db.nrQuota.findFirst({ where: { code }, orderBy: { year: 'desc' } }) : null,
  ]);
  // elk A/B tags: only the weapons this tag's seasons allow (A and B differ); deer tags: all weapons
  const tagLetter = key.startsWith('ELK:') ? key.split(':')[2] : null;
  const tagSeasonsAll = tagLetter ? loadElkTagSeasons()?.zones.find((z) => z.zone.toLowerCase() === key.split(':')[1].toLowerCase())?.tags[tagLetter] : undefined;
  const TM: Record<string, string> = { ANY: 'Any Weapon', SHORT_RANGE: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };
  const methods = tagSeasonsAll?.seasons.length ? [...new Set(tagSeasonsAll.seasons.map((x) => TM[x.weapon]).filter(Boolean))] : ['All Weapons Combined'];
  const gen = await db.generalHarvest.findMany({
    where: { species: h.species, unit: { in: h.units }, takeMethod: { in: methods }, year: { gte: thisYear() - 6 } },
  });
  const lastYear = Math.max(0, ...gen.map((g) => g.year));
  // per unit, skip seasons before that unit's boundary change
  const recent = gen.filter((g) => g.year > lastYear - 5 && g.year >= (boundarySince(g.unit) ?? 0) && validHarvest(g));
  const hunters = recent.reduce((a, g) => a + (g.hunters ?? 0), 0);
  const harvest = recent.reduce((a, g) => a + (g.harvest ?? 0), 0);
  const success = hunters ? harvest / hunters : null;
  // trophy share and mule/whitetail split: same math as a general season, on the units' totals per year
  const perYear = new Map<number, HarvestRow>();
  const F = ['hunters', 'harvest', 'antlered', 'antlerless', 'estWt', 'estMule', 'est4', 'est5', 'estSpike', 'est6'] as const;
  for (const g of recent) {
    const y = perYear.get(g.year) ?? perYear.set(g.year, { year: g.year } as HarvestRow).get(g.year)!;
    for (const k of F) {
      const v = (g as unknown as Record<string, number | null>)[k];
      if (v !== null && v !== undefined) (y as unknown as Record<string, number>)[k] = ((y as unknown as Record<string, number | undefined>)[k] ?? 0) + v;
    }
  }
  for (const y of perYear.values()) for (const k of F) if ((y as unknown as Record<string, unknown>)[k] === undefined) (y as unknown as Record<string, null>)[k] = null;
  const hs = summarizeHarvest(h.species, [...perYear.values()]);
  const nrOdds = draw ? capOdds(draw.drew[0], draw.applied[0]) : null;
  const us = h.units.map((u) => unitMap.get(u)).filter((u): u is UnitRow => !!u && !!u.acres);
  const acres = us.reduce((a, u) => a + u.acres!, 0);
  const wavg = (f: (u: UnitRow) => number | null) => {
    const w = us.filter((u) => f(u) !== null);
    const tot = w.reduce((a, u) => a + u.acres!, 0);
    return tot ? w.reduce((a, u) => a + f(u)! * u.acres!, 0) / tot : null;
  };
  const zone = key.startsWith('ELK:') ? key.split(':')[1] : null;
  // the tag's seasons from the regulations (elk: zone A/B tables; deer: RD / WD unit tables). Dates feed the
  // Season Dates filter and the tag's open/close; weapons feed the weapon filter.
  let seasons: TagSeason[] = [];
  let ts: { year: number } | null = null;
  if (zone) {
    const elk = loadElkTagSeasons();
    ts = elk;
    seasons = elk?.zones.find((z) => z.zone.toLowerCase() === zone.toLowerCase())?.tags[key.split(':')[2]]?.seasons ?? [];
  } else {
    const deer = loadDeerTagSeasons();
    ts = deer;
    const kind = key.slice(0, 2) as 'RD' | 'WD';
    seasons = (deer?.tags[kind]?.[h.units[0]] ?? []).map((x) => ({ ...x, sex: x.qualifier ? `${x.sex} (${x.qualifier.toLowerCase()})` : x.sex }));
  }
  const spans = seasons.flatMap((x) => x.dates).map((d) => ({ open: new Date(`${d.open}T00:00:00Z`), close: new Date(`${d.close}T00:00:00Z`) }));
  const months = [...new Set(spans.flatMap((d) => monthsOpen(d.open, d.close)))];
  const openDate = spans.length ? new Date(Math.min(...spans.map((d) => +d.open))) : null;
  const closeDate = spans.length ? new Date(Math.max(...spans.map((d) => +d.close))) : null;
  return {
    ...base,
    id: `t:${key}`,
    nrTag: true,
    tagCode: code || null,
    tagSeasons: seasons.length
      ? (JSON.parse(JSON.stringify({ year: ts!.year, seasons, residentQuota: (tagSeasonsAll as { residentQuota?: number } | undefined)?.residentQuota ?? null })) as Prisma.InputJsonValue)
      : undefined,
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
    whitetailPct5: hs.whitetailPct5,
    deerType: hs.deerType,
    bigPct5: hs.bigPct5,
    antlerlessShare5: hs.antlerlessShare5,
    harvestYears: new Set(recent.map((g) => g.year)).size,
    harvestLastYear: lastYear || null,
    // latest season and the one before, summed across the tag's units (cards show these with the change)
    successLast: yearSuccess(recent, lastYear),
    successPrev: yearSuccess(recent, lastYear - 1),
    smallSample: hunters < 50,
    nrTagAndFill: tagAndFill(nrOdds, success),
    // residents: elk zone A/B tags are over the counter unless the zone is capped
    resTagAndFill: h.species === 'ELK' && !(quota?.capped ?? false) ? success : null,
    publicPct: wavg((u) => u.publicPct),
    privatePct: wavg((u) => u.privatePct),
    accessYesAcres: us.reduce((a, u) => a + (u.accessYesAcres ?? 0), 0),
    accessYesCount: us.reduce((a, u) => a + (u.accessYesCount ?? 0), 0),
    acres: acres || null,
    boundaryChanged: false,
  };
}

/** General seasons for a unit + weapon from the parsed regulations (null when the tables don't cover it). */
function generalSeasons(species: string, unit: string, weapon: string): { year: number; seasons: TagSeason[] } | null {
  if (species !== 'DEER' && species !== 'ELK') return null;
  const want = weapon === 'ANY' ? ['ANY', 'SHORT_RANGE'] : [weapon];
  if (species === 'DEER') {
    const deer = loadDeerTagSeasons();
    const list = (deer?.tags.RD[unit] ?? deer?.tags.WD[unit] ?? [])
      .filter((x) => want.includes(x.weapon))
      .map((x) => ({ ...x, sex: x.qualifier ? `${x.sex} (${x.qualifier.toLowerCase()})` : x.sex }));
    return deer && list.length ? { year: deer.year, seasons: list } : null;
  }
  const elk = loadElkTagSeasons();
  const zone = elk?.zones.find((z) => (z as unknown as { units?: string[] }).units?.includes(unit));
  if (!elk || !zone) return null;
  const list = Object.entries(zone.tags).flatMap(([tag, t]) => (t.seasons ?? []).filter((x) => want.includes(x.weapon)).map((x) => ({ ...x, sex: `${tag} tag · ${x.sex}` })));
  return list.length ? { year: elk.year, seasons: list } : null;
}

function yearSuccess(rows: { year: number; hunters: number | null; harvest: number | null }[], year: number): number | null {
  const ys = rows.filter((g) => g.year === year);
  const hunters = ys.reduce((a, g) => a + (g.hunters ?? 0), 0);
  const harvest = ys.reduce((a, g) => a + (g.harvest ?? 0), 0);
  return hunters && harvest <= hunters ? harvest / hunters : null;
}

