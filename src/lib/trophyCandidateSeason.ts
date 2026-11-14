/** Review-only hunt-season illustration for the proposed Scenario A model. */
import source from '../../data/trophy-source-western-v3.json';
import demand from '../../data/trophy-demand-review-2026.json';
import { resolveTrophyCandidate, type CandidateHunt } from './trophyCandidateResolver';
import type { CandidateScore, CandidateTier } from './trophyCandidateTier';

const byId = new Map(source.records.map(r => [r.id, r]));
const lower: Record<CandidateScore, CandidateScore> = {50:50, 65:50, 80:65, 100:80};
const capGood = (score: CandidateScore): CandidateScore => score > 65 ? 65 : score;

/** Separately compare Colorado's regular weapon/season cohorts when a dated source observation exists. */
export function resolveSeasonCandidate(h: CandidateHunt): CandidateTier & { sourceIds: string[] } {
  const base = resolveTrophyCandidate(h);
  if (h.state.toUpperCase() !== 'CO') return base;
  const species = h.species.toUpperCase();
  const code = h.huntCode ?? '';
  const validRegular = /^([DEA])[ME]\d{3}[OU][1-4][ARM]$/i.test(code);
  const sourceScopes = base.sourceIds.map(id => byId.get(id)?.scope ?? '').join(' ');
  const coDeerLate = species === 'DEER' && /(?:3rd|4th|third|fourth)/i.test(sourceScopes);
  const isThirdOrFourthRifle = /^[D][ME]\d{3}[OU][34]R$/i.test(code);
  if (!validRegular || (coDeerLate && !isThirdOrFourthRifle))
    return {...base, score:capGood(base.score), provisional:true, reason:'Season or access restrictions require hunt-specific source review'};
  const observation = demand.seasonDemand.find(r => r.state === 'CO' && r.species === species && r.unit === h.unit &&
    r.code === code && r.year === h.drawYear && r.apps === h.applications);
  if (!observation)
    return {...base, score:capGood(base.score), provisional:true, reason:'No matching comparable weapon/season demand observation'};
  if (!observation.high)
    return {...base, score:lower[base.score], reason:`Below the top quartile among ${observation.peers} same-season peers; demand does not measure animal size`};
  return {...base, reason:`Top quartile among ${observation.peers} same-season peers; source-list unit tier retained`};
}
