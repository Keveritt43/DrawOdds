import { classifyTrophy, type TrophyScore } from './trophyTiers';
import { seasonRules, sortedSeasons } from './tagSeasons';

const maximumAntlerRule = (text:string) => /\bspike(?:\s+(?:bulls?|elk))?\s+(?:only|or antlerless)\b|\b(?:no more than|not more than|at most|maximum of)\s*\d+\s*[- ]?(?:pt|point)|\b\d+\s*[- ]?(?:pt|point)s?\s*(?:(?:bucks?|deer|bulls?|elk)\s*)?(?:only|max(?:imum)?|or (?:less|fewer))\b/i.test(text);

/** Score a single unit within a hunt; a multi-unit hunt does not confer one unit's tier on another. */
export function trophyForUnit(hunt: {
  state:string; species:string; type:string; antlerClass:string; weapon:string;
  deerType?:string|null; tagCode?:string|null; tagSeasons?:unknown; name?:string|null; takeMethod?:string|null; pointOdds?:unknown; season?:string|null;
}, unit:string) {
  if ((hunt.pointOdds as {multiSeason?:boolean}|null)?.multiSeason)
    return {score:null,tier:null,reason:'Statewide multi-season tag has no unit-specific classification'};
  const rules = seasonRules(hunt.tagSeasons, hunt.species);
  const seasons=sortedSeasons(hunt.tagSeasons).filter(s=>!/^(?:[AB] tag · )?(?:antlerless|cow|doe)/i.test(s.sex));
  const antlerMaximum = rules.includes('2-point bucks only') || rules.includes('Spike bulls only') ||
    (seasons.length ? seasons.every(s=>maximumAntlerRule(`${s.sex} ${s.notes}`)) : maximumAntlerRule(hunt.takeMethod ?? ''));
  const speciesText=`${hunt.deerType ?? ''} ${hunt.name ?? ''} ${hunt.takeMethod ?? ''}`;
  const whitetailOnly = hunt.species==='DEER' && (rules.includes('Whitetail only') || (/white.?tail/i.test(speciesText) && !/mule/i.test(speciesText)));
  const coLate = hunt.state === 'CO' && /^[DE][MFEP]\d{3}[A-Z][34]R$/i.test(hunt.tagCode ?? '');
  return classifyTrophy({ ...hunt, units:[unit], season:coLate ? 'late rifle' : hunt.season ?? null, antlerMaximum, deerType:whitetailOnly ? 'WHITETAIL' : hunt.deerType });
}

/** A multi-unit hunt's displayed tier is its best eligible unit, not a claim about every unit. */
export function trophyForHunt(hunt: Parameters<typeof trophyForUnit>[0] & { units:string[]; pointOdds?:unknown }):TrophyScore|null {
  // A statewide multi-season tag is not evidence about any one unit.
  if ((hunt.pointOdds as {multiSeason?:boolean}|null)?.multiSeason) return null;
  const scores = (hunt.units ?? []).map(u=>trophyForUnit(hunt,u).score).filter((x):x is 50|65|80|100=>x!==null);
  return scores.length ? Math.max(...scores) as TrophyScore : null;
}
