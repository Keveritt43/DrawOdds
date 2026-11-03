import type { Prisma, Residency } from '@prisma/client';
import { ELK_ZONES, ELK_ZONE_NAMES } from './elkZones';
import { DRAW_SPECIES, type Draw } from './species';

export type Sort = 'best' | 'odds' | 'success' | 'public' | 'big' | 'open' | 'alpha' | 'harvest' | 'hunters' | 'huntersLow' | 'apps' | 'appsLow' | 'densityLow';
export const SORTS: readonly Sort[] = ['best', 'odds', 'success', 'public', 'big', 'open', 'alpha', 'harvest', 'hunters', 'huntersLow', 'apps', 'appsLow', 'densityLow'];

export interface Filters {
  species: 'DEER' | 'ELK' | 'PRONGHORN' | 'MOOSE' | 'BIGHORN' | 'GOAT' | '';
  type: 'CONTROLLED' | 'GENERAL' | 'NRTAG' | ''; // NRTAG = nonresident general tag draw
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
  maxDensity: number | null; // at most this many hunters per square mile
  accessYes: boolean;
  youth: 'exclude' | 'include' | 'only';
  unit: string;
  zones: string[]; // elk zone names: hunts in any of their units
  q: string;
  sort: Sort;
  page: number;
  /** list each hunt once (default), or group everything under each unit it touches */
  view: 'hunt' | 'unit';
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
    species: pick([one(sp.species)], ['DEER', 'ELK', 'PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'] as const)[0] ?? '',
    type: pick([one(sp.type)], ['CONTROLLED', 'GENERAL', 'NRTAG'] as const)[0] ?? '',
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
    maxDensity: Number(one(sp.maxDensity)) > 0 ? Math.min(100, Number(one(sp.maxDensity))) : null,
    accessYes: one(sp.accessYes) === '1',
    youth: (['include', 'only'] as const).find((y) => y === one(sp.youth)) ?? 'exclude',
    unit: one(sp.unit).trim().toUpperCase().slice(0, 6),
    zones: [...new Set(list(sp.zone).map((v) => ELK_ZONE_NAMES.find((z) => z.toLowerCase() === v.trim().toLowerCase())).filter((z): z is string => !!z))],
    q: one(sp.q).trim().slice(0, 60),
    sort: SORTS.includes(sort) ? sort : 'best',
    page: Math.max(1, Math.min(200, Number(one(sp.page)) || 1)),
    view: one(sp.view) === 'unit' ? 'unit' : 'hunt',
  };
}

/** Field names that depend on residency. */
export function residencyFields(r: Residency) {
  return r === 'NONRESIDENT'
    ? { odds5: 'nrOdds5', oddsLast: 'nrOddsLast', oddsPrev: 'nrOddsPrev', tagAndFill: 'nrTagAndFill', appsLast: 'nrAppsLast', appsPrev: 'nrAppsPrev' } as const
    : { odds5: 'resOdds5', oddsLast: 'resOddsLast', oddsPrev: 'resOddsPrev', tagAndFill: 'resTagAndFill', appsLast: 'resAppsLast', appsPrev: 'resAppsPrev' } as const;
}

export function buildWhere(f: Filters, r: Residency, draw: Draw = 'DEP'): Prisma.HuntSummaryWhereInput {
  const rf = residencyFields(r);
  const and: Prisma.HuntSummaryWhereInput[] = [];
  // one drawing at a time: deer / elk / pronghorn, or moose / sheep / goat
  if (f.species && DRAW_SPECIES[draw].includes(f.species)) and.push({ species: f.species });
  else and.push({ species: { in: DRAW_SPECIES[draw] } });
  // nonresident general tags only exist for nonresidents (residents buy general tags over the counter)
  // (elk zone A/B tags are listed for everyone: residents pick an A or B tag too, bought over the counter)
  if (r !== 'NONRESIDENT') and.push({ OR: [{ nrTag: false }, { nrTag: true, species: 'ELK' }] });
  if (f.type === 'NRTAG') and.push({ nrTag: true });
  else if (f.type) and.push({ type: f.type });
  // a tag covers several weapons and sexes (its seasons do the narrowing), so those filters let tags through
  // (a tag passes when one of its seasons allows the weapon, or when its seasons aren't known yet)
  if (f.weapon.length) and.push({ OR: [{ nrTag: false, weapon: { in: f.weapon } }, { nrTag: true, weapons: { hasSome: f.weapon } }, { nrTag: true, weapons: { isEmpty: true } }] });
  if (f.antler.length) and.push({ OR: [{ antlerClass: { in: f.antler } }, { nrTag: true }] });
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
  // hunts with no hunter data are left out: an unknown density can't be "uncrowded"
  if (f.maxDensity !== null) and.push({ huntersSqMi: { lte: f.maxDensity } });
  if (f.accessYes) and.push({ accessYesCount: { gt: 0 } });
  if (f.youth === 'exclude') and.push({ youthOnly: false });
  if (f.youth === 'only') and.push({ youthOnly: true });
  if (f.unit) and.push({ units: { has: f.unit } });
  if (f.zones.length) and.push({ units: { hasSome: zoneUnits(f.zones) } });
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
  const asc = (k: string) => ({ [k]: { sort: 'asc', nulls: 'last' } }) as Prisma.HuntSummaryOrderByWithRelationInput;
  switch (f.sort) {
    case 'odds':
      return [desc(rf.odds5), desc('success5')];
    case 'success':
      // tiny samples (under 50 hunters over 5 years) swing to 0% or 100%: rank them after real numbers
      return [{ smallSample: 'asc' }, desc('success5'), desc(rf.odds5)];
    case 'public':
      return [desc('publicPct'), desc('success5')];
    case 'big':
      // deer / elk: trophy share; moose / sheep / goat: average antler spread or horn length
      return [desc('bigPct5'), desc('avgSize5'), desc('success5')];
    case 'harvest':
      return [desc('harvest5'), desc('success5')];
    case 'hunters':
      return [desc('hunters5'), desc('success5')];
    case 'huntersLow':
      return [asc('hunters5'), desc('success5')];
    case 'densityLow':
      return [asc('huntersSqMi'), desc('success5')];
    case 'apps':
      return [desc('appsLast'), desc(rf.odds5)];
    case 'appsLow':
      return [asc('appsLast'), desc(rf.odds5)];
    case 'open':
      return [{ openDate: { sort: 'asc', nulls: 'last' } }, desc('success5')];
    case 'alpha':
      return [{ areaName: { sort: 'asc', nulls: 'last' } }, { huntNumber: { sort: 'asc', nulls: 'last' } }];
    default:
      // best bet: chance of drawing AND filling; general hunts (no draw) rank by success
      return [{ smallSample: 'asc' }, desc(rf.tagAndFill), desc('success5')];
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
  set('maxDensity', m.maxDensity);
  set('accessYes', m.accessYes);
  if (m.youth && m.youth !== 'exclude') set('youth', m.youth);
  set('unit', m.unit);
  set('zone', m.zones);
  set('q', m.q);
  if (m.sort && m.sort !== 'best') set('sort', m.sort);
  if (m.page && m.page > 1) set('page', m.page);
  if (m.view === 'unit') set('view', 'unit');
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Units of the chosen elk zones. */
export function zoneUnits(zones: string[]): string[] {
  return [...new Set(zones.flatMap((z) => ELK_ZONES[z] ?? []))];
}

