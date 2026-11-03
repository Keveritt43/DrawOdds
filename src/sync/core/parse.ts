/**
 * Pure parsing helpers for IDFG Hunt Planner pages. No network, no database - unit tested.
 */

export type Row = Record<string, string>;

/** "Unit 14" / "Area 14" / " 14 " -> "14" (upper-cased). */
export function normArea(v: unknown): string {
  return String(v ?? '')
    .replace(/^(hunt\s+)?(area|unit)s?\s+/i, '')
    .trim()
    .toUpperCase();
}

/** "1,046" / "47%" / "" -> number | null */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[,%]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function cleanCell(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Whole page to plain text, keeping line breaks at block boundaries. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Finds the table whose header row contains `keyHeader` ("hunt#" for controlled, "unit" for general)
 * and returns one object per data row, keyed by the lower-cased, space-free header.
 */
export function parseStatsTable(html: string, keyHeader: 'hunt#' | 'unit' | 'year'): Row[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const keyOk =
    keyHeader === 'hunt#' ? /^\d+$/ : keyHeader === 'year' ? /^(19|20)\d\d$/ : /^(unit\s*)?\d+[a-z]?$/i;
  for (const t of tables) {
    const trs = t.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const grid = trs.map((tr) => (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map(cleanCell));
    const hi = grid.findIndex((cells) => cells.some((c) => c.replace(/\s/g, '').toLowerCase() === keyHeader));
    if (hi < 0) continue;
    const heads = grid[hi].map((c) => c.replace(/\s/g, '').toLowerCase());
    const keyCol = heads.indexOf(keyHeader);
    const rows: Row[] = [];
    for (let i = hi + 1; i < grid.length; i++) {
      const cells = grid[i];
      if (cells.length !== heads.length || !keyOk.test(cells[keyCol])) continue;
      const o: Row = {};
      heads.forEach((h, k) => (o[h] = cells[k]));
      rows.push(o);
    }
    return rows;
  }
  return [];
}

export interface LandShare {
  manager: string;
  pct: number;
}

const SECTION_HEADS = [
  'Surface Management',
  'Access Yes',
  'Federally-designated Wilderness',
  'Wilderness Areas',
  'Land Use/Cover',
  'Land Use',
  'Recent Hunts',
  'Public Access',
];

/** Text of one section of a unit/area page, from its heading to the next known heading. */
export function sectionText(text: string, heading: string): string | null {
  const start = text.indexOf(heading);
  if (start < 0) return null;
  const after = start + heading.length;
  let end = text.length;
  for (const h of SECTION_HEADS) {
    if (h === heading || heading.startsWith(h) || h.startsWith(heading)) continue;
    const i = text.indexOf(h, after);
    if (i >= 0 && i < end) end = i;
  }
  return text.slice(after, end);
}

/** "Private 34.62%  U.S. Bureau of Land Management (BLM) 30.52% ..." -> shares. */
export function parsePercentList(section: string): LandShare[] {
  const out: LandShare[] = [];
  const re = /([A-Za-z][A-Za-z .,'()&/-]*?)\s*:?\s*(\d{1,3}(?:\.\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const manager = m[1].replace(/\s+/g, ' ').trim();
    const pct = Number(m[2]);
    if (!manager || pct > 100) continue;
    if (/^(of|the|and|acres)$/i.test(manager)) continue;
    out.push({ manager, pct });
  }
  return out;
}

const NOT_PUBLIC = /private|tribal|indian|reservation|unknown|water/i;

/** Public = everything that isn't private/tribal/water. State of Idaho counts as public. */
export function publicPrivate(shares: LandShare[]): { publicPct: number | null; privatePct: number | null } {
  if (!shares.length) return { publicPct: null, privatePct: null };
  const priv = shares.filter((s) => /private/i.test(s.manager)).reduce((a, s) => a + s.pct, 0);
  const pub = shares.filter((s) => !NOT_PUBLIC.test(s.manager)).reduce((a, s) => a + s.pct, 0);
  return { publicPct: round1(pub), privatePct: round1(priv) };
}

export interface LandPage {
  shares: LandShare[];
  publicPct: number | null;
  privatePct: number | null;
  accessYesNone: boolean;
  wildernessNone: boolean;
  wildernessPct: number | null;
}

/** Parses an IDFG unit.aspx / area.aspx page. */
export function parseLandPage(html: string): LandPage {
  const text = htmlToText(html);
  const surf = sectionText(text, 'Surface Management') ?? '';
  const shares = parsePercentList(surf);
  const ay = sectionText(text, 'Access Yes') ?? '';
  const wild = sectionText(text, 'Wilderness') ?? '';
  const wildPcts = [...wild.matchAll(/\((\d{1,3}(?:\.\d+)?)%\s+of/gi)].map((m) => Number(m[1]));
  return {
    shares,
    ...publicPrivate(shares),
    accessYesNone: /no properties/i.test(ay),
    wildernessNone: /no wilderness/i.test(wild),
    wildernessPct: wildPcts.length ? round1(wildPcts.reduce((a, b) => a + b, 0)) : /no wilderness/i.test(wild) ? 0 : null,
  };
}

export type Weapon = 'ANY' | 'ARCHERY' | 'MUZZLELOADER' | 'SHORT_RANGE' | 'OTHER';
export type AntlerClass = 'ANTLERED' | 'ANTLERLESS' | 'EITHER';

export interface ListedHunt {
  idfgId: number;
  name: string;
  huntNumber: number | null;
  type: 'GENERAL' | 'CONTROLLED';
  takeMethod: string;
  weapon: Weapon;
  antlerClass: AntlerClass;
  sexText: string;
  open: string | null; // ISO date
  close: string | null;
  tags: number | null; // null = unlimited / not stated
  youthOnly: boolean;
  text: string;
}

export function weaponOf(text: string): { takeMethod: string; weapon: Weapon } {
  const t = text.toLowerCase();
  if (/short[- ]range/.test(t)) return { takeMethod: 'Short-range only', weapon: 'SHORT_RANGE' };
  if (/muzzleloader/.test(t) && !/any weapon/.test(t)) return { takeMethod: 'Muzzleloader', weapon: 'MUZZLELOADER' };
  if (/archery/.test(t) && !/any weapon/.test(t)) return { takeMethod: 'Archery', weapon: 'ARCHERY' };
  if (/any weapon/.test(t)) return { takeMethod: 'Any Weapon', weapon: 'ANY' };
  return { takeMethod: 'Other', weapon: 'OTHER' };
}

export function antlerOf(text: string): { antlerClass: AntlerClass; sexText: string } {
  const t = text.toLowerCase();
  const either = /either sex|antlered or antlerless|antlerless or antlered|any (elk|deer)\b/.test(t);
  const antlerless = /antlerless/.test(t);
  const antlered = /\bantlered\b|\bbucks?\b|\bbulls?\b|point (deer|elk)|brow-tined/.test(t);
  if (either || (antlerless && antlered)) return { antlerClass: 'EITHER', sexText: 'Either sex' };
  if (antlerless) return { antlerClass: 'ANTLERLESS', sexText: 'Antlerless' };
  if (antlered) return { antlerClass: 'ANTLERED', sexText: 'Antlered' };
  return { antlerClass: 'EITHER', sexText: 'Not stated' };
}

/** "11/10/26" or "11/10/2026" -> "2026-11-10" */
export function usDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * Parses an IDFG huntlist.aspx page. Markup-agnostic on purpose: each hunt is the text block
 * between one `hunt?id=` link and the next.
 */
export function parseHuntList(html: string): ListedHunt[] {
  const re = /<a[^>]+href=["'][^"']*hunt(?:\/|\?id=)(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links = [...html.matchAll(re)];
  const out = new Map<number, ListedHunt>();
  links.forEach((m, i) => {
    const idfgId = Number(m[1]);
    const name = cleanCell(m[2]);
    const blockEnd = i + 1 < links.length ? links[i + 1].index! : Math.min(html.length, m.index! + 4000);
    const block = cleanCell(html.slice(m.index!, blockEnd));
    if (!name || out.has(idfgId)) return;
    const dates = findDates(block);
    const tagM = block.match(/(\d[\d,]*)\s*(?:tags|permits)/i);
    const numM = (name + ' ' + block).match(/controlled hunt\s*#?\s*(\d{4})/i);
    const { takeMethod, weapon } = weaponOf(block);
    const { antlerClass, sexText } = antlerOf(block);
    out.set(idfgId, {
      idfgId,
      name,
      huntNumber: numM ? Number(numM[1]) : null,
      // controlled hunts are sometimes linked by their hunt-area code alone ("50-1X", "36A-3")
      type: /controlled/i.test(name + ' ' + block.slice(0, 200)) || /^\d{1,3}[A-Z]{0,2}(-\d+[A-Z]?)?$/i.test(name.trim()) ? 'CONTROLLED' : 'GENERAL',
      takeMethod,
      weapon,
      antlerClass,
      sexText,
      open: dates?.[0] ?? null,
      close: dates?.[1] ?? null,
      tags: /unlimited/i.test(block) ? null : tagM ? num(tagM[1]) : null,
      youthOnly: /youth/i.test(name + ' ' + block),
      text: block.slice(0, 600),
    });
  });
  return [...out.values()];
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Hunt Planner unit IDs from the links on a general stats page: unit.aspx?ID=63 -> "49". */
export function parseUnitLinks(html: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/unit\.aspx\?ID=(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = normArea(cleanCell(m[2]));
    if (/^\d+[A-Z]?$/.test(name) && !out.has(name)) out.set(name, Number(m[1]));
  }
  return out;
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * First open/close pair in a block of hunt-list text, in any of IDFG's formats:
 * "11/1/26-11/14/26", "11/1/2026 to 11/14/2026", "Nov 1, 2026 - Nov 14, 2026", "Nov 1 - Nov 14".
 * Returns ISO dates; a close earlier than the open rolls into the next year (Dec-Jan seasons).
 */
export function findDates(text: string, defaultYear = new Date().getFullYear()): [string, string] | null {
  const found: { m: number; d: number; y: number | null }[] = [];
  const re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/gi;
  for (const m of text.matchAll(re)) {
    if (m[1]) found.push({ m: Number(m[1]), d: Number(m[2]), y: m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]) });
    else found.push({ m: MON[m[4].slice(0, 3).toLowerCase()], d: Number(m[5]), y: m[6] ? Number(m[6]) : null });
    if (found.length === 2) break;
  }
  if (found.length < 2) return null;
  const [a, b] = found;
  if (a.m < 1 || a.m > 12 || b.m < 1 || b.m > 12 || a.d < 1 || a.d > 31 || b.d < 1 || b.d > 31) return null;
  const ya = a.y ?? b.y ?? defaultYear;
  let yb = b.y ?? ya;
  if (b.y === null && (b.m < a.m || (b.m === a.m && b.d < a.d))) yb = ya + 1;
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return [iso(ya, a.m, a.d), iso(yb, b.m, b.d)];
}

/** "Elk A Tag - Pioneer Zone (Units 36A, 49, 50)" -> ["36A","49","50"]; "Unit 49 Regular Deer Tag" -> ["49"]. */
export function unitsFromName(name: string): string[] {
  const m = name.match(/\bunits?\s+((?:\d{1,2}[A-Z]?)(?:\s*(?:,|&|and)\s*\d{1,2}[A-Z]?)*)/i);
  if (!m) return [];
  return [...new Set(m[1].split(/\s*(?:,|&|and)\s*/i).map((u) => u.trim().toUpperCase()).filter(Boolean))];
}

/** "36B-1" -> "36B", "1-1X" -> "1", "63AX" -> "63A", "11" -> "11". */
export function parentUnit(area: string): string {
  return String(area).toUpperCase().replace(/X$/, '').replace(/-\d+$/, '');
}

/** Each species' stats table has its own columns: deer %4+/%whitetail, elk %6+/%spike, pronghorn horned/hornless. */
export function speciesColumns(species: 'DEER' | 'ELK' | 'PRONGHORN' | 'MOOSE' | 'BIGHORN' | 'GOAT', row: Row): boolean {
  const k = Object.keys(row);
  if (species === 'PRONGHORN') return k.includes('horned') || k.includes('hornless');
  if (species === 'ELK') return k.includes('%6+pts') || k.includes('%spike');
  if (species === 'MOOSE') return k.includes('bulls') || k.includes('cows');
  if (species === 'BIGHORN') return k.includes('rams') || k.includes('ewes');
  if (species === 'GOAT') return k.includes('billies') || k.includes('nannies');
  return k.includes('%4+pts') || k.includes('%whitetail');
}

