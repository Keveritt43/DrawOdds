export const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? '-' : `${(v * 100).toFixed(digits)}%`;
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

/**
 * Most controlled-hunt tags a nonresident can draw (IDAPA 13.01.08.255): 10 or fewer tags -> 1; more -> 10%
 * (rounded down: "not more than"). Unlimited hunts (no tag count) have no cap. A ceiling, not an allocation.
 */
export const nrCap = (tags: number | null | undefined): number | null =>
  !tags || tags <= 0 ? null : tags <= 10 ? 1 : Math.floor(tags / 10);

/** Controlled-hunt tag line: "120 tags", and for nonresidents "120 tags · max 12 NR (11 drew '26)". */
export const controlledTags = (tags: number | null | undefined, nr: boolean, nrDrew?: number | null, drawYear?: number | null) => {
  if (!tags) return 'Tags: see regs';
  const cap = nrCap(tags);
  if (!nr || cap === null) return `${int(tags)} tags`;
  const drew = nrDrew !== null && nrDrew !== undefined && drawYear ? ` (${int(nrDrew)} drew '${String(drawYear).slice(2)})` : '';
  return `${int(tags)} tags · max ${int(cap)} NR${drew}`;
};

export const SPECIES_LABEL: Record<string, string> = { DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn' };
