import type { HuntSummary } from '@prisma/client';
import { trophyForHunt } from './trophyHunt';
import { scoreHunts } from './score';

/** WGFD reports deer by species: a license holder who hunted both is counted in each table, so the stored combined
 * rate (all deer ÷ the larger table) is only an upper bound. Each species' own rate is WGFD's published hunter success
 * for that species. Where one species is ≥60% of the harvest (Idaho's harvest-mix rule), that species' rate is the
 * hunt's success, density and score input; mixed hunts, region sums and hunts without species rows stay withheld. */
export function withoutUnvalidatedWyDeerMetrics<T extends HuntSummary>(row: T): T {
  if (row.state !== 'WY' || row.species !== 'DEER') return row;
  const mix = wyDeerMix(row.pointOdds);
  const series = mix === 'MULE' || mix === 'WHITETAIL' ? wyDeerSeries(row.pointOdds, mix).slice(-5) : [];
  const hunters5 = series.reduce((n, x) => n + x.hunters, 0), harvest5 = series.reduce((n, x) => n + x.harvest, 0);
  if (series.length && hunters5 > 0) {
    const last = series[series.length - 1];
    const sqmi = row.acres ? row.acres / 640 : null;
    const fixed = { ...row, success5: harvest5 / hunters5, successLast: last.hunters > 0 ? last.harvest / last.hunters : null,
      hunters5, harvest5, harvestYears: series.length, harvestLastYear: last.year,
      huntersSqMi: sqmi ? hunters5 / series.length / sqmi : null, daysPerHunter5: null, daysPerHarvest5: null,
      resTagAndFill: null, nrTagAndFill: null };
    const sc = scoreHunts([{ ...fixed, publicPct: row.privateOnly ? (row.publicPct === null ? null : 0) : row.publicPct, huntablePct: null, nrTag: false }]).get(row.id);
    return { ...fixed, ...(sc ?? {}), scoreTrophy: trophyForHunt(fixed) } as T;
  }
  return { ...row, success5: null, successLast: null, hunters5: null, harvest5: null,
    huntersSqMi: null, daysPerHunter5: null, daysPerHarvest5: null, resTagAndFill: null, nrTagAndFill: null,
    scoreQuality: null, scoreSuccess: null, scoreAccess: null, scoreCrowd: null,
    scoreTrophy: trophyForHunt(row), scoreOppRes: null, scoreOppNr: null };
}

export type WyDeerKind = 'MULE' | 'WHITETAIL';
export type WyDeerObservation = { year: number; hunters: number; harvest: number; success: number | null };
/** WGFD license-type rows count active licenses, not unique hunters. Region aggregates lack species detail. */
export function wyDeerSeries(pointOdds: unknown, kind: WyDeerKind): WyDeerObservation[] {
  const po = pointOdds as { harvest?: unknown; harvestBasis?: string } | null;
  if (!po || po.harvestBasis || !Array.isArray(po.harvest)) return [];
  return po.harvest.flatMap((value: unknown) => {
    const r = value as Record<string, unknown>;
    if (!r || r.basis !== 'mule+whitetail') return [];
    const hunters = r[kind === 'MULE' ? 'huntersMule' : 'huntersWhitetail'];
    const harvest = r[kind === 'MULE' ? 'mule' : 'whitetail'];
    if (typeof r.year !== 'number' || !Number.isInteger(r.year) || typeof hunters !== 'number' || !Number.isFinite(hunters) || hunters < 0 || typeof harvest !== 'number' || !Number.isFinite(harvest) || harvest < 0 || harvest > hunters) return [];
    return [{ year: r.year, hunters, harvest, success: hunters > 0 ? harvest / hunters : null }];
  }).sort((a, b) => a.year - b.year);
}
/** Idaho's harvest-mix thresholds, using only years with both species reported. */
export function wyDeerMix(pointOdds: unknown): 'MULE' | 'WHITETAIL' | 'MIXED' | null {
  const mule = wyDeerSeries(pointOdds, 'MULE'), white = wyDeerSeries(pointOdds, 'WHITETAIL');
  const pairs = mule.flatMap(m => { const w = white.find(x => x.year === m.year); return w ? [{m, w}] : []; }).slice(-5);
  const m = pairs.reduce((n, p) => n + p.m.harvest, 0), w = pairs.reduce((n, p) => n + p.w.harvest, 0);
  if (!m && !w) return null;
  const share = w / (m + w);
  return share >= .6 ? 'WHITETAIL' : share <= .4 ? 'MULE' : 'MIXED';
}
