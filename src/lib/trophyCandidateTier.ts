/** Reviewable candidate rules. The source leads must be validated before product use. */
export type CandidateScore = 50 | 65 | 80 | 100;
export interface TrophyCandidateEvidence {
  listed: boolean;
  sourceCount: number;
  bcOnly: boolean;
  overallPast10Tier: 1 | 2 | 3 | 4 | null;
  statePast10Tier: 1 | 2 | 3 | 4 | null;
  /** Top-quartile within a comparable state/species/year population; null means unknown. */
  highUnitDemand: boolean | null;
  /** Same-category 95th percentile or above, with a valid sample; null means unknown. */
  exceptionalHuntDemand: boolean | null;
}
export interface CandidateTier {
  score: CandidateScore;
  provisional: boolean;
  reason: string;
}

/** Scenario A, prior to any separately reviewed hunt-season rules. */
export function candidateTier(e: TrophyCandidateEvidence): CandidateTier {
  if (!Number.isInteger(e.sourceCount) || e.sourceCount < 0) throw new Error('Invalid source count');
  if (!e.listed) {
    return e.exceptionalHuntDemand === true
      ? { score: 65, provisional: false, reason: 'Exceptional same-category hunt demand; no source-list entry' }
      : { score: 50, provisional: e.exceptionalHuntDemand === null, reason: 'No source-list entry or validated exceptional hunt demand' };
  }
  const provisional = e.overallPast10Tier === null || e.statePast10Tier === null || e.highUnitDemand === null;
  if (e.bcOnly && e.highUnitDemand !== true)
    return { score: 50, provisional, reason: e.highUnitDemand === null ? 'B&C-only association; demand unknown' : 'B&C-only association; demand below the high threshold' };
  const signals = Number(e.sourceCount >= 2) + Number(e.overallPast10Tier === 1) +
    Number(e.statePast10Tier === 1) + Number(e.highUnitDemand === true);
  let score: CandidateScore = signals >= 4 ? 100 : signals >= 2 ? 80 :
    signals >= 1 || e.overallPast10Tier === 2 || e.statePast10Tier === 2 ? 65 : 50;
  if (e.bcOnly && score === 100) score = 80;
  return { score, provisional, reason: `${signals} of 4 source, 10-year and demand signals; B&C evidence is county-wide` };
}
