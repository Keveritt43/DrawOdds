import { classifyTrophy, type TrophyScore } from './trophyTiers';
import { seasonRules, sortedSeasons } from './tagSeasons';

const maximumAntlerRule = (text:string) => /\bspike(?:\s+(?:bulls?|elk))?\s+(?:only|or antlerless)\b|\b(?:no more than|not more than|at most|maximum of)\s*\d+\s*[- ]?(?:pt|point)|\b\d+\s*[- ]?(?:pt|point)s?\s*(?:(?:bucks?|deer|bulls?|elk)\s*)?(?:only|max(?:imum)?|or (?:less|fewer))\b/i.test(text);

/** Compare real date spans, rather than treating a gap between separate seasons as open. */
function overlapsMonth(open:Date|string|null|undefined,close:Date|string|null|undefined,month:number):boolean {
  if (!open || !close) return false;
  const calendar=(v:Date|string)=>v instanceof Date ? v : /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0,10)}T00:00:00Z`) : new Date(v);
  const a=calendar(open),b=calendar(close);
  if (!Number.isFinite(+a) || !Number.isFinite(+b) || +b < +a) return false;
  for(let year=a.getUTCFullYear();year<=b.getUTCFullYear();year++) {
    const first=Date.UTC(year,month-1,1), last=Date.UTC(year,month,1)-1;
    if (+a<=last && +b>=first) return true;
  }
  return false;
}

/** Score a single unit within a hunt; a multi-unit hunt does not confer one unit's tier on another. */
export function trophyForUnit(hunt: {
  state:string; species:string; type:string; antlerClass:string; weapon:string;
  openDate?:Date|string|null; closeDate?:Date|string|null; bigPct5?:number|null; resOdds5?:number|null; nrOdds5?:number|null;
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
  const result=classifyTrophy({ ...hunt, units:[unit], season:coLate ? 'late rifle' : hunt.season ?? null, antlerMaximum, deerType:whitetailOnly ? 'WHITETAIL' : hunt.deerType });
  // Colorado's regular/OTC rifle codes O1–O4 and U1–U4 encode the numbered season.
  // Other codes (including early, late and private-land-only) are not inferred as numbered seasons.
  const coRifle=/^([DE])[MFEP](?:\d{3}|[SG]\d{2})[OU]([1-4])R$/i.exec(hunt.tagCode ?? '');
  if (result.score!==null && hunt.state.toUpperCase()==='CO' && coRifle && ((coRifle[1].toUpperCase()==='D' && hunt.species.toUpperCase()==='DEER') || (coRifle[1].toUpperCase()==='E' && hunt.species.toUpperCase()==='ELK'))) {
    const printedSeason=Number(coRifle[2]);
    const season=hunt.species.toUpperCase()==='ELK' ? 5-printedSeason : printedSeason;
    if(season===4) return {score:100 as const,tier:'unicorn' as const,reason:`Colorado rifle season ${printedSeason}`};
    if(season===3) return {score:80 as const,tier:'trophy' as const,reason:`Colorado rifle season ${printedSeason}`};
    if(season===2 || result.score>=65) return {score:65 as const,tier:'county' as const,reason:`Colorado rifle season ${printedSeason}`};
    return {score:50 as const,tier:'unclassified' as const,reason:`Colorado rifle season ${printedSeason} in an unclassified unit`};
  }
  if (result.score===null || hunt.state.toUpperCase()!=='ID' || hunt.species.toUpperCase()!=='DEER') return result;
  const spans=seasons.length ? seasons.flatMap(s=>s.dates ?? []) : [{open:hunt.openDate,close:hunt.closeDate}];
  const inMonth=(month:number)=>spans.some(s=>overlapsMonth(s.open,s.close,month));
  // The early controlled Unit 55 hunt is the owner's explicit premium exception.
  if (unit.trim().toUpperCase().replace(/^UNIT\s*/, '')==='55' && hunt.type.toUpperCase()==='CONTROLLED' && (inMonth(8)||inMonth(9)))
    return {score:80 as const,tier:'trophy' as const,reason:'Early controlled Unit 55 hunt'};
  // Require both public five-year draw populations; never infer missing odds.
  const lowOdds=(odds:number|null|undefined)=>typeof odds==='number' && Number.isFinite(odds) && odds>=0 && odds<0.05;
  if (hunt.type.toUpperCase()==='CONTROLLED' && inMonth(11) && typeof hunt.bigPct5==='number' && Number.isFinite(hunt.bigPct5) && hunt.bigPct5>0.7 && hunt.bigPct5<=1 && lowOdds(hunt.resOdds5) && lowOdds(hunt.nrOdds5))
    return {score:80 as const,tier:'trophy' as const,reason:'November hunt with over 70% estimated 4-point bucks and both five-year draw odds below 5%'};
  if (inMonth(10) && result.score>65)
    return {score:65 as const,tier:'county' as const,reason:'October Idaho deer hunt in a recognized unit'};
  return result;
}

/** A multi-unit hunt's displayed tier is its best eligible unit, not a claim about every unit. */
export function trophyForHunt(hunt: Parameters<typeof trophyForUnit>[0] & { units:string[]; pointOdds?:unknown }):TrophyScore|null {
  // A statewide multi-season tag is not evidence about any one unit.
  if ((hunt.pointOdds as {multiSeason?:boolean}|null)?.multiSeason) return null;
  const scores = (hunt.units ?? []).map(u=>trophyForUnit(hunt,u).score).filter((x):x is 50|65|80|100=>x!==null);
  return scores.length ? Math.max(...scores) as TrophyScore : null;
}
