import type { HuntSummary } from '@prisma/client';

/** Species hunter counts overlap by an unknown amount; the stored upper bound is not a measured rate. */
export function withoutUnvalidatedWyDeerMetrics<T extends HuntSummary>(row: T): T {
  if (row.state !== 'WY' || row.species !== 'DEER') return row;
  return { ...row, success5: null, successLast: null, hunters5: null, harvest5: null,
    huntersSqMi: null, daysPerHunter5: null, daysPerHarvest5: null, resTagAndFill: null, nrTagAndFill: null,
    scoreQuality: null, scoreSuccess: null, scoreAccess: null, scoreCrowd: null,
    scoreTrophy: null, scoreOppRes: null, scoreOppNr: null };
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
