import type { Residency } from '@prisma/client';
import { parseFilters, type Filters } from './finder';
import { matchesHuntSeason } from './huntSeasonFilter';
import { matchesCoSeason, tableOdds, poolFor, type OddsTable, type PointOdds } from './coHunt';
import { opportunity } from './score';
import { unitsWithObjective } from './elkObjectives';
import { zoneUnits } from './finder';
import { type StateCode } from './states';
import { searchStates, searchUnitKey } from './searchStates';
export { ID_RESTRICTIONS, CO_RESTRICTIONS } from './searchStates';
import type { StatePoints } from './points';
import type { CoScored } from './coScores';
import { chanceOf } from './coOdds';

export type SearchParams = Record<string, string | string[] | undefined>;
export type HunterSettings = { ID: Residency; CO: StatePoints };
export interface SearchResult {
  r: CoScored;
  odds: number | null;
  opportunity: number | null;
  nr: boolean;
  points: number | null;
  basis: string;
}
export const param = (sp: SearchParams, k: string) => (Array.isArray(sp[k]) ? sp[k]!.join(',') : sp[k] ?? '') as string;
const list = (sp: SearchParams, k: string) => param(sp, k).split(',').filter(Boolean);
const atLeast = (value: number | null, min: number | null, scale = 1) => min === null || (value !== null && value >= min / scale);

export function searchFilters(sp: SearchParams): Filters {
  // No implicit Quality cutoff: incomplete but usable hunts remain visible after ranked hunts.
  const filters = parseFilters({ ...sp, sort: param(sp, 'sort') || 'opp', minScore: param(sp, 'minScore') || '0',
    minSuccess: sp.minSuccess ?? sp.minSucc,
    weapon: sp.weapon ?? (param(sp, 'method') ? list(sp, 'method').map(m => ({ R: 'ANY', A: 'ARCHERY', M: 'MUZZLELOADER' })[m] ?? m).join(',') : undefined) });
  if (filters.species && filters.species !== 'DEER') filters.deerType = [];
  return filters;
}

/** All personal values are derived on copies; the public cached rows are never modified. */
export function personalize(r: CoScored, settings: HunterSettings, mode: 'last' | 'proj'): SearchResult | null {
  const nr = (r.state === 'ID' ? settings.ID : settings.CO.res) === 'NONRESIDENT';
  if (r.state === 'ID' && r.nrTag && !nr && r.species !== 'ELK') return null;
  // Match the Idaho listing: zone tags replace duplicated per-weapon general elk rows.
  if (r.state === 'ID' && r.type === 'GENERAL' && !r.nrTag && r.species === 'ELK') return null;
  const general = (r.pointOdds as unknown as PointOdds | null)?.general;
  if (r.state === 'CO' && general && !(nr ? general.nonresident : general.resident)) return null;
  return evaluateHunt(r, settings, mode);
}

/** Personal metrics without finder visibility rules, also used for explicitly chosen comparisons. */
export function evaluateHunt(r: CoScored, settings: HunterSettings, mode: 'last' | 'proj'): SearchResult {
  const nr = (r.state === 'ID' ? settings.ID : settings.CO.res) === 'NONRESIDENT';
  const points = r.state === 'CO' ? settings.CO[r.species as 'DEER' | 'ELK' | 'PRONGHORN'] ?? 0 : null;
  const general = (r.pointOdds as unknown as PointOdds | null)?.general;
  let odds: number | null;
  let basis: string;
  if (r.state === 'CO') {
    odds = tableOdds(r.oddsByPts as unknown as OddsTable, mode, poolFor(nr, settings.CO.youth), points ?? 0);
    if (general) odds = (nr ? general.nonresident : general.resident) ? 1 : null;
    basis = general ? 'OTC eligibility; availability may be limited' : `${mode === 'proj' ? 'Projected' : 'Historical'} first-choice odds · ${points} points`;
  } else if (!nr && r.type === 'GENERAL') {
    odds = r.capped ? null : 1;
    basis = r.capped ? 'Capped resident tag; availability unknown' : 'Over-the-counter tag';
  } else {
    odds = r.nrTag || r.type === 'GENERAL' ? (nr ? r.nrOddsLast ?? r.nrOdds5 : r.resOddsLast ?? r.resOdds5)
      : nr ? r.nrOdds5 ?? r.nrOddsLast : r.resOdds5 ?? r.resOddsLast;
    basis = `${r.nrTag || r.type === 'GENERAL' ? 'Latest' : 'Historical pooled'} first-choice odds · ${r.oddsLastYear ?? 'year unavailable'}`;
  }
  const opp = opportunity(r.scoreQuality, odds);
  return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds, opportunity: opp, nr, points, basis };
}

export function matchesSearch(x: SearchResult, f: Filters, sp: SearchParams, migrations: Partial<Record<string, string[]>> = {}): boolean {
  const { r, odds } = x;
  if (f.species && r.species !== f.species) return false;
  if (f.type && r.type !== f.type) return false;
  if (!matchesHuntSeason(r, f, true)) return false;
  if (!atLeast(odds, f.minOdds, 100) || !atLeast(r.success5, f.minSuccess, 100)
    || !atLeast(r.publicPct, f.minPublic)
    || !atLeast(r.scoreQuality, f.minScore || null) || !atLeast(x.opportunity, f.minOpp)) return false;
  if (f.maxDensity !== null && (r.huntersSqMi === null || r.huntersSqMi > f.maxDensity)) return false;
  if (f.minTags !== null && r.type !== 'GENERAL' && (r.tags === null || r.tags < f.minTags)) return false;
  const selected = param(sp, 'unit');
  if (selected) {
    const [state, unit] = selected.includes(':') ? selected.split(':') : ['', selected.toUpperCase()];
    if ((state && state !== r.state) || !r.units.includes(unit)) return false;
  }
  if (f.q && ![r.name, r.areaName, r.tagCode, String(r.huntNumber ?? '')].some(s => s?.toLowerCase().includes(f.q.toLowerCase()))) return false;
  if (r.state === 'ID') {
    if (f.deerType.length && !f.deerType.includes(r.tagCode?.startsWith('WD') ? 'WHITETAIL' : r.deerType as 'MULE')) return false;
    if (!atLeast(r.bigPct5, f.minBig, 100)) return false;
    if (!atLeast(r.accessYesPct, f.minAccessYes) || !atLeast(r.huntablePct, f.minHuntable)) return false;
    if (f.accessYes && !(r.accessYesCount && r.accessYesCount > 0)) return false;
    if (f.leftover && !(r.leftoverTags && r.leftoverTags > 0)) return false;
    if (f.zones.length && !r.units.some(u => zoneUnits(f.zones).includes(u))) return false;
    for (const [sex, statuses] of [['bull', f.bullObj], ['cow', f.cowObj]] as const) {
      if (statuses.length && (r.species !== 'ELK' || !r.units.some(u => unitsWithObjective(sex, statuses).includes(u)))) return false;
    }
    if (f.migration) {
      const has = r.units.some(u => migrations[r.species]?.includes(u));
      if (has !== (f.migration === 'yes')) return false;
    }
  } else if (r.state === 'CO') {
    if (r.privateOnly && param(sp, 'priv') !== '1') return false;
    if (!matchesCoSeason(r.tagCode ?? '', list(sp, 'season'))) return false;
    const need = x.nr ? r.ptsNr : r.ptsRes;
    for (const key of ['minPts', 'maxPts']) if (param(sp, key) !== '') {
      const n = Number(param(sp, key));
      if (Number.isFinite(n) && (need === null || (key === 'minPts' ? need < n : need > n))) return false;
    }
    if (param(sp, 'second') === '1' && !r.secondChoice) return false;
    if (param(sp, 'hybrid') === '1' && !r.hybrid) return false;
    if (param(sp, 'chance')) {
      const chance = chanceOf(odds, 0, odds ?? 0);
      // UI uses the agency model's published chance labels.
      if (!list(sp, 'chance').includes(chance)) return false;
    }
  }
  return true;
}

const desc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity) || 0;
export function compareSearch(a: SearchResult, b: SearchResult, sort: string): number {
  const metric = (x: SearchResult): number | null => {
    const r = x.r;
    switch (sort) {
      case 'best': return x.odds !== null && r.success5 !== null ? x.odds * r.success5 : null;
      case 'leftover': return r.state === 'ID' ? r.leftoverTags : null;
      case 'odds': return x.odds;
      case 'score': return r.scoreQuality;
      case 'success': return r.success5;
      case 'public': return r.publicPct;
      case 'big': return r.bigPct5 ?? r.avgSize5;
      case 'harvest': return r.harvest5;
      case 'hunters': case 'huntersLow': return r.hunters5;
      case 'densityLow': return r.huntersSqMi;
      case 'apps': case 'appsLow': return x.nr ? r.nrAppsLast : r.resAppsLast;
      case 'open': return r.openDate ? +r.openDate : null;
      case 'pts': return x.nr ? r.ptsNr : r.ptsRes;
      case 'tags': return r.tags;
      case 'creep': return x.nr ? r.creepNr : r.creepRes;
      default: return x.opportunity;
    }
  };
  const low = ['huntersLow', 'densityLow', 'appsLow', 'open', 'pts', 'creep'].includes(sort);
  const av = metric(a), bv = metric(b);
  const order = sort === 'alpha' || sort === 'unit' ? searchUnitKey(a.r.state, a.r.units[0] ?? '').localeCompare(searchUnitKey(b.r.state, b.r.units[0] ?? ''), undefined, { numeric: true })
    : low ? av === null ? bv === null ? 0 : 1 : bv === null ? -1 : av - bv : desc(av, bv);
  return order || desc(a.r.scoreQuality, b.r.scoreQuality) || a.r.id.localeCompare(b.r.id);
}

export function runSearch(rows: CoScored[], sp: SearchParams, fallback: StateCode, settings: HunterSettings, migrations: Partial<Record<string, string[]>> = {}, overlaps: Record<string, boolean | null> = {}) {
  const states = searchStates(sp.states, fallback);
  const filters = searchFilters(sp);
  const mode = param(sp, 'odds') === 'last' ? 'last' : 'proj';
  const results = rows.filter(r => states.includes(r.state as StateCode)).map(r => personalize(r, settings, mode))
    .filter((x): x is SearchResult => x !== null && matchesSearch(x, filters, sp, migrations)
      && (x.r.state !== 'CO' || !['0', '1'].includes(param(sp, 'otcElk')) || (x.r.species === 'DEER' && overlaps[x.r.id] === (param(sp, 'otcElk') === '1'))));
  return results.sort((a, b) => compareSearch(a, b, param(sp, 'sort') || 'opp'));
}
