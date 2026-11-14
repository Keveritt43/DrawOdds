import { classifyTrophy, type TrophyScore } from './trophyTiers';
import { seasonRules, sortedSeasons } from './tagSeasons';
import drawBenchmarks from '../../data/trophy-draw-benchmarks.json';

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

/** A qualifying date must be within a real season window; gaps are not open days. */
function overlapsRut(open:Date|string|null|undefined,close:Date|string|null|undefined):boolean {
  if(!open || !close) return false;
  const date=(v:Date|string)=>v instanceof Date ? v : /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0,10)}T00:00:00Z`) : new Date(v);
  const a=date(open),b=date(close);
  if(!Number.isFinite(+a)||!Number.isFinite(+b)||+b<+a) return false;
  for(let year=a.getUTCFullYear();year<=b.getUTCFullYear();year++)
    if(+a<=Date.UTC(year,9,7,23,59,59,999) && +b>=Date.UTC(year,8,1))return true;
  return false;
}

/** Score a single unit within a hunt; a multi-unit hunt does not confer one unit's tier on another. */
export function trophyForUnit(hunt: {
  state:string; species:string; type:string; antlerClass:string; weapon:string;
  openDate?:Date|string|null; closeDate?:Date|string|null; bigPct5?:number|null; resOdds5?:number|null; nrOdds5?:number|null; resOddsLast?:number|null; nrOddsLast?:number|null; oddsLastYear?:number|null; appsLast?:number|null; hunters5?:number|null; harvest5?:number|null; harvestYears?:number|null; youthOnly?:boolean; privateOnly?:boolean;
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
  const spans=seasons.length ? seasons.flatMap(s=>s.dates ?? []) : [{open:hunt.openDate,close:hunt.closeDate}];
  const inMonth=(month:number)=>spans.some(s=>overlapsMonth(s.open,s.close,month));
  const hasDates=spans.some(s=>!!s.open && !!s.close && Number.isFinite(+new Date(s.open)) && Number.isFinite(+new Date(s.close)) && +new Date(s.open)<=+new Date(s.close));
  const earlyId55=hunt.state.toUpperCase()==='ID' && hunt.species.toUpperCase()==='DEER' && unit.trim().toUpperCase().replace(/^UNIT\s*/, '')==='55' && hunt.type.toUpperCase()==='CONTROLLED' && (inMonth(8)||inMonth(9));
  const seasonal=(r:typeof result):typeof result=>{
    if(r.score===null || !hasDates || earlyId55) return r;
    const prime=hunt.species.toUpperCase()==='DEER' ? inMonth(11) : spans.some(s=>overlapsRut(s.open,s.close));
    if(prime || r.score===50) return r;
    const score=r.score===100?80:r.score===80?65:50;
    return {score,tier:score===80?'trophy':score===65?'county':'unclassified',reason:`${r.reason}; outside the preferred season`};
  };
  // The draw comparison is descriptive, using one observed year and a same-system peer group.
  // A Wilson bound is only an approximate screen for pooled harvest observations, not proof
  // of statistical significance when agency counts are estimated or hunters recur across years.
  const po=hunt.pointOdds as {kind?:string;category?:string;license?:string}|null;
  const state=hunt.state.toUpperCase(), kind=state==='ID'?'random':po?.kind;
  const category=state==='ID'?'random':state==='WA'?po?.category:state==='MT'?po?.license:kind;
  const benchmark=(drawBenchmarks.groups as Record<string,{n:number;p75:number}>)[`${state}|${hunt.species.toUpperCase()}|${hunt.oddsLastYear}|${kind}|${category}`];
  const n=hunt.hunters5,k=hunt.harvest5;
  if(!earlyId55 && !hunt.youthOnly && !hunt.privateOnly && result.score!==null && benchmark && benchmark.n>=20 && typeof hunt.nrOddsLast==='number' && Number.isFinite(hunt.nrOddsLast) && hunt.nrOddsLast>=benchmark.p75 && hunt.nrOddsLast<=1 && typeof n==='number' && Number.isFinite(n) && n>=50 && typeof k==='number' && Number.isFinite(k) && k>=0 && k<=n && typeof hunt.harvestYears==='number' && hunt.harvestYears>=3) {
    const p=k/n,z=1.96,z2=z*z,upper=(p+z2/(2*n)+z*Math.sqrt(p*(1-p)/n+z2/(4*n*n)))/(1+z2/n);
    if(upper<.5) return {score:50 as const,tier:'unclassified' as const,reason:'Low observed harvest with high overall draw rate compared with the same-year peer group'};
    if(p<.5 && result.score>65) return seasonal({score:65,tier:'county',reason:'Below-50% observed harvest with high overall draw rate; uncertainty remains'});
  }
  // 2025 Quality Elk application counts, 95th percentile (93 eligible hunts, nearest rank).
  // Demand is a descriptive signal and the pooled award rate is not personal odds.
  if(result.score!==null && result.score<80 && state==='WA' && hunt.species.toUpperCase()==='ELK' && hunt.type.toUpperCase()==='CONTROLLED' && !hunt.youthOnly && !hunt.privateOnly && hunt.oddsLastYear===2025 && po?.kind==='squared' && po.category==='Quality Elk' && typeof hunt.appsLast==='number' && hunt.appsLast>=1242 && typeof hunt.resOddsLast==='number' && hunt.resOddsLast>0 && hunt.resOddsLast<.02 && spans.some(s=>overlapsRut(s.open,s.close)))
    return seasonal({score:80,tier:'trophy',reason:'Exceptional same-category applications and low overall award rate for an early-season quality elk permit; demand does not establish trophy size'});
  if(result.score!==null && hunt.state.toUpperCase()==='WA' && hunt.species.toUpperCase()==='ELK' && ['157','162','169','172','EA1008','EA1009'].includes(unit.trim().toUpperCase())) {
    const n=hunt.hunters5, k=hunt.harvest5, p=typeof n==='number' && n>=20 && typeof k==='number' && k>=0 && k<=n ? k/n : null;
    // Approximate 95% Wilson lower bound; a screening aid, not proof of trophy size.
    const lower=p===null || typeof n!=='number' ? null : (p+1.96**2/(2*n)-1.96*Math.sqrt(p*(1-p)/n+1.96**2/(4*n*n)))/(1+1.96**2/n);
    if(hunt.type.toUpperCase()==='CONTROLLED' && lower!==null && lower>.5 && typeof hunt.resOddsLast==='number' && hunt.resOddsLast>0 && hunt.resOddsLast<.02)
      return seasonal({score:80,tier:'trophy',reason:'Blue Mountains permit with low overall draw rate and supported harvest success'});
    if(spans.some(s=>overlapsRut(s.open,s.close)) && result.score<65)
      return seasonal({score:65,tier:'county',reason:'Blue Mountains elk hunt open during September or early October'});
  }
  // Colorado's regular/OTC rifle codes O1–O4 and U1–U4 encode the numbered season.
  // Other codes (including early, late and private-land-only) are not inferred as numbered seasons.
  const coRifle=/^([DE])[MFEP](?:\d{3}|[SG]\d{2})[OU]([1-4])R$/i.exec(hunt.tagCode ?? '');
  if (result.score!==null && hunt.state.toUpperCase()==='CO' && coRifle && ((coRifle[1].toUpperCase()==='D' && hunt.species.toUpperCase()==='DEER') || (coRifle[1].toUpperCase()==='E' && hunt.species.toUpperCase()==='ELK'))) {
    const printedSeason=Number(coRifle[2]);
    const season=hunt.species.toUpperCase()==='ELK' ? 5-printedSeason : printedSeason;
    if(hunt.species.toUpperCase()==='DEER' && (printedSeason===3 || printedSeason===4)) {
      const cutoff=(hunt.pointOdds as {pools?:{nr?:{cut?:{points?:number|null;drawnAtLevel?:number|null}}}}|null)?.pools?.nr?.cut;
      if(typeof cutoff?.points==='number' && Number.isFinite(cutoff.points) && cutoff.points>=20 && typeof cutoff.drawnAtLevel==='number' && cutoff.drawnAtLevel>0)
        return seasonal({score:100,tier:'unicorn',reason:'Colorado deer rifle hunt with an observed nonresident cutoff of at least 20 preference points'});
      return seasonal({score:80,tier:'trophy',reason:'Colorado late rifle season; observed nonresident cutoff below 20 or unavailable'});
    }
    if(season===4) return seasonal({score:100,tier:'unicorn',reason:`Colorado rifle season ${printedSeason}`});
    if(season===3) return seasonal({score:80,tier:'trophy',reason:`Colorado rifle season ${printedSeason}`});
    if(season===2 || result.score>=65) return seasonal({score:65,tier:'county',reason:`Colorado rifle season ${printedSeason}`});
    return seasonal({score:50,tier:'unclassified',reason:`Colorado rifle season ${printedSeason} in an unclassified unit`});
  }
  if (result.score===null || hunt.state.toUpperCase()!=='ID' || hunt.species.toUpperCase()!=='DEER') return seasonal(result);
  // The early controlled Unit 55 hunt is the owner's explicit premium exception.
  if (earlyId55)
    return {score:80 as const,tier:'trophy' as const,reason:'Early controlled Unit 55 hunt'};
  // Require both public five-year draw populations; never infer missing odds.
  const lowOdds=(odds:number|null|undefined)=>typeof odds==='number' && Number.isFinite(odds) && odds>=0 && odds<0.05;
  if (hunt.type.toUpperCase()==='CONTROLLED' && inMonth(11) && typeof hunt.bigPct5==='number' && Number.isFinite(hunt.bigPct5) && hunt.bigPct5>0.7 && hunt.bigPct5<=1 && lowOdds(hunt.resOdds5) && lowOdds(hunt.nrOdds5))
    return {score:80 as const,tier:'trophy' as const,reason:'November hunt with over 70% estimated 4-point bucks and both five-year draw odds below 5%'};
  return seasonal(result);
}

/** A multi-unit hunt's displayed tier is its best eligible unit, not a claim about every unit. */
export function trophyForHunt(hunt: Parameters<typeof trophyForUnit>[0] & { units:string[]; pointOdds?:unknown }):TrophyScore|null {
  // A statewide multi-season tag is not evidence about any one unit.
  if ((hunt.pointOdds as {multiSeason?:boolean}|null)?.multiSeason) return null;
  const scores = (hunt.units ?? []).map(u=>trophyForUnit(hunt,u).score).filter((x):x is 50|65|80|100=>x!==null);
  return scores.length ? Math.max(...scores) as TrophyScore : null;
}
