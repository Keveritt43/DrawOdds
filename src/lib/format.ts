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

export const SPECIES_LABEL: Record<string, string> = { DEER: 'Deer', ELK: 'Elk', PRONGHORN: 'Pronghorn' };
