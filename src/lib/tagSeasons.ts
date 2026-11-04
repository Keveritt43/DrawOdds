/** Display helpers for nonresident elk A/B tag seasons (HuntSummary.tagSeasons). */
export interface TagSeason {
  weapon: string;
  sex: string;
  dates: { open: string; close: string }[];
  notes: string;
}
export interface TagSeasons {
  year: number;
  seasons: TagSeason[];
}

const W: Record<string, string> = { ANY: 'Any weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader', SHORT_RANGE: 'Short range' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export const seasonDates = (s: TagSeason) => s.dates.map((d) => `${day(d.open)} - ${day(d.close)}`).join(', ');
export const seasonTitle = (s: TagSeason) => `${W[s.weapon] ?? s.weapon}${s.sex ? ` · ${s.sex}` : ''}`;

/** Seasons in date order, with notes trimmed of the dates they repeat. */
export function sortedSeasons(ts: unknown): TagSeason[] {
  const t = ts as TagSeasons | null;
  if (!t?.seasons) return [];
  return t.seasons.slice().sort((a, b) => (a.dates[0]?.open ?? '').localeCompare(b.dates[0]?.open ?? ''));
}

/** "antlerless (youth hunt only on private land only)" -> "youth antlerless"; "A tag · antlered only" -> "antlered". */
export function shortSex(sex: string): string {
  const t = sex.replace(/^[AB] tag · /i, '').toLowerCase();
  const base = /^antlerless/.test(t) ? 'antlerless' : /^antlered/.test(t) ? 'antlered' : t.replace(/ only$/, '');
  const q = /youth/.test(t) ? 'youth ' : '';
  const extra = /2-point/.test(t) ? '2-pt ' : /white-tailed/.test(t) ? 'whitetail ' : '';
  return `${q}${extra}${base}`.trim();
}

/** One line for a card: "Archery Aug 30 - Sep 30 · Any weapon Oct 10 - Oct 24 · +2 more". */
export function seasonsSummary(ts: unknown, max = 3): string {
  const s = sortedSeasons(ts);
  if (!s.length) return '';
  // antlered and antlerless seasons often share dates: one entry per weapon + dates. When one weapon has
  // different dates (unit 30: bucks Oct 10-24, youth antlerless Oct 10-31), say which is which.
  const split = new Set(s.map((x) => x.weapon).filter((w) => new Set(s.filter((x) => x.weapon === w).map(seasonDates)).size > 1));
  const uniq = [...new Set(s.map((x) => `${W[x.weapon] ?? x.weapon}${split.has(x.weapon) && shortSex(x.sex) ? ` (${shortSex(x.sex)})` : ''} ${seasonDates(x)}`))];
  return `${uniq.slice(0, max).join(' · ')}${uniq.length > max ? ` · +${uniq.length - max} more` : ''}`;
}

/**
 * Antler and animal rules worth seeing before you apply, from the regulations' season tables:
 * "Bucks only", "2-point bucks only", "Whitetail only", "Antlerless: youth only", "Spike bulls only".
 * Seasons' `sex` reads "antlered", "antlerless (youth hunt only)", "antlered (2-point deer only)", or for
 * elk "A tag · spike only", "brow-tined bulls only", "any elk"...
 */
export function seasonRules(ts: unknown, species: string): string[] {
  const sx = sortedSeasons(ts).map((x) => x.sex.replace(/^[AB] tag · /i, '').toLowerCase().trim()).filter(Boolean);
  if (!sx.length) return [];
  const male = species === 'ELK' ? 'Bulls' : 'Bucks';
  const isFemale = (x: string) => /^antlerless/.test(x);
  const isMale = (x: string) => /^antlered|spike|brow-tined|bull/.test(x) && !/^antlerless only/.test(x);
  const isAny = (x: string) => /any elk|any deer|either|spike or antlerless|antlerless or spike/.test(x);
  const females = sx.filter((x) => isFemale(x) || isAny(x));
  const males = sx.filter((x) => (isMale(x) || isAny(x)) && !/^antlerless only$/.test(x));
  const out: string[] = [];
  const allOrSome = (list: string[], re: RegExp, label: string) => {
    const hit = list.filter((x) => re.test(x)).length;
    if (!hit) return;
    out.push(hit === list.length ? label : `${label} (some seasons)`);
  };
  if (!females.length) out.push(`${male} only`);
  else if (!males.length) out.push('Antlerless only');
  else if (females.every((x) => /youth/.test(x))) out.push('Antlerless: youth only');
  if (species === 'DEER') {
    allOrSome(males, /2-point/, '2-point bucks only');
    allOrSome(sx, /white-tailed/, 'Whitetail only');
  } else if (species === 'ELK') {
    allOrSome(males, /^spike only|spike only/, 'Spike bulls only');
    allOrSome(males, /brow-tined/, 'Brow-tined bulls only');
  }
  // "2-point bucks only" already says bucks only
  return out.includes('2-point bucks only') ? out.filter((x) => x !== 'Bucks only') : out;
}

/** What a rule means, for a tooltip. */
export const RULE_HELP: Record<string, string> = {
  '2-point bucks only': 'Only bucks with no more than two points on at least one antler (a 2x3 is legal; a 3x3 is not). Check the regulations for the exact definition.',
  'Spike bulls only': 'Only bulls with antlers that don’t branch.',
  'Brow-tined bulls only': 'Only bulls with a brow tine (the first point off the main beam, near the head).',
  'Whitetail only': 'White-tailed deer only: mule deer are not legal in this season.',
  'Antlerless: youth only': 'Antlerless animals are open to youth hunters only.',
};

/** A general season's sex class from its regulation seasons: unit 40's any-weapon deer season is bucks only. */
export function seasonsClass(seasons: { sex: string }[]): 'ANTLERED' | 'ANTLERLESS' | 'EITHER' {
  const sx = seasons.map((x) => x.sex.replace(/^[AB] tag · /i, '').toLowerCase());
  const any = (x: string) => /any (elk|deer)|either|spike or antlerless|antlerless or spike/.test(x);
  const f = sx.some((x) => any(x) || /^antlerless/.test(x));
  const m = sx.some((x) => any(x) || /^antlered|spike|brow-tined|bull/.test(x));
  return f && m ? 'EITHER' : f ? 'ANTLERLESS' : m ? 'ANTLERED' : 'EITHER';
}
