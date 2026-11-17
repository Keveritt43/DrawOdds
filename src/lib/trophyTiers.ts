/** Trophy tier types and the Quality modifier. Tiers are assigned per unit in `trophyHunt.ts`.
 * Scores describe recognition, not absence of trophy animals.
 * (The earlier hard-coded `classifyTrophy` rules, which also covered unsupported AZ/NM/NV
 * units, were removed on 2026-11-16; nothing in the product used them.) */
export type TrophyTier = 'unicorn' | 'trophy' | 'county' | 'unclassified';
export type TrophyScore = 100 | 80 | 65 | 50;
/** Neutral at 50; maximum +5 points before the existing success ceiling. */
export function trophyQualityBonus(score: TrophyScore | null):number {
  return score === null ? 0 : (score - 50) / 10;
}
