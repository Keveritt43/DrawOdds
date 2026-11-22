import { matchesIdFire } from './idFire';
import { matchesIdTerrain } from './idTerrain';
import { matchesHuntPreset, matchesTiming, parseHuntPresets } from './huntPresets';
import type { Residency } from '@prisma/client';
import { parseFilters, type Filters } from './finder';
import { matchesHuntSeason } from './huntSeasonFilter';
import { matchesCoSeason, tableOdds, poolFor, type OddsTable, type PointOdds } from './coHunt';
import { opportunity } from './score';
import { unitsWithObjective } from './elkObjectives';
import { zoneUnits } from './finder';
import { type StateCode } from './states';
import { searchDraw, searchStates, searchUnitKey } from './searchStates';
export { ID_RESTRICTIONS, CO_RESTRICTIONS, WY_RESTRICTIONS, MT_RESTRICTIONS, UT_RESTRICTIONS, WA_RESTRICTIONS, NM_RESTRICTIONS, OR_RESTRICTIONS, NV_RESTRICTIONS, AZ_RESTRICTIONS } from './searchStates';
import { wyPool, wyNeed, wyTableOdds, wyBasis, type WyOddsTable, type WyPointOdds } from './wyHunt';
import { matchesWyTagType } from './wyTagType';
import { wyHuntWilderness } from './wyWilderness';
import type { StatePoints } from './points';
import type { CoScored } from './coScores';
import { SEARCH_DRAW_SPECIES } from './species';
import { coSpecial, specialCounts } from './coSpecial';
import { specialPersonalOdds, specialOddsBasis, specialPointSetting } from './coSpecialPoints';
import { chanceOf } from './coOdds';
import { isPrivateOnly, showPrivate } from './privateLand';
import { mtKind, mtPersonal, type MtPointOdds } from './mtHunt';
import { mtBma, mtAccessPct } from './mtBma';
import type { MtPoints } from './mtPoints';
import { utPersonal, utKind, utPreferenceCutoff, type UtPointOdds } from './utHunt';
import { readUtPoints, type UtPoints } from './utPoints';
import { waPersonal, waLicense, waPo } from './waHunt';
import { readWaPoints, type WaPoints } from './waPoints';
import { nmPersonal, nmLicense, nmPo, nmEligible, nmRestricted } from './nmHunt';
import { readNmSettings, type NmSettings, type NmPool } from './nmSettings';
import { orPersonal, orPo, orIsGeneral, orPrefCutoff } from './orHunt';
import { readOrPoints, type OrPoints } from './orPoints';
import { nvPersonal, nvPo } from './nvHunt';
import { readNvPoints, type NvPoints } from './nvPoints';
import { azPersonal, azPo } from './azHunt';
import { readAzPoints, type AzPoints } from './azPoints';
import { withoutUnvalidatedWyDeerMetrics, wyDeerMix } from './wyDeerMetrics';
import { trophyForHunt } from './trophyHunt';
import { withStateTrophyScores } from './stateTrophyScores';

export type SearchParams = Record<string, string | string[] | undefined>;
export type HunterSettings = { ID: Residency; CO: StatePoints; WY?: StatePoints; MT?: MtPoints; UT?: UtPoints; WA?: WaPoints; NM?: NmSettings; OR?: OrPoints; NV?: NvPoints; AZ?: AzPoints };
export interface SearchResult {
  r: CoScored;
  odds: number | null;
  opportunity: number | null;
  nr: boolean;
  points: number | null;
  basis: string;
  /** Montana nonresident deer/elk permit: `odds` is both draws; these are the permit draw (shown as the draw odds,
   *  assuming the combination is drawn) and the combination draw (shown beneath it). */
  mtParts?: { combo: number | null; permit: number | null; comboName: string };
  applicants?: number;
  /** Wyoming nonresidents: points needed in the pool shown (regular or special). */
  need?: number | null;
  /** Washington: whether the hunter's saved general tag can apply for this special permit (null: can't tell). */
  waTagOk?: boolean | null;
  /** New Mexico: the drawing pool the odds are for (resident, nonresident 6% or outfitter 10%). */
  nmPool?: NmPool;
  meetsObservedCutoff?: boolean;
}
export const param = (sp: SearchParams, k: string) => (Array.isArray(sp[k]) ? sp[k]!.join(',') : sp[k] ?? '') as string;
const list = (sp: SearchParams, k: string) => param(sp, k).split(',').filter(Boolean);
const atLeast = (value: number | null, min: number | null, scale = 1) => min === null || (value !== null && value >= min / scale);

export function searchFilters(sp: SearchParams): Filters {
  // No implicit Quality cutoff: incomplete but usable hunts remain visible after ranked hunts.
  const filters = parseFilters({ ...sp, antler: sp.antler ?? (searchDraw(param(sp, 'draw'), param(sp, 'species').toUpperCase()) === 'MSG' ? 'ALL' : undefined), sort: param(sp, 'sort') || 'opp', minScore: param(sp, 'minScore') || '0',
    minSuccess: sp.minSuccess ?? sp.minSucc,
    weapon: sp.weapon ?? (param(sp, 'method') ? list(sp, 'method').map(m => ({ R: 'ANY', A: 'ARCHERY', M: 'MUZZLELOADER' })[m] ?? m).join(',') : undefined) });
  if (filters.species && filters.species !== 'DEER') filters.deerType = [];
  return filters;
}

/** All personal values are derived on copies; the public cached rows are never modified. */
/** Residency for a row's state: Idaho's profile residency, else that state's saved settings. */
export const isNonresident = (state: string, settings: HunterSettings) =>
  (state === 'ID' ? settings.ID : state === 'WY' ? settings.WY?.res ?? 'NONRESIDENT' : state === 'MT' ? settings.MT?.res ?? 'NONRESIDENT' : state === 'UT' ? settings.UT?.res ?? 'NONRESIDENT' : state === 'WA' ? settings.WA?.res ?? 'NONRESIDENT' : state === 'NV' ? settings.NV?.res ?? 'NONRESIDENT' : state === 'AZ' ? settings.AZ?.res ?? 'NONRESIDENT' : state === 'NM' ? settings.NM?.res ?? 'NONRESIDENT' : state === 'OR' ? settings.OR?.res ?? 'NONRESIDENT' : settings.CO.res) === 'NONRESIDENT';

export function personalize(r: CoScored, settings: HunterSettings, mode: 'last' | 'proj'): SearchResult | null {
  const nr = isNonresident(r.state, settings);
  if (r.state === 'ID' && r.nrTag && !nr && r.species !== 'ELK') return null;
  // Nonresidents choose a deer tag, so do not also list its unit general seasons.
  if (nr && r.state === 'ID' && r.species === 'DEER' && r.type === 'GENERAL' && !r.nrTag) return null;
  // Match the Idaho listing: zone tags replace duplicated per-weapon general elk rows.
  if (r.state === 'ID' && r.type === 'GENERAL' && !r.nrTag && r.species === 'ELK') return null;
  // New Mexico: resident-only, WMA-only and antlerless elk licenses aren't issued to nonresidents (2026-27 booklet p. 17)
  if (r.state === 'NM' && !nmEligible(r, settings.NM ?? readNmSettings(null))) return null;
  const general = (r.pointOdds as unknown as PointOdds | null)?.general;
  if (r.state === 'CO' && general && !(nr ? general.nonresident : general.resident)) return null;
  return evaluateHunt(r, settings, mode);
}

/** Personal metrics without finder visibility rules, also used for explicitly chosen comparisons. */
// The public corrections and trophy scores below depend only on the row, never on the hunter, and the search
// index keeps the same row objects for minutes, so each row is prepared once instead of on every search.
// Process-wide for the same reason as the search index (src/lib/searchData.ts): the warm-up and the pages are separate bundles.
const sharedPrep = globalThis as typeof globalThis & { __drawoddsPreparedRows?: WeakMap<CoScored, CoScored> };
const preparedRows = (sharedPrep.__drawoddsPreparedRows ??= new WeakMap<CoScored, CoScored>());
export function preparePublic(raw: CoScored): CoScored {
  const hit = preparedRows.get(raw);
  if (hit) return hit;
  let r = withStateTrophyScores(raw);
  r = withoutUnvalidatedWyDeerMetrics(r);
  r = {...r,scoreTrophy:trophyForHunt(r)};
  preparedRows.set(raw, r);
  return r;
}

export function evaluateHunt(r: CoScored, settings: HunterSettings, mode: 'last' | 'proj'): SearchResult {
  r = preparePublic(r);
  const nr = isNonresident(r.state, settings);
  if (r.state === 'MT') {
    // unsaved settings: 0 points, buying, nonresident (src/lib/mtPoints.ts readMtPoints defaults)
    const mt = settings.MT ?? { res: 'NONRESIDENT', combo: 0, comboType: 'BIG_GAME' as const, bonus: { DEER_PERMIT: 0, ELK_PERMIT: 0, ANTELOPE: 0, DEER_B: 0, ELK_B: 0, ANTELOPE_B: 0 },
      buying: { DEER_PERMIT: true, ELK_PERMIT: true, ANTELOPE: true, DEER_B: true, ELK_B: true, ANTELOPE_B: true }, set: false } as MtPoints;
    const m = mtPersonal(r, mt, nr, mode);
    const opp = opportunity(r.scoreQuality, m.odds);
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: m.odds, opportunity: opp, nr, points: m.points, basis: m.basis, mtParts: m.parts };
  }
  if (r.state === 'WA') {
    // one pool for residents and nonresidents; unsaved settings: 0 points, no tag (src/lib/waPoints.ts readWaPoints)
    const w = waPersonal(r, settings.WA ?? readWaPoints(null), mode);
    const opp = opportunity(r.scoreQuality, w.odds);
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: w.odds, opportunity: opp, nr, points: w.points, basis: w.basis, waTagOk: w.tagOk };
  }
  if (r.state === 'NM') {
    // no points; unsaved settings: nonresident, no outfitter (src/lib/nmSettings.ts readNmSettings)
    const m = nmPersonal(r, settings.NM ?? readNmSettings(null), mode);
    const opp = opportunity(r.scoreQuality, m.odds);
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: m.odds, opportunity: opp, nr, points: null, basis: m.basis, nmPool: m.pool };
  }
  if (r.state === 'NV') {
    // unsaved settings: nonresident, 0 points (src/lib/nvPoints.ts readNvPoints defaults); always the 2025 draw
    const v = nvPersonal(r, settings.NV ?? readNvPoints(null), nr);
    const opp = opportunity(r.scoreQuality, v.odds);
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: v.odds, opportunity: opp, nr, points: v.points, basis: v.basis };
  }
  if (r.state === 'AZ') {
    // unsaved settings: nonresident, 0 points (src/lib/azPoints.ts readAzPoints defaults); always the 2026 draw
    const v = azPersonal(r, settings.AZ ?? readAzPoints(null), nr);
    const opp = opportunity(r.scoreQuality, v.odds);
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: v.odds, opportunity: opp, nr, points: v.points, basis: v.basis };
  }
  if (r.state === 'OR') {
    // residents and nonresidents share one queue but nonresidents stop at 5% of the tags, so ODFW reports each
    // pool; unsaved settings: nonresident, 0 points (src/lib/orPoints.ts readOrPoints)
    const o = orPersonal(r, settings.OR ?? readOrPoints(null), nr, mode);
    const opp = opportunity(r.scoreQuality, o.odds);
    const cut = orIsGeneral(r) ? null : orPrefCutoff(orPo(r), nr ? 'nr' : 'res');
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: o.odds, opportunity: opp, nr, points: o.points, basis: o.basis,
      meetsObservedCutoff: !!settings.OR?.set && o.points !== null && cut !== null && cut.points <= o.points };
  }
  if (r.state === 'UT') {
    // unsaved settings: nonresident, 0 points (src/lib/utPoints.ts readUtPoints defaults)
    const u = utPersonal(r, settings.UT ?? readUtPoints(null), nr, mode);
    const opp = opportunity(r.scoreQuality, u.odds);
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds: u.odds, opportunity: opp, nr, points: u.points, basis: u.basis, meetsObservedCutoff: !!settings.UT?.set && utKind(r) === 'preference' && u.points !== null && utPreferenceCutoff(r.pointOdds as unknown as UtPointOdds | null, nr) !== null && utPreferenceCutoff(r.pointOdds as unknown as UtPointOdds | null, nr)! <= u.points };
  }
  if (r.state === 'WY') {
    const wy = settings.WY;
    const points = nr ? wy?.[r.species as 'DEER' | 'ELK' | 'PRONGHORN'] ?? 0 : null;
    const pool = wyPool(nr, wy?.wySpecial === true);
    const table = r.oddsByPts as unknown as WyOddsTable | null;
    // a special-pool hunter can still fall back to the regular pool only by applying there; never mix pools
    const odds = wyTableOdds(table, mode, pool, points ?? 0);
    const basis = wyBasis(pool, mode, points ?? 0, r.pointOdds as unknown as WyPointOdds | null);
    const opp = opportunity(r.scoreQuality, odds);
    const wyPo = r.pointOdds as unknown as WyPointOdds | null;
    const observed = pool === 'nrs' ? wyPo?.pools?.special : pool === 'nr' ? wyPo?.pools?.regular : undefined;
    return { r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds, opportunity: opp, nr, points, basis, need: nr ? wyNeed(wyPo, pool) : null, meetsObservedCutoff: !!wy?.set && points !== null && !!observed?.pref?.rows?.some(row => typeof row[1] === 'number' && row[1] > 0 && (row[2] === 'e' || row[2] === 'p') && row[3] <= points) };
  }
  const special = coSpecial(r);
  const points = special ? settings.CO.specialSet ? specialPointSetting(special, settings.CO)?.weighted ?? null : null : r.state === 'CO' ? settings.CO[r.species as 'DEER' | 'ELK' | 'PRONGHORN'] ?? 0 : null;
  const general = (r.pointOdds as unknown as PointOdds | null)?.general;
  let odds: number | null;
  let basis: string;
  if (special) {
    odds = specialPersonalOdds(special, nr, settings.CO);
    basis = specialOddsBasis(special, settings.CO) + (special.draws[0].shared ? ' · shared pool' : '');
  } else if (r.state === 'CO') {
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
  const applicants = special ? specialCounts(special.draws[0], nr, settings.CO.youth).apps : undefined;
  const coPool = r.state === 'CO' && !special ? (r.pointOdds as unknown as PointOdds | null)?.pools?.[poolFor(nr, settings.CO.youth)] : null;
  const cutoff = coPool?.cut?.points;
  const meetsObservedCutoff = !!settings.CO.set && points !== null && typeof cutoff === 'number' && cutoff <= points && !!coPool?.levels?.some(([p, , drawn]) => p === cutoff && drawn > 0);
  return { applicants, r: { ...r, scoreOppRes: nr ? null : opp, scoreOppNr: nr ? opp : null }, odds, opportunity: opp, nr, points, basis, meetsObservedCutoff };
}

export function matchesSearch(x: SearchResult, f: Filters, sp: SearchParams, migrations: Partial<Record<string, string[]>> = {}): boolean {
  const { r, odds } = x;
  const presets = parseHuntPresets(param(sp, 'huntPreset'));
  // Past cutoffs describe observed draws and do not guarantee a future tag.
  const cutoffAtOrBelowPoints = x.meetsObservedCutoff === true;
  if (presets.length && !presets.some(p => matchesHuntPreset(p, r, odds, cutoffAtOrBelowPoints, f))) return false;
  if (f.species && r.species !== f.species) return false;
  if (f.type && r.type !== f.type) return false;
  // Picking a Washington youth category is asking for youth hunts, even with the shared Youth Hunts filter on Hide.
  const waYouth = r.state === 'WA' && f.youth === 'exclude' && list(sp, 'waCat').some((c) => c.endsWith('Youth'));
  if (!matchesHuntSeason(r, waYouth ? { ...f, youth: 'include' } : f, true) &&
      !(r.state === 'WY' && ['DEER','PRONGHORN'].includes(r.species) && presets.includes('peak-rut') &&
        r.scoreTrophy !== null && r.scoreTrophy >= 65 && matchesTiming(r, f))) return false;
  if (f.trophy.length && (r.scoreTrophy===null || !f.trophy.includes(r.scoreTrophy))) return false;
  const accessMin = Number(param(sp, 'minAccessLand'));
  if (Number.isFinite(accessMin) && accessMin > 0) {
    const mtAccess = r.state === 'MT' ? mtAccessPct(mtBma(r.units, r.species), false) : null;
    const land = r.state === 'ID' ? r.huntablePct : r.state === 'MT'
      ? r.publicPct === null || mtAccess === null ? null : Math.min(100, r.publicPct + mtAccess)
      : r.publicPct;
    if (!atLeast(land, Math.min(100, accessMin))) return false;
  }
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
  // shared across states: hidden by default, `priv=1` shows them everywhere
  if (isPrivateOnly(r) && !showPrivate(k => param(sp, k))) return false;
  if (f.q && ![r.name, r.areaName, r.tagCode, String(r.huntNumber ?? '')].some(s => s?.toLowerCase().includes(f.q.toLowerCase()))) return false;
  if (r.state === 'ID') {
    if (!matchesIdFire(r, param(sp, 'idFire'), param(sp, 'idFireMin'), param(sp, 'idRemote'), param(sp, 'idHigh'))) return false;
    if (!matchesIdTerrain({ ...r, privateOnly: isPrivateOnly(r) }, param(sp, 'idRemote'), param(sp, 'idHigh'))) return false;
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
  } else if (r.state === 'WY') {
    if (!matchesWyTagType(r, list(sp, 'wyType'))) return false;
    const deerMix = list(sp, 'wyDeer');
    if (deerMix.length && (r.species !== 'DEER' || !deerMix.includes(wyDeerMix(r.pointOdds) ?? ''))) return false;
    for (const key of ['wyMinPts', 'wyMaxPts']) if (param(sp, key) !== '') {
      const n = Number(param(sp, key));
      if (Number.isFinite(n) && x.nr && (x.need == null || (key === 'wyMinPts' ? x.need < n : x.need > n))) return false;
    }
    // W.S. 23-2-401(a): a nonresident needs a guide inside designated wilderness. The rule follows the wilderness
    // boundary, not the hunt area, so this filters on whether an area contains any - never on how much of it.
    const wild = param(sp, 'wyWild');
    if (wild === 'none' || wild === 'has') {
      if ((wild === 'has') !== (wyHuntWilderness(r.units).length > 0)) return false;
    }
  } else if (r.state === 'MT') {
    const kinds = list(sp, 'mtLic');
    if (kinds.length && !kinds.includes(mtKind(r.pointOdds as unknown as MtPointOdds | null) ?? '')) return false;
    // mule deer or whitetail: the licence's own regulation rows say which deer it allows (both = either choice)
    const deer = list(sp, 'mtDeer');
    if (deer.length && !(r.species === 'DEER' && ((r.pointOdds as unknown as MtPointOdds | null)?.deer ?? ['MULE', 'WHITETAIL']).some((d) => deer.includes(d)))) return false;
    // Block Management: Type 1 (self sign-in) counts by default; Type 2 (landowner/FWP permission) only on request
    if (!matchesMtBma(r, sp)) return false;
  } else if (r.state === 'UT') {
    for (const key of ['utMinPts', 'utMaxPts']) if (param(sp, key) !== '') {
      const n = Number(param(sp, key));
      const cutoff = utPreferenceCutoff(r.pointOdds as unknown as UtPointOdds | null, x.nr);
      if (Number.isFinite(n) && (cutoff === null || (key === 'utMinPts' ? cutoff < n : cutoff > n))) return false;
    }
    const kinds = list(sp, 'utLic');
    if (kinds.length && !kinds.includes(utLicense(r))) return false;
  } else if (r.state === 'WA') {
    const po = waPo(r);
    const kinds = list(sp, 'waLic');
    if (kinds.length && !kinds.includes(waLicense(r))) return false;
    const cats = list(sp, 'waCat');
    if (cats.length && !cats.includes(po?.category ?? '')) return false;
    // 65+, hunters-with-disabilities and Master Hunter permits only show when their category is picked
    if (po?.restricted && !cats.includes(po.category ?? '')) return false;
    const weapons = list(sp, 'waWeapon');
    if (weapons.length && !weapons.includes(r.weapon)) return false;
    const sides = list(sp, 'waSide');
    if (sides.length && r.species === 'ELK' && waLicense(r) === 'general' && !sides.includes(po?.side ?? '')) return false;
    if (param(sp, 'waMyTag') === '1' && waLicense(r) === 'special' && x.waTagOk === false) return false;
  } else if (r.state === 'NM') {
    const po = nmPo(r);
    const kinds = list(sp, 'nmLic');
    if (kinds.length && !kinds.includes(nmLicense(r))) return false;
    // FAMD mule deer only, FAWTD/ESWTD white-tailed only, FAD either: a hunt allowing both matches either choice
    const deer = list(sp, 'nmDeer');
    if (deer.length && !(r.species === 'DEER' && (r.deerType === 'MIXED' ? ['MULE', 'WHITETAIL'] : [r.deerType ?? '']).some((d) => deer.includes(d)))) return false;
    // mobility-impaired and military-only hunts only show when asked for
    const who = list(sp, 'nmWho');
    if (nmRestricted(r) && !((po?.mobility && who.includes('mobility')) || (po?.military && who.includes('military')))) return false;
    const fees = list(sp, 'nmFee');
    if (fees.length && !fees.some((f) => (po?.fee ?? '').split('/').includes(f))) return false;
  } else if (r.state === 'NV') {
    const cats = list(sp, 'nvCat');
    if (cats.length && !cats.includes(nvCategoryGroup(nvPo(r)?.category))) return false;
  } else if (r.state === 'AZ') {
    const po = azPo(r);
    const lic = list(sp, 'azLic');
    if (lic.length && !lic.includes(po?.license ?? '')) return false;
    // CHAMP hunts need AZGFD's mobility permit: they show only when asked for
    if (po?.restricted && !lic.includes('champ')) return false;
    const deer = list(sp, 'azDeer');
    if (deer.length && !(r.species === 'DEER' && deer.includes(r.deerType ?? ''))) return false;
  } else if (r.state === 'OR') {
    const po = orPo(r);
    const kinds = list(sp, 'orLic');
    if (kinds.length && !kinds.includes(orIsGeneral(r) ? 'general' : 'controlled')) return false;
    const series = list(sp, 'orSeries');
    if (series.length && !orIsGeneral(r) && !series.includes(po?.series ?? '')) return false;
    // "*" hunts (ODFW: private lands will limit access; don't apply without a place to hunt) only on request
    if (param(sp, 'orLimited') === 'hide' && po?.privateLimited) return false;
    for (const key of ['orMinPts', 'orMaxPts']) if (param(sp, key) !== '') {
      const n = Number(param(sp, key));
      const cut = orIsGeneral(r) ? null : orPrefCutoff(po, x.nr ? 'nr' : 'res');
      if (Number.isFinite(n) && (cut === null || (key === 'orMinPts' ? cut.points < n : cut.points > n))) return false;
    }
  } else if (r.state === 'CO') {
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

/** Montana Block Management filters (`mtMinBma`, `mtMinHuntable`, `mtHasBma`, `mtBma2`). Type 2 is added only
 *  with `mtBma2=1`. A private-land-only licence has no public land, but BMA ground (private) still counts for it. */
export function matchesMtBma(r: { units: string[]; species: string; publicPct: number | null; privateOnly?: boolean | null }, sp: SearchParams): boolean {
  const minBma = param(sp, 'mtMinBma'), minHunt = param(sp, 'mtMinHuntable'), has = param(sp, 'mtHasBma') === '1';
  if (!minBma && !minHunt && !has) return true;
  const two = param(sp, 'mtBma2') === '1';
  const b = mtBma(r.units, r.species);
  const access = mtAccessPct(b, two);
  // enrolled private acres, not a count: a BMA touching the district only on public parcels adds nothing
  if (has && !(b && (b.t1 > 0 || (two && b.t2 > 0)))) return false;
  if (minBma && !atLeast(access, Number(minBma))) return false;
  if (minHunt) {
    const pub = r.privateOnly ? 0 : r.publicPct;
    const huntable = pub === null || access === null ? null : Math.min(100, pub + access);
    if (!atLeast(huntable, Number(minHunt))) return false;
  }
  return true;
}

/** Utah hunt type for the "Utah: Hunt Type" filter: limited-entry (incl. premium and management buck), CWMU,
 *  once in a lifetime (bison), general-season draw (buck deer), or over the counter (general elk). */
export function utLicense(r: { tagCode: string | null; species: string; type: string; oddsByPts: unknown; pointOdds: unknown; areaName?: string | null; name: string; privateOnly?: boolean | null }): 'le' | 'oial' | 'cwmu' | 'general' | 'otc' {
  const k = utKind(r);
  if (k === 'otc') return 'otc';
  if (r.type === 'GENERAL') return 'general';
  return r.privateOnly ? 'cwmu' : r.species === 'BISON' ? 'oial' : 'le';
}

/** Nevada hunt group for the "Nevada: Hunt Type" filter, one per NDOW bonus-point category. */
export function nvCategoryGroup(category: string | null | undefined): string {
  const c = category ?? '';
  return c.startsWith('deer-jr') ? 'junior' : c.startsWith('deer') ? 'deer' : c === 'elk-spike' ? 'spike' : c.startsWith('elk-bull') ? 'bull' : c.startsWith('elk-cow') ? 'cow' : '';
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
      case 'trophy': return r.scoreTrophy;
      case 'big': return r.bigPct5 ?? r.avgSize5;
      case 'harvest': return r.harvest5;
      case 'hunters': case 'huntersLow': return r.hunters5;
      case 'densityLow': return r.huntersSqMi;
      case 'apps': case 'appsLow': return x.applicants ?? (x.nr ? r.nrAppsLast : r.resAppsLast);
      case 'open': return (r.tagSeasons as {seasons?:{uncertain?:boolean}[]}|null)?.seasons?.some(s=>s.uncertain) ? null : r.openDate ? +r.openDate : null;
      case 'pts': return r.state === 'WY' && x.nr ? x.need ?? null : x.nr ? r.ptsNr : r.ptsRes;
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
  const species = SEARCH_DRAW_SPECIES[searchDraw(param(sp, 'draw'), filters.species)];
  const results = rows.filter(r => states.includes(r.state as StateCode) && species.includes(r.species)).map(r => personalize(r, settings, mode))
    .filter((x): x is SearchResult => x !== null && matchesSearch(x, filters, sp, migrations)
      && (x.r.state !== 'CO' || !['0', '1'].includes(param(sp, 'otcElk')) || (x.r.species === 'DEER' && overlaps[x.r.id] === (param(sp, 'otcElk') === '1'))));
  return results.sort((a, b) => compareSearch(a, b, param(sp, 'sort') || 'opp'));
}
