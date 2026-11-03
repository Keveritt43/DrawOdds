export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? '-' : `${(v * 100).toFixed(digits)}%`;
/** Odds-style percent: one decimal under 10% (but a plain "0%"), whole numbers above. */
export const pctOdds = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '-' : v === 0 ? '0%' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
export const pct100 = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '-' : `${v.toFixed(digits)}%`;
export const int = (v: number | null | undefined) => (v === null || v === undefined ? '-' : Math.round(v).toLocaleString('en-US'));
export const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '-';
export const range = (a: Date | null, b: Date | null) => (a ? `${date(a)} - ${date(b)}` : '-');
export const WEAPON: Record<string, string> = { ANY: 'Any weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader', SHORT_RANGE: 'Short range', OTHER: 'Other' };
export const ANTLER: Record<string, string> = { ANTLERED: 'Antlered', ANTLERLESS: 'Antlerless', EITHER: 'Either sex' };
export const DEERTYPE: Record<string, string> = { MULE: 'Mule deer', WHITETAIL: 'Whitetail', MIXED: 'Mixed' };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SPECIES_LABEL: Record<string, string> = { DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn Sheep', GOAT: 'Mountain Goat' };

/** Sex class in the species' own words: pronghorn have horns (bucks / does), not antlers. */
export function antlerLabel(species: string, cls: string): string {
  if (species === 'PRONGHORN') return { ANTLERED: 'Buck', ANTLERLESS: 'Doe / fawn', EITHER: 'Either sex' }[cls] ?? cls;
  if (species === 'ELK') return { ANTLERED: 'Bull', ANTLERLESS: 'Cow / calf', EITHER: 'Either sex' }[cls] ?? cls;
  if (species === 'DEER') return { ANTLERED: 'Buck', ANTLERLESS: 'Doe / fawn', EITHER: 'Either sex' }[cls] ?? cls;
  if (species === 'MOOSE') return { ANTLERED: 'Bull', ANTLERLESS: 'Cow', EITHER: 'Either sex' }[cls] ?? cls;
  if (species === 'BIGHORN') return { ANTLERED: 'Ram', ANTLERLESS: 'Ewe', EITHER: 'Either sex' }[cls] ?? cls;
  if (species === 'GOAT') return { ANTLERED: 'Billy', ANTLERLESS: 'Nanny', EITHER: 'Either sex' }[cls] ?? cls;
  return ANTLER[cls] ?? cls;
}

/** What "trophy" means for each species (pronghorn: not tracked). */
export const TROPHY_LABEL: Record<string, string> = { DEER: '4+ pt mule deer', ELK: '6+ pt bulls' };

/** Hunters per square mile: one decimal under 10, whole numbers above. */
export function density(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return v < 0.1 ? '<0.1' : v < 10 ? v.toFixed(1) : String(Math.round(v));
}

/**
 * Most controlled-hunt tags a nonresident can draw (IDAPA 13.01.08.255): 10 or fewer tags -> 1; more -> 10%
 * (rounded down: "not more than"). Unlimited hunts (no tag count) have no cap. A ceiling, not an allocation -
 * and IDFG sets fixed nonresident numbers on some hunts, so the draw history beats this rule when we have it.
 */
export const nrCap = (tags: number | null | undefined): number | null =>
  !tags || tags <= 0 ? null : tags <= 10 ? 1 : Math.floor(tags / 10);

export interface NrTagInfo {
  /** "full": nonresidents were turned away, so the number that drew is the real limit */
  /** "count": moose / sheep / goat, where the limit is statewide: just how many nonresidents drew */
  kind: 'full' | 'open' | 'rule' | 'count';
  /** nonresident tags: drawn when we have a drawing, else the 10% rule */
  n: number | null;
  year: number | null;
  /** short line for cards */
  short: string;
  /** one sentence for the hunt page */
  long: string;
}

/**
 * Nonresident tags in a controlled hunt, from the latest drawing when we have one:
 *  - more nonresidents applied than drew -> the nonresident limit was reached: that number IS the limit
 *  - everyone who applied drew -> no limit was hit (often leftover tags)
 *  - no drawing yet -> the 10% rule
 */
export function nrTags(tags: number | null | undefined, nrDrew: number | null | undefined, nrApps: number | null | undefined, year: number | null | undefined, perHuntRule = true): NrTagInfo | null {
  const y = year ?? null;
  if (nrDrew !== null && nrDrew !== undefined && nrApps !== null && nrApps !== undefined && y) {
    if (nrApps > nrDrew && !perHuntRule) {
      // moose / sheep / goat: the nonresident limit is statewide per species, so a hunt's count is just what happened
      return {
        kind: 'count', n: nrDrew, year: y,
        short: `${int(nrDrew)} NR drew '${String(y).slice(2)}`,
        long: `${int(nrDrew)} of ${int(nrApps)} nonresident first-choice applicants drew in ${y}.`,
      };
    }
    if (nrApps > nrDrew) {
      return {
        kind: 'full', n: nrDrew, year: y,
        short: `${int(nrDrew)} for NR`,
        long: `${int(nrDrew)} tags went to nonresidents in ${y}, and ${int(nrApps - nrDrew)} nonresident first-choice applicants missed out, so ${int(nrDrew)} is the nonresident limit in practice.`,
      };
    }
    return {
      kind: 'open', n: nrDrew, year: y,
      short: nrDrew ? `all NR drew '${String(y).slice(2)}` : `no NR applied '${String(y).slice(2)}`,
      long: nrDrew ? `Every nonresident who applied drew in ${y} (${int(nrDrew)} tags), so the nonresident limit wasn't reached.` : `No nonresidents applied in ${y}.`,
    };
  }
  // moose / sheep / goat: the 10% limit is statewide per species, not per hunt - no per-hunt number to show
  if (!perHuntRule) return null;
  const cap = nrCap(tags);
  if (cap === null) return null;
  return {
    kind: 'rule', n: cap, year: null,
    short: `up to ${int(cap)} NR`,
    long: `Idaho's rule allows nonresidents up to ${int(cap)} of these tags (10%, or 1 tag in hunts of 10 or fewer). It's a ceiling, not a set-aside.`,
  };
}

/** Controlled-hunt tag line: "120 tags", and for nonresidents "2,293 tags · 240 for NR". */
export const controlledTags = (tags: number | null | undefined, nr: boolean, nrDrew?: number | null, nrApps?: number | null, drawYear?: number | null, species = '') => {
  if (!tags) return 'Tags: see regs';
  const t = `${int(tags)} tag${tags === 1 ? '' : 's'}`;
  if (!nr) return t;
  const info = nrTags(tags, nrDrew, nrApps, drawYear, !['MOOSE', 'BIGHORN', 'GOAT'].includes(species));
  return `${t}${info ? ` · ${info.short}` : ''}`;
};

// ---------- plain-English verdicts (so a beginner can read a card without decoding numbers) ----------

export type Tone = 'good' | 'ok' | 'bad' | 'none';
export interface Verdict { text: string; tone: Tone }

export function oddsVerdict(v: number | null | undefined): Verdict {
  if (v === null || v === undefined) return { text: 'No draw data', tone: 'none' };
  if (v >= 0.995) return { text: 'Everyone drew', tone: 'good' };
  if (v >= 0.5) return { text: 'Good odds', tone: 'good' };
  if (v >= 0.15) return { text: 'Fair odds', tone: 'ok' };
  if (v >= 0.05) return { text: 'Long shot', tone: 'bad' };
  return { text: 'Very long shot', tone: 'bad' };
}

/**
 * Success bands by species for a rifle (any-weapon) hunt: [high, low, top]. 20% is good for elk and poor for
 * pronghorn. Other weapons scale them down by how much lower Idaho's pooled success runs for that weapon
 * (IDFG harvest, all hunts): archery deer ~0.45 of rifle, archery elk ~0.9, archery pronghorn ~0.3.
 */
const SUCCESS_BANDS: Record<string, [number, number, number]> = {
  ELK: [0.3, 0.15, 0.6], DEER: [0.55, 0.35, 0.75], PRONGHORN: [0.6, 0.35, 0.85],
  MOOSE: [0.7, 0.5, 0.9], BIGHORN: [0.7, 0.5, 0.9], GOAT: [0.7, 0.5, 0.9],
};
/** Weapon vs rifle success, pooled IDFG harvest 2021-25, separately for general seasons and controlled hunts:
 *  controlled muzzleloader deer run close to rifle (0.9), general muzzleloader deer well below it (0.7). */
const WEAPON_FACTOR: Record<'GENERAL' | 'CONTROLLED', Record<string, Record<string, number>>> = {
  GENERAL: {
    DEER: { ARCHERY: 0.4, MUZZLELOADER: 0.7 },
    ELK: { ARCHERY: 0.9, MUZZLELOADER: 0.8 },
    PRONGHORN: { ARCHERY: 0.3, MUZZLELOADER: 0.65 },
  },
  CONTROLLED: {
    DEER: { ARCHERY: 0.45, MUZZLELOADER: 0.9 },
    ELK: { ARCHERY: 0.8, MUZZLELOADER: 0.55 },
    PRONGHORN: { ARCHERY: 0.3, MUZZLELOADER: 0.65 },
  },
};
/** [high, low, top] success for a species, weapon and kind of hunt. */
export function successBands(species: string, weapon = 'ANY', type: string = 'GENERAL'): [number, number, number] {
  const [hi, lo, top] = SUCCESS_BANDS[species] ?? [0.5, 0.25, 0.75];
  const f = WEAPON_FACTOR[type === 'CONTROLLED' ? 'CONTROLLED' : 'GENERAL'][species]?.[weapon] ?? 1;
  return [hi * f, lo * f, top * f];
}
export function successVerdict(v: number | null | undefined, species: string, weapon = 'ANY', type = 'GENERAL'): Verdict {
  if (v === null || v === undefined) return { text: 'No harvest data', tone: 'none' };
  const [hi, lo] = successBands(species, weapon, type);
  if (v >= hi) return { text: `High for ${SPECIES_LABEL[species]?.toLowerCase() ?? 'this'}`, tone: 'good' };
  if (v >= lo) return { text: 'Typical', tone: 'ok' };
  return { text: `Low for ${SPECIES_LABEL[species]?.toLowerCase() ?? 'this'}`, tone: 'bad' };
}

export function crowdVerdict(v: number | null | undefined): Verdict {
  if (v === null || v === undefined) return { text: 'No hunter data', tone: 'none' };
  if (v < 0.5) return { text: 'Uncrowded', tone: 'good' };
  if (v < 1.5) return { text: 'Some company', tone: 'ok' };
  return { text: 'Crowded', tone: 'bad' };
}

/** Draw x fill as "about 1 in N" (or "about N in 10" when it's better than 1 in 2). */
export function drawFillLine(v: number | null | undefined): string | null {
  if (v === null || v === undefined || v <= 0) return null;
  if (v >= 0.5) return `about ${Math.round(v * 10)} in 10`;
  return `about 1 in ${Math.max(2, Math.round(1 / v))}`;
}

/** A year-over-year change is noise on tiny numbers: only show it when both years have a real base. */
export const meaningfulChange = (now: number | null | undefined, prev: number | null | undefined, minBase: number) =>
  now !== null && now !== undefined && prev !== null && prev !== undefined && Math.max(now, prev) >= minBase;

/** "4" < "10" < "11" < "20" < "20A" < "40": unit / area names in human order (digits as numbers, then letters). */
export function unitOrder(a: string | null | undefined, b: string | null | undefined): number {
  const p = (s: string | null | undefined) => {
    const m = String(s ?? '').toUpperCase().match(/^(\d+)([A-Z]*)(.*)$/);
    return m ? [Number(m[1]), m[2], m[3]] as const : [Infinity, String(s ?? ''), ''] as const;
  };
  const [an, as, ar] = p(a);
  const [bn, bs, br] = p(b);
  return an - bn || as.localeCompare(bs) || ar.localeCompare(br, undefined, { numeric: true });
}
