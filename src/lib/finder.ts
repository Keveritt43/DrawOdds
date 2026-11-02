import type { Prisma, Residency } from '@prisma/client';

export type Sort = 'best' | 'odds' | 'success' | 'public' | 'big' | 'open' | 'alpha';

export interface Filters {
  species: 'DEER' | 'ELK' | '';
  type: 'CONTROLLED' | 'GENERAL' | '';
  weapon: ('ANY' | 'ARCHERY' | 'MUZZLELOADER' | 'SHORT_RANGE')[];
  antler: ('ANTLERED' | 'ANTLERLESS' | 'EITHER')[];
  months: number[]; // 8 = Aug ... 12 = Dec, 1 = Jan
  deerType: ('MULE' | 'WHITETAIL' | 'MIXED')[];
  minOdds: number | null; // percent, applied to the user's residency
  minSuccess: number | null; // percent
  minPublic: number | null; // percent
  minAccessYes: number | null; // percent of the area enrolled in Access Yes!
  minHuntable: number | null; // percent public + Access Yes!
  minBig: number | null; // trophy share: deer mule 4+, elk 6+ (percent of antlered)
  minTags: number | null;
  accessYes: boolean;
  youth: 'exclude' | 'include' | 'only';
  unit: string;
  q: string;
  sort: Sort;
  page: number;
}

type SP = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(',') : []).filter(Boolean);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const pct = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return one(v) !== '' && Number.isFinite(n) && n > 0 ? Math.min(100, n) : null;
};
const pick = <T extends string>(v: string[], allowed: readonly T[]) => v.map((x) => x.toUpperCase()).filter((x): x is T => (allowed as readonly string[]).includes(x));

export function parseFilters(sp: SP): Filters {
  const sort = one(sp.sort) as Sort;
  return {
    species: pick([one(sp.species)], ['DEER', 'ELK'] as const)[0] ?? '',
    type: pick([one(sp.type)], ['CONTROLLED', 'GENERAL'] as const)[0] ?? '',
    weapon: pick(list(sp.weapon), ['ANY', 'ARCHERY', 'MUZZLELOADER', 'SHORT_RANGE'] as const),
    antler: pick(list(sp.antler), ['ANTLERED', 'ANTLERLESS', 'EITHER'] as const),
    months: list(sp.month).map(Number).filter((m) => m >= 1 && m <= 12),
    deerType: pick(list(sp.deerType), ['MULE', 'WHITETAIL', 'MIXED'] as const),
    minOdds: pct(sp.minOdds),
    minSuccess: pct(sp.minSuccess),
    minPublic: pct(sp.minPublic),
    minAccessYes: pct(sp.minAccessYes),
    minHuntable: pct(sp.minHuntable),
    minBig: pct(sp.minBig),
    minTags: Number(one(sp.minTags)) > 0 ? Math.min(10000, Math.round(Number(one(sp.minTags)))) : null,
    accessYes: one(sp.accessYes) === '1',
    youth: (['include', 'only'] as const).find((y) => y === one(sp.youth)) ?? 'exclude',
    unit: one(sp.unit).trim().toUpperCase().slice(0, 6),
    q: one(sp.q).trim().slice(0, 60),
    sort: (['best', 'odds', 'success', 'public', 'big', 'open', 'alpha'] as const).includes(sort) ? sort : 'best',
    page: Math.max(1, Math.min(200, Number(one(sp.page)) || 1)),
  };
}

/** Field names that depend on residency. */
export function residencyFields(r: Residency) {
  return r === 'NONRESIDENT'
    ? { odds5: 'nrOdds5', oddsLast: 'nrOddsLast', oddsPrev: 'nrOddsPrev', tagAndFill: 'nrTagAndFill', appsLast: 'nrAppsLast', appsPrev: 'nrAppsPrev' } as const
    : { odds5: 'resOdds5', oddsLast: 'resOddsLast', oddsPrev: 'resOddsPrev', tagAndFill: 'resTagAndFill', appsLast: 'resAppsLast', appsPrev: 'resAppsPrev' } as const;
}

export function buildWhere(f: Filters, r: Residency): Prisma.HuntSummaryWhereInput {
  const rf = residencyFields(r);
  const and: Prisma.HuntSummaryWhereInput[] = [];
  if (f.species) and.push({ species: f.species });
  if (f.type) and.push({ type: f.type });
  if (f.weapon.length) and.push({ weapon: { in: f.weapon } });
  if (f.antler.length) and.push({ antlerClass: { in: f.antler } });
  if (f.deerType.length) and.push({ deerType: { in: f.deerType } });
  // hunt is open at some point during any chosen month (works for Dec-Jan seasons too)
  if (f.months.length) and.push({ months: { hasSome: f.months } });
  if (f.minOdds !== null) and.push({ [rf.odds5]: { gte: f.minOdds / 100 } });
  if (f.minSuccess !== null) and.push({ success5: { gte: f.minSuccess / 100 } });
  if (f.minPublic !== null) and.push({ publicPct: { gte: f.minPublic } });
  if (f.minAccessYes !== null) and.push({ accessYesPct: { gte: f.minAccessYes } });
  if (f.minHuntable !== null) and.push({ huntablePct: { gte: f.minHuntable } });
  if (f.minBig !== null) and.push({ bigPct5: { gte: f.minBig / 100 } });
  if (f.minTags !== null) and.push({ OR: [{ tags: { gte: f.minTags } }, { type: 'GENERAL' }] });
  if (f.accessYes) and.push({ accessYesCount: { gt: 0 } });
  if (f.youth === 'exclude') and.push({ youthOnly: false });
  if (f.youth === 'only') and.push({ youthOnly: true });
  if (f.unit) and.push({ units: { has: f.unit } });
  if (f.q) {
    const n = Number(f.q);
    and.push({
      OR: [
        { name: { contains: f.q, mode: 'insensitive' } },
        { areaName: { equals: f.q.toUpperCase() } },
        ...(Number.isInteger(n) ? [{ huntNumber: n }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export function buildOrder(f: Filters, r: Residency): Prisma.HuntSummaryOrderByWithRelationInput[] {
  const rf = residencyFields(r);
  const desc = (k: string) => ({ [k]: { sort: 'desc', nulls: 'last' } }) as Prisma.HuntSummaryOrderByWithRelationInput;
  switch (f.sort) {
    case 'odds':
      return [desc(rf.odds5), desc('success5')];
    case 'success':
      return [desc('success5'), desc(rf.odds5)];
    case 'public':
      return [desc('publicPct'), desc('success5')];
    case 'big':
      return [desc('bigPct5'), desc('success5')];
    case 'open':
      return [{ openDate: { sort: 'asc', nulls: 'last' } }, desc('success5')];
    case 'alpha':
      return [{ areaName: { sort: 'asc', nulls: 'last' } }, { huntNumber: { sort: 'asc', nulls: 'last' } }];
    default:
      // best bet: chance of drawing AND filling; general hunts (no draw) rank by success
      return [desc(rf.tagAndFill), desc('success5')];
  }
}

export const PAGE_SIZE = 40;

export function toQuery(f: Partial<Filters>, patch: Partial<Filters> = {}): string {
  const m = { ...f, ...patch };
  const p = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v === '' || v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)) return;
    p.set(k, Array.isArray(v) ? v.join(',') : v === true ? '1' : String(v));
  };
  set('species', m.species);
  set('type', m.type);
  set('weapon', m.weapon);
  set('antler', m.antler);
  set('month', m.months);
  set('deerType', m.deerType);
  set('minOdds', m.minOdds);
  set('minSuccess', m.minSuccess);
  set('minPublic', m.minPublic);
  set('minAccessYes', m.minAccessYes);
  set('minHuntable', m.minHuntable);
  set('minBig', m.minBig);
  set('minTags', m.minTags);
  set('accessYes', m.accessYes);
  if (m.youth && m.youth !== 'exclude') set('youth', m.youth);
  set('unit', m.unit);
  set('q', m.q);
  if (m.sort && m.sort !== 'best') set('sort', m.sort);
  if (m.page && m.page > 1) set('page', m.page);
  const s = p.toString();
  return s ? `?${s}` : '';
}
