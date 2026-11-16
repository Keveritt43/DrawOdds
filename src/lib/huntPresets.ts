import { timingScore } from './presetTiming';
import { sortedSeasons } from './tagSeasons';
import { matchesHuntSeason, type SeasonFilters } from './huntSeasonFilter';
import { wyPresetHarvest } from './wyPresetHarvest';
import { mtHarvestProxy, mtProxyRate } from './mtHarvestProxy';

export const HUNT_PRESETS = [
  ['max-trophy', 'Max Trophy', 'Elite trophy tier'],
  ['trophy-sleepers', 'Trophy Sleepers', 'Good or better; odds at least 10% or a qualifying observed points cutoff'],
  ['peak-rut', 'Peak Rut Hunts', 'Good or better; season timing score at least 12'],
  ['public-diy', 'Public-Land DIY', 'Good or better; at least 60% public land'],
  ['tag-filler', 'Tag Filler', 'At least 65% public land and 60% harvest success; Wyoming and some Montana deer hunts use a separately identified harvest-per-license or permit measure'],
] as const;
export type HuntPreset = typeof HUNT_PRESETS[number][0];
export function parseHuntPresets(raw: string): HuntPreset[] {
  const valid = new Set<string>(HUNT_PRESETS.map(p => p[0]));
  return [...new Set(raw.split(',').filter((p): p is HuntPreset => valid.has(p)))];
}
type Hunt = { state?: string; pointOdds?: unknown; species: string; weapon: string; openDate: Date | null; closeDate: Date | null; tagSeasons?: unknown; youthOnly: boolean; antlerClass: string; scoreTrophy: number | null; publicPct: number | null; success5: number | null };
export function matchesTiming(hunt: Hunt, filters: SeasonFilters): boolean {
  const seasons = sortedSeasons(hunt.tagSeasons);
  if (!seasons.length) return matchesHuntSeason(hunt, filters, true) && (timingScore(hunt.species, hunt.weapon, hunt.openDate, hunt.closeDate) ?? 0) >= 12;
  return seasons.some(s => s.dates.some(d => {
    const segment = { ...hunt, tagSeasons: { seasons: [{ ...s, dates: [d] }] } };
    return matchesHuntSeason(segment, filters, true) && (timingScore(hunt.species, s.weapon, d.open, d.close) ?? 0) >= 12;
  }));
}
export function matchesHuntPreset(preset: HuntPreset, hunt: Hunt, odds: number | null, cutoffAtOrBelowPoints: boolean, filters: SeasonFilters): boolean {
  const good = hunt.scoreTrophy !== null && hunt.scoreTrophy >= 65;
  switch (preset) {
    case 'max-trophy': return hunt.scoreTrophy === 100;
    case 'trophy-sleepers': return good && ((odds !== null && odds >= 0.1) || cutoffAtOrBelowPoints);
    case 'peak-rut': return good && matchesTiming(hunt, filters);
    case 'public-diy': return good && hunt.publicPct !== null && hunt.publicPct >= 60;
    case 'tag-filler': return hunt.publicPct !== null && hunt.publicPct >= 65 && (hunt.state === 'WY'
      ? wyPresetHarvest(hunt.pointOdds, hunt.species).some(row => row.rate >= .6)
      : hunt.state === 'MT' && hunt.species === 'DEER' && mtHarvestProxy(hunt.pointOdds) === 'permit'
        ? (mtProxyRate(hunt.pointOdds) ?? -1) >= .6
      : hunt.success5 !== null && hunt.success5 >= 0.6);
  }
}
