import { db, HP_BASE, SPECIES, thisYear, type StepResult } from '../core/context';
import { get } from '../core/http';
import { parseHuntList, normArea, unitsFromName, type ListedHunt } from '../core/parse';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface RegsHunt {
  species: 'DEER' | 'ELK';
  huntNumber: number;
  area: string;
  tags: number | null;
  open: string;
  close: string;
  weapon: 'ANY' | 'ARCHERY' | 'MUZZLELOADER' | 'SHORT_RANGE';
  antlerClass: 'ANTLERED' | 'ANTLERLESS' | 'EITHER';
  youthOnly: boolean;
  section: string;
  notes: string;
}

/** Every controlled hunt for the season, parsed from IDFG's regulations PDF (scripts/parse_regs.py). */
export function loadRegs(season: number): RegsHunt[] {
  for (const y of [season, season - 1]) {
    const f = join(process.cwd(), 'data', `controlled-hunts-${y}.json`);
    if (existsSync(f)) return (JSON.parse(readFileSync(f, 'utf8')) as { hunts: RegsHunt[] }).hunts;
  }
  return [];
}

const WEAPON_LABEL = { ANY: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader', SHORT_RANGE: 'Short-range only' } as const;
const SEX_LABEL = { ANTLERED: 'Antlered', ANTLERLESS: 'Antlerless', EITHER: 'Either sex' } as const;
/** Stable negative id for hunts that aren't on IDFG's hunt lists (closed for the year, or general seasons). */
export function syntheticId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return -((h >>> 1) || 1);
}

/**
 * This season's hunts, from IDFG's per-unit hunt lists (huntlist.aspx), for deer and elk.
 * A hunt appears on the list of every unit it touches; we accumulate the units.
 */
export async function syncHunts(): Promise<StepResult> {
  const details: string[] = [];
  const units = await db.unit.findMany({ where: { idfgId: { not: null } }, select: { name: true, idfgId: true } });
  if (units.length < 90) return { rows: 0, status: 'ERROR', details: [`Only ${units.length} units with Hunt Planner IDs - run the land step first`] };

  const found = new Map<number, ListedHunt & { species: 'DEER' | 'ELK'; units: Set<string> }>();
  for (const { code, species } of SPECIES) {
    for (const u of units) {
      try {
        const html = await get(`${HP_BASE}huntlist.aspx?Areas=Unit&AreasID=${u.idfgId}&BigGameID=${code}`);
        for (const h of parseHuntList(html)) {
          const prev = found.get(h.idfgId);
          if (prev) prev.units.add(u.name);
          else found.set(h.idfgId, { ...h, species, units: new Set([u.name]) });
        }
      } catch (e) {
        details.push(`${species} unit ${u.name}: ${(e as Error).message}`);
      }
    }
  }
  if (found.size < 200) return { rows: found.size, status: 'ERROR', details: [`Only ${found.size} hunts parsed - page layout may have changed`, ...details] };

  // the hunt lists also show past seasons, and IDFG reuses hunt numbers: keep only the newest season
  // the season = the most common opening year (not the max: a January opener would look like next year)
  const counts = new Map<number, number>();
  for (const h of found.values()) if (h.open) counts.set(Number(h.open.slice(0, 4)), (counts.get(Number(h.open.slice(0, 4))) ?? 0) + 1);
  const season = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? thisYear();
  let dropped = 0;
  for (const [id, h] of found) {
    // drop listings that ended before this season (a Dec-Jan hunt from last season closes in Jan of this year)
    if (h.close && Number(h.close.slice(0, 4)) < season || (h.open && Number(h.open.slice(0, 4)) < season - 1)) {
      found.delete(id);
      dropped++;
    }
  }
  if (dropped) details.push(`Dropped ${dropped} listings from earlier seasons (kept ${season})`);
  const year = season;
  const noDates = [...found.values()].filter((h) => !h.open).length;
  if (noDates > found.size * 0.2) details.push(`${noDates} of ${found.size} hunts have no parsed dates - check parseHuntList`);

  // The hunt lists only show hunts that haven't closed yet. The regs list every controlled hunt for the
  // season, so they are the master list for controlled hunts: fill in anything missing and correct
  // dates / tags / weapon / sex from them.
  // Outfitter allocation tags are sold through outfitters, not the public draw: no odds to show, so don't list them
  const allRegs = loadRegs(season);
  const outfitter = new Set(allRegs.filter((r) => /outfitter/i.test(r.section)).map((r) => `${r.species}|${r.huntNumber}`));
  const regs = allRegs.filter((r) => !outfitter.has(`${r.species}|${r.huntNumber}`));
  if (outfitter.size) details.push(`Skipped ${outfitter.size} outfitter-allocation hunts (not in the public draw)`);
  if (!regs.length) details.push(`No data/controlled-hunts-${season}.json - controlled hunts that already closed this season will be missing`);
  type Row = Parameters<typeof db.hunt.create>[0]['data'];
  const rows = new Map<number, Row>();
  for (const h of found.values()) {
    rows.set(h.idfgId, {
      idfgId: h.idfgId,
      year: h.open ? Number(h.open.slice(0, 4)) : year,
      species: h.species,
      type: h.type,
      huntNumber: h.huntNumber,
      source: 'huntlist',
      name: h.name,
      takeMethod: h.takeMethod,
      weapon: h.weapon,
      antlerClass: h.antlerClass,
      sexText: h.sexText,
      openDate: h.open ? new Date(`${h.open}T00:00:00Z`) : null,
      closeDate: h.close ? new Date(`${h.close}T00:00:00Z`) : null,
      tags: h.tags,
      youthOnly: h.youthOnly,
      units: [...h.units].sort(),
      rawText: h.text,
    });
  }
  // hunts already stored this season (seen on an earlier night, before they closed) count as listed too
  const stored = await db.hunt.findMany({ where: { year: { gte: season } } });
  for (const h of stored) {
    if (!rows.has(h.idfgId) && h.source !== 'regs' && h.source !== 'harvest') {
      const { updatedAt: _u, ...data } = h;
      rows.set(h.idfgId, data as Row);
    }
  }
  for (const [id, x] of rows) if (x.type === 'CONTROLLED' && outfitter.has(`${x.species}|${x.huntNumber}`)) rows.delete(id);
  let added = 0;
  let corrected = 0;
  for (const r of regs) {
    const listed = [...rows.values()].find((x) => x.type === 'CONTROLLED' && x.species === r.species && x.huntNumber === r.huntNumber && (x.idfgId as number) > 0);
    const fromRegs = {
      year: season,
      areaName: normArea(r.area),
      takeMethod: WEAPON_LABEL[r.weapon],
      weapon: r.weapon,
      antlerClass: r.antlerClass,
      sexText: SEX_LABEL[r.antlerClass],
      openDate: new Date(`${r.open}T00:00:00Z`),
      closeDate: new Date(`${r.close}T00:00:00Z`),
      tags: r.tags,
      youthOnly: r.youthOnly,
    };
    if (listed) {
      Object.assign(listed, fromRegs);
      corrected++;
    } else {
      const idfgId = syntheticId(`regs|${season}|${r.species}|${r.huntNumber}`);
      rows.set(idfgId, {
        idfgId,
        ...fromRegs,
        species: r.species,
        type: 'CONTROLLED',
        huntNumber: r.huntNumber,
        source: 'regs',
        name: `${r.species === 'DEER' ? 'Deer' : 'Elk'} Controlled Hunt ${r.huntNumber}`,
        units: [],
        rawText: [r.section, r.notes].filter(Boolean).join(' - '),
      });
      added++;
    }
  }
  details.push(`Regs: ${regs.length} controlled hunts; ${corrected} matched IDFG's hunt lists, ${added} added (closed for the year or not listed)`);

  // General seasons that closed before we first saw them: one row per unit + weapon that had general-season
  // hunters in the last two years, so every unit's general season can be found. Dates aren't known for these.
  const METHOD: Record<string, 'ANY' | 'ARCHERY' | 'MUZZLELOADER'> = { 'Any Weapon': 'ANY', Archery: 'ARCHERY', Muzzleloader: 'MUZZLELOADER' };
  const covered = new Set<string>();
  for (const x of rows.values()) {
    if (x.type !== 'GENERAL') continue;
    const us = unitsFromName(x.name as string);
    for (const u of us.length ? us : ((x.units as string[]) ?? [])) covered.add(`${x.species}|${u}|${x.weapon}`);
  }
  const recent = await db.generalHarvest.findMany({
    where: { year: { gte: season - 2 }, takeMethod: { in: Object.keys(METHOD) }, hunters: { gt: 0 } },
    select: { species: true, unit: true, takeMethod: true },
    distinct: ['species', 'unit', 'takeMethod'],
  });
  let generals = 0;
  for (const g of recent) {
    const weapon = METHOD[g.takeMethod];
    const key = `${g.species}|${g.unit}|${weapon}`;
    if (covered.has(key)) continue;
    covered.add(key);
    const idfgId = syntheticId(`general|${season}|${key}`);
    const label = g.species === 'DEER' ? 'Deer' : 'Elk';
    rows.set(idfgId, {
      idfgId,
      year: season,
      species: g.species,
      type: 'GENERAL',
      huntNumber: null,
      source: 'harvest',
      name: `Unit ${g.unit} General ${label} - ${WEAPON_LABEL[weapon]}`,
      takeMethod: WEAPON_LABEL[weapon],
      weapon,
      antlerClass: 'EITHER',
      sexText: 'See regulations',
      openDate: null,
      closeDate: null,
      tags: null,
      youthOnly: false,
      units: [g.unit],
      rawText: 'Season dates and antler rules: see the IDFG regulations for this unit.',
    });
    generals++;
  }
  if (generals) details.push(`Added ${generals} general seasons from harvest data (already closed this year)`);

  await db.$transaction(async (tx) => {
    for (const data of rows.values()) {
      await tx.hunt.upsert({ where: { idfgId: data.idfgId }, create: data, update: data });
    }
    // Keep this season's hunts even when they drop off IDFG's lists (they closed). Drop older seasons
    // nobody saved, and stand-in rows that a real IDFG listing has since replaced.
    await tx.hunt.deleteMany({ where: { year: { lt: season }, saved: { none: {} } } });
    await tx.hunt.deleteMany({ where: { year: { gte: season }, source: { in: ['regs', 'harvest'] }, idfgId: { notIn: [...rows.keys()] }, saved: { none: {} } } });
    // and anything this season that is no longer listed anywhere (e.g. outfitter-allocation hunts)
    await tx.hunt.deleteMany({ where: { year: { gte: season }, idfgId: { notIn: [...rows.keys()] }, saved: { none: {} } } });
  }, { timeout: 180_000 });

  return { rows: rows.size, details };
}
