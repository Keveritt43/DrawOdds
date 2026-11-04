/**
 * CPW statewide harvest estimates (deer; elk has the same layout with bulls / cows / calves).
 * 2025 on: one table by hunt code. 2019-2024: tables by unit for each season (2nd / 3rd / 4th rifle, archery,
 * muzzleloader...), some split into antlered and antlerless (those leave out private-land-only and either-sex codes).
 */
import type { Item } from './recap';
import { rowsOf } from './recap';

export interface CodeHarvest { code: string; male: number; female: number; young: number; harvest: number; hunters: number; successPct: number; days: number; few: boolean }
/** A unit's line in one season's table. Split tables: `male`/`female` hold [harvest, hunters]. */
export interface UnitHarvest {
  unit: string;
  harvest?: number; hunters?: number; successPct?: number; days?: number; male?: number; female?: number; young?: number;
  mHarvest?: number; mHunters?: number; fHarvest?: number; fHunters?: number;
}
export type SeasonKind = 'rifle1' | 'rifle2' | 'rifle3' | 'rifle4' | 'archery' | 'muzzle';
export interface UnitTables { totals: Partial<Record<SeasonKind, UnitHarvest[]>>; split: Partial<Record<SeasonKind, UnitHarvest[]>> }

const num = (s: string) => Number(s.replace(/[,%*]/g, ''));
const CODE = /^([DE][MFEP]\d{3}[A-Z0-9]\d[A-Z])(\*?)$/;

function texts(items: Item[]) {
  return rowsOf(items).map((r) => ({ items: r, text: r.map((i) => i.s.trim()).join(' ').replace(/\s+/g, ' ') }));
}

export function harvestYear(pages: Item[][]): number | null {
  for (const p of pages.slice(0, 3)) {
    const m = /(20\d\d) Colorado (Deer|Elk) Harvest Estimates/i.exec(texts(p).map((r) => r.text).join(' '));
    if (m) return Number(m[1]);
  }
  return null;
}

/** The by-hunt-code table (2025 on). */
export function parseHarvestByCode(pages: Item[][]): CodeHarvest[] {
  const out: CodeHarvest[] = [];
  for (const p of pages) {
    for (const { items } of texts(p)) {
      const m = CODE.exec(items[0]?.s.trim() ?? '');
      if (!m) continue;
      const vals = items.slice(1).map((i) => i.s.trim()).filter((s) => /^[\d,.]+%?$/.test(s));
      if (vals.length < 7) continue;
      const [male, female, young, harvest, hunters, success, days] = vals;
      out.push({ code: m[1], male: num(male), female: num(female), young: num(young), harvest: num(harvest), hunters: num(hunters), successPct: num(success), days: num(days), few: !!m[2] });
    }
  }
  return out;
}

/** Which season a table title is about, and whether it's the antlered / antlerless split. */
export function tableKind(title: string): { kind: SeasonKind; split: boolean } | null {
  const t = title.replace(/\s+/g, ' ');
  if (!/Harvest, Hunters and (Recreation Days|Percent Success) for/i.test(t)) return null;
  const split = /Percent Success/i.test(t);
  if (/Whitetail|Season Choice|Ranching|Plains|High Country|Early|Bosque|Exurban|Damage|All Rifle|Manners/i.test(t)) return null;
  const r = /\b(1|2|3|4)\s*(st|nd|rd|th)?\s*Rifle Seasons/i.exec(t);
  if (r) return { kind: `rifle${r[1]}` as SeasonKind, split };
  if (/All Archery Seasons/i.test(t)) return { kind: 'archery', split };
  if (/All Muzzleloader Seasons/i.test(t)) return { kind: 'muzzle', split };
  return null;
}

/** The by-unit tables (2019-2024). A table's title is on each of its pages ("nd"/"rd"/"th" may sit on the line above). */
export function parseHarvestByUnit(pages: Item[][]): UnitTables {
  const out: UnitTables = { totals: {}, split: {} };
  for (const p of pages) {
    const rows = texts(p);
    const ti = rows.findIndex((r) => /Harvest, Hunters and (Recreation Days|Percent Success) for/i.test(r.text));
    if (ti < 0) continue;
    const k = tableKind(rows[ti].text);
    if (!k) continue;
    const into = (k.split ? out.split : out.totals)[k.kind] ??= [];
    for (const { items } of rows.slice(ti + 1)) {
      const u = items[0]?.s.trim() ?? '';
      if (!/^\d{1,3}$/.test(u) || items[0].x > 90) continue;
      const v = items.slice(1).map((i) => i.s.trim()).filter((s) => /^[\d,.]+%?$/.test(s)).map(num);
      if (k.split && v.length >= 6) into.push({ unit: String(Number(u)), mHarvest: v[0], mHunters: v[1], fHarvest: v[3], fHunters: v[4] });
      else if (!k.split && v.length >= 7) into.push({ unit: String(Number(u)), male: v[0], female: v[1], young: v[2], harvest: v[3], hunters: v[4], successPct: v[5], days: v[6] });
    }
  }
  return out;
}

/** The season table a hunt code's harvest is in (by-unit years), or null when there isn't one. */
export function kindForCode(code: string): SeasonKind | null {
  const type = code[5], no = Number(code[6]), method = code[7];
  if (type !== 'O') return null;
  if (method === 'A') return 'archery';
  if (method === 'M') return 'muzzle';
  if (method === 'R' && no >= 1 && no <= 4) return `rifle${no}` as SeasonKind;
  return null;
}

/**
 * A code's harvest from the by-unit tables: summed over its units. Antlered / antlerless codes use the split table
 * (limited licenses only, no private-land-only) when there is one; either-sex codes and archery use the totals.
 */
export function codeFromUnits(code: string, units: string[], t: UnitTables): { harvest: number; hunters: number; days: number | null; basis: 'split' | 'totals' } | null {
  const kind = kindForCode(code);
  if (!kind) return null;
  const sex = code[1];
  const split = sex !== 'E' ? t.split[kind] : undefined;
  if (split?.length) {
    const rows = split.filter((r) => units.includes(r.unit));
    if (!rows.length) return null;
    const h = rows.reduce((a, r) => a + ((sex === 'M' ? r.mHarvest : r.fHarvest) ?? 0), 0);
    const n = rows.reduce((a, r) => a + ((sex === 'M' ? r.mHunters : r.fHunters) ?? 0), 0);
    return n ? { harvest: h, hunters: n, days: null, basis: 'split' } : null;
  }
  const tot = t.totals[kind];
  const rows = tot?.filter((r) => units.includes(r.unit)) ?? [];
  if (!rows.length) return null;
  const h = rows.reduce((a, r) => a + (sex === 'M' ? r.male ?? 0 : sex === 'F' ? (r.female ?? 0) + (r.young ?? 0) : r.harvest ?? 0), 0);
  const n = rows.reduce((a, r) => a + (r.hunters ?? 0), 0);
  const d = rows.reduce((a, r) => a + (r.days ?? 0), 0);
  return n ? { harvest: h, hunters: n, days: d, basis: 'totals' } : null;
}
