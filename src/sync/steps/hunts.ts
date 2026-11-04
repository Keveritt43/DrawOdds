import { db, HP_BASE, SPECIES, thisYear, type StepResult } from '../core/context';
import { get } from '../core/http';
import { parseHuntList, normArea, unitsFromName, type ListedHunt } from '../core/parse';
import { readFileSync, existsSync } from 'node:fs';
import { getBytes } from '../core/http';
import { pdfLines } from '../core/pdf';
import { join } from 'node:path';

interface RegsHunt {
  species: 'DEER' | 'ELK' | 'PRONGHORN';
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
const LABEL: Record<string, string> = { DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn Sheep', GOAT: 'Mountain Goat' };
const MSG = ['MOOSE', 'BIGHORN', 'GOAT'] as const;
const MON: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/**
 * Season dates for moose, bighorn sheep and mountain goat hunts from IDFG's two-year moose/sheep/goat
 * Seasons & Rules PDF ("seasons-rules-moose-sheep-goat-2025-26.pdf"). Rows read "<hunt #> <area> ... <tags> ...
 * <Mon d> - <Mon d>". Returns hunt # -> dates (and tags when they read cleanly); logs sample rows to check against.
 */
async function msgRegs(season: number, details: string[], wanted: number[] = []): Promise<Map<number, { open: string; close: string; tags: number | null; text: string }>> {
  const out = new Map<number, { open: string; close: string; tags: number | null; text: string }>();
  const names = [season - 1, season].map((y) => `seasons-rules-moose-sheep-goat-${y}-${String(y + 1).slice(2)}.pdf`);
  for (const name of names.reverse()) {
    const bytes = await getBytes(`https://idfg.idaho.gov/sites/default/files/${name}`);
    if (!bytes) continue;
    const lines = (await pdfLines(bytes)).flat().map((l) => l.replace(/\s+/g, ' ').trim());
    const DATE = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? ?(\d{1,2}) ?[-–—] ?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[a-z]*\.? ?(\d{1,2})/;
    const hits = lines.filter((l) => /^[3567]\d{3}\b/.test(l));
    console.log(`[hunts] ${name}: ${lines.length} text rows, ${hits.length} start with a moose/sheep/goat hunt number`);
    for (const l of hits.slice(0, 15)) console.log(`  | ${l.slice(0, 180)}`);
    // rows that start with the hunt number, plus any wanted hunt number found elsewhere on a line (rows can be
    // laid out in two columns or wrap: then the dates sit later on that line or on the next two lines)
    const cands: string[] = [...hits];
    for (const n of wanted) {
      if (hits.some((l) => l.startsWith(String(n)))) continue;
      const i = lines.findIndex((l) => new RegExp(`(^|\\s)${n}(\\s|$)`).test(l));
      if (i < 0) continue;
      const from = lines[i].slice(lines[i].search(new RegExp(`(^|\\s)${n}(\\s|$)`))).trim();
      cands.push([from, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ').slice(0, 400));
    }
    for (const l of cands) {
      const n = Number(l.slice(0, 4));
      const d = l.match(DATE);
      if (!d || out.has(n)) continue;
      const m1 = MON[d[1]], d1 = Number(d[2]), m2 = d[3] ? MON[d[3]] : m1, d2 = Number(d[4]);
      const y2 = m2 < m1 ? season + 1 : season;
      // tags: the first small number after the area and before the dates
      const before = l.slice(4, d.index).trim().split(' ');
      const tagTok = before.slice(1).find((t) => /^\d{1,3}$/.test(t));
      out.set(n, {
        open: `${season}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`,
        close: `${y2}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`,
        tags: tagTok ? Number(tagTok) : null,
        text: l.slice(0, 300),
      });
    }
    details.push(`Moose/sheep/goat regs ${name}: dates for ${out.size} hunts`);
    const missing = wanted.filter((n) => !out.has(n));
    if (missing.length) {
      details.push(`No dates found for hunts ${missing.join(', ')}`);
      for (const n of missing.slice(0, 6)) {
        const i = lines.findIndex((l) => l.includes(String(n)));
        console.log(`[hunts] ${n}: ${i < 0 ? 'not in the PDF text' : lines.slice(Math.max(0, i - 1), i + 3).join(' || ').slice(0, 300)}`);
      }
    }
    break;
  }
  if (!out.size) details.push('Moose/sheep/goat regs PDF not found or unreadable - those hunts are listed without dates');
  return out;
}
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
  const units = await db.unit.findMany({ where: { state: 'ID', idfgId: { not: null } }, select: { name: true, idfgId: true } });
  if (units.length < 90) return { rows: 0, status: 'ERROR', details: [`Only ${units.length} units with Hunt Planner IDs - run the land step first`] };

  const found = new Map<number, ListedHunt & { species: (typeof SPECIES)[number]['species']; units: Set<string> }>();
  // the unit hunt lists cover deer, elk and pronghorn; moose, sheep and goat come from the draw data below
  for (const { code, species } of SPECIES.filter((x) => ['DEER', 'ELK', 'PRONGHORN'].includes(x.species))) {
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
  const stored = await db.hunt.findMany({ where: { state: 'ID', year: { gte: season } } });
  for (const h of stored) {
    if (!rows.has(h.idfgId) && h.source !== 'regs' && h.source !== 'harvest' && h.source !== 'nrtag' && h.source !== 'odds') {
      const { updatedAt: _u, ...data } = h;
      rows.set(h.idfgId, data as Row);
    }
  }
  for (const [id, x] of rows) if (x.type === 'CONTROLLED' && outfitter.has(`${x.species}|${x.huntNumber}`)) rows.delete(id);
  // controlled listings whose hunt number couldn't be read can't be matched to odds or harvest; the regs list them
  for (const [id, x] of rows) if (x.type === 'CONTROLLED' && !x.huntNumber && regs.length) rows.delete(id);
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
        name: `${LABEL[r.species]} Controlled Hunt ${r.huntNumber}`,
        units: [],
        rawText: [r.section, r.notes].filter(Boolean).join(' - '),
      });
      added++;
    }
  }
  details.push(`Regs: ${regs.length} controlled hunts; ${corrected} matched IDFG's hunt lists, ${added} added (closed for the year or not listed)`);

  // Moose, bighorn sheep, mountain goat: every hunt in the latest drawing, with its area and tags; weapon and
  // sex from the latest harvest report for that hunt number; dates from the moose/sheep/goat regs PDF
  const wantedMsg = (await db.drawOdds.findMany({ where: { species: { in: [...MSG] }, draw: 1, year: { gte: season - 1 } }, select: { huntNumber: true }, distinct: ['huntNumber'] })).map((d) => d.huntNumber);
  const msgDates = await msgRegs(season, details, wantedMsg);
  let msgAdded = 0;
  for (const sp of MSG) {
    const latest = await db.drawOdds.findFirst({ where: { species: sp, draw: 1 }, orderBy: { year: 'desc' }, select: { year: true } });
    if (!latest) continue;
    const drawn = await db.drawOdds.findMany({ where: { species: sp, draw: 1, year: latest.year } });
    const harvest = await db.controlledHarvest.findMany({ where: { species: sp, huntNumber: { in: drawn.map((d) => d.huntNumber) } }, orderBy: { year: 'desc' } });
    for (const d of drawn) {
      const h = harvest.find((x) => x.huntNumber === d.huntNumber && x.areaName === d.areaName) ?? harvest.find((x) => x.huntNumber === d.huntNumber);
      const tm = (h?.takeMethod ?? '').toLowerCase();
      const weapon = tm.includes('archery') ? 'ARCHERY' : tm.includes('muzzle') ? 'MUZZLELOADER' : tm.includes('short') ? 'SHORT_RANGE' : 'ANY';
      // sex from what hunters took: only females -> antlerless (cow / ewe / nanny) hunt; any males -> antlered
      const hs = harvest.filter((x) => x.huntNumber === d.huntNumber);
      const males = hs.reduce((a, x) => a + (x.antlered ?? 0), 0);
      const females = hs.reduce((a, x) => a + (x.antlerless ?? 0), 0);
      const antlerClass = sp === 'GOAT' ? 'EITHER' : females > 0 && males === 0 ? 'ANTLERLESS' : 'ANTLERED';
      const reg = msgDates.get(d.huntNumber);
      const idfgId = syntheticId(`msg|${sp}|${d.huntNumber}`);
      rows.set(idfgId, {
        idfgId,
        year: season,
        species: sp,
        type: 'CONTROLLED',
        huntNumber: d.huntNumber,
        source: 'odds',
        name: `${LABEL[sp]} Controlled Hunt ${d.huntNumber}`,
        areaName: d.areaName,
        takeMethod: WEAPON_LABEL[weapon],
        weapon,
        antlerClass,
        sexText: SEX_LABEL[antlerClass],
        openDate: reg ? new Date(`${reg.open}T00:00:00Z`) : null,
        closeDate: reg ? new Date(`${reg.close}T00:00:00Z`) : null,
        tags: d.permits ?? reg?.tags ?? null,
        youthOnly: false,
        units: [],
        rawText: reg?.text ?? `From IDFG's ${latest.year} drawing results.`,
      });
      msgAdded++;
    }
  }
  details.push(`Moose / sheep / goat: ${msgAdded} hunts from the latest drawing`);

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
    where: { state: 'ID', year: { gte: season - 2 }, takeMethod: { in: Object.keys(METHOD) }, hunters: { gt: 0 } },
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
    await tx.hunt.deleteMany({ where: { state: 'ID', year: { lt: season }, source: { not: 'nrtag' }, saved: { none: {} } } });
    await tx.hunt.deleteMany({ where: { state: 'ID', year: { gte: season }, source: { in: ['regs', 'harvest', 'odds'] }, idfgId: { notIn: [...rows.keys()] }, saved: { none: {} } } });
    // and anything this season that is no longer listed anywhere (e.g. outfitter-allocation hunts)
    await tx.hunt.deleteMany({ where: { state: 'ID', year: { gte: season }, source: { not: 'nrtag' }, idfgId: { notIn: [...rows.keys()] }, saved: { none: {} } } });
  }, { timeout: 180_000 });

  return { rows: rows.size, details };
}
