/** Reviewable candidate rules. The source leads must be validated before product use. */
export type CandidateScore = 50 | 65 | 80 | 100;
export interface TrophyCandidateEvidence {
  listed: boolean;
  sourceCount: number;
  /** Named non-B&C providers, which may nevertheless share underlying data. */
  namedSourceCount?: number;
  bcOnly: boolean;
  overallPast10Tier: 1 | 2 | 3 | 4 | null;
  statePast10Tier: 1 | 2 | 3 | 4 | null;
  /** Top-quartile within a comparable state/species/year population; null means unknown. */
  highUnitDemand: boolean | null;
  /** Same-category 95th percentile or above, with a valid sample; null means unknown. */
  exceptionalHuntDemand: boolean | null;
  /** Top decile of matched hunt-category applications, distinct from unit demand. */
  topDecileHuntDemand?: boolean | null;
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
  if(e.bcOnly) return {score:e.overallPast10Tier===1 && e.statePast10Tier===1?80:65,provisional,
    reason:'B&C-only association with high comparable demand; county evidence does not establish unit harvest'};
  const named=e.namedSourceCount??e.sourceCount;
  if (named >= 2 && e.topDecileHuntDemand === true)
    return {score:100, provisional:true, reason:'Multiple named sources and top-decile comparable hunt applications; source claims and trophy size require review'};
  // Both ten-year B&C tiers describe the same county records: use one context signal.
  const countyStrong=e.overallPast10Tier===1 && e.statePast10Tier===1;
  const signals=Number(named>=2)+Number(countyStrong)+Number(e.highUnitDemand===true);
  const score: CandidateScore = signals===3 ? 100 : signals>=2 ? 80 :
    signals>=1 || named>=1 || e.overallPast10Tier===2 || e.statePast10Tier===2 ? 65 : 50;
  return {score,provisional,reason:`${signals} of 3 publication, county-context and demand signals; B&C evidence is county-wide`};
}
