import { type TrophyScore, type TrophyTier } from './trophyTiers';
import { seasonRules, sortedSeasons } from './tagSeasons';
import drawBenchmarks from '../../data/trophy-draw-benchmarks.json';
import { resolveSeasonCandidate } from './trophyCandidateSeason';
import { resolveTrophyCandidate } from './trophyCandidateResolver';
import { unlistedExceptionalHunt } from './trophyHuntDemandCandidate';
import { reviewTrophyPeerBenchmark } from './trophyPeerBenchmarkReview';
import idV2 from '../../data/id/trophy-v2-tiers.json';
import { withIdahoVerifiedArea } from './idahoHuntCorrections';
import {isWaMixedBuckPermit} from './waMixedDeer';

const ID_V2_TIER:Record<number,TrophyTier>={100:'unicorn',80:'trophy',65:'county',50:'unclassified'};
/** Idaho v2 tier (owner, Nov 17): harvest context, modest timing, publications and B&C,
 * ranked within species. Only for controlled hunts in the reviewed table whose draw year matches it;
 * anything else keeps the earlier model. Built by scripts/build-idaho-noquota-tiers.ts. */
export function idahoV2Tier(hunt:{state:string;species:string;type?:string|null;antlerClass?:string|null;takeMethod?:string|null;tagSeasons?:unknown;huntNumber?:number|null;tagCode?:string|null;oddsLastYear?:number|null;units?:string[];openDate?:Date|string|null;closeDate?:Date|string|null}) {
  if(hunt.state.toUpperCase()!=='ID'||hunt.oddsLastYear!==idV2.drawYear||hunt.type?.toUpperCase()!=='CONTROLLED'||
      !['ANTLERED','EITHER'].includes(hunt.antlerClass?.toUpperCase()??''))return null;
  const rules=seasonRules(hunt.tagSeasons,hunt.species);
  const seasons=sortedSeasons(hunt.tagSeasons).filter(s=>!/^(?:[AB] tag · )?(?:antlerless|cow|doe)/i.test(s.sex));
  if(rules.includes('2-point bucks only')||rules.includes('Spike bulls only')||
      (seasons.length?seasons.every(s=>maximumAntlerRule(`${s.sex} ${s.notes}`)):maximumAntlerRule(hunt.takeMethod??'')))return null;
  const code=hunt.tagCode??(hunt.huntNumber===null||hunt.huntNumber===undefined?null:String(hunt.huntNumber));
  const row=code?(idV2.tiers as Record<string,{tier:number;score:number;rank:number;of:number;units:string[];animalSourceHunt?:string|null;animalSharePct?:number|null}>)[`${hunt.species.toUpperCase()}:${code}`]:undefined;
  if(!row)return null;
  // A renumbered or re-bounded hunt must not inherit another hunt's tier. A hunt whose units were
  // narrowed by a verified area correction (1044 drops Unit 57) still matches within the table's units.
  const units=(withIdahoVerifiedArea(hunt).units??[]).map(u=>u.trim());
  if(!units.length||units.some(u=>!row.units.includes(u)))return null;
  const animalContext=row.animalSourceHunt && row.animalSharePct!==null && row.animalSharePct!==undefined
    ? `The sample-adjusted antler share is ${row.animalSharePct}% from hunt ${row.animalSourceHunt}; it reflects harvested animals and can differ from this hunt's own harvest.`
    : 'Comparable antler-share evidence was unavailable and received a neutral input.';
  return {score:row.tier as TrophyScore,tier:ID_V2_TIER[row.tier],
    reason:`Ranks ${row.rank} of ${row.of} Idaho controlled ${hunt.species.toLowerCase()} hunts on reported antler context, named sources, county records and modest season timing; no tag quota or draw odds; provisional. ${animalContext} Harvest context does not measure genetics.`};
}

/** Hunt-specific trophy exceptions below are pinned to the draw year they were reviewed
 * against (oddsLastYear === <year>, plus exact season dates). When a new year's data
 * arrives they stop matching without any error, and those hunts quietly lose their tier.
 * `tests/trophy-exception-expiry.test.ts` fails when bundled data moves past these years
 * or after `reviewBy`, so each exception gets re-reviewed rather than silently dropped. */
export const TROPHY_EXCEPTION_REVIEW = {
  drawYears: { ID: 2026, CO: 2026, UT: 2026, WA: 2025, WY: 2026 },
  /** Colorado and Idaho hunts live in the database, not bundled files; use a date instead. */
  reviewBy: '2027-06-30',
  exceptions: [
    'ID deer 1044 (Area 55 early, excludes Unit 57)',
    'UT premium limited-entry buck deer DB1000–DB1008',
    'CO elk EM076E1R (Unit 76 early rifle)',
    'CO elk EE002E1R, EE010E1R, EE201E1R (early rifle)',
    'CO deer DM074E1R (Unit 74 above 11,000 ft)',
    'CO deer DM055O1A, DM055O1M (Unit 55 early)',
    'WA elk 2016 Colockum and the 2025 Quality Elk application threshold',
    'ID v2 tier table data/id/trophy-v2-tiers.json (drawYear 2026): regenerate with scripts/build-idaho-noquota-tiers.ts',
  ],
} as const;

const maximumAntlerRule = (text:string) => /\b(?:\w+\s+)?\(\d+\)\s*points?\s+or\s+(?:less|fewer)\b/i.test(text) || /\bspike(?:\s+(?:bulls?|elk))?\s+(?:only|or antlerless)\b|\b(?:no more than|not more than|at most|maximum of)\s*\d+\s*[- ]?(?:pt|point)|\b\d+\s*[- ]?(?:pt|point)s?\s*(?:(?:bucks?|deer|bulls?|elk)\s*)?(?:only|max(?:imum)?|or (?:less|fewer))\b/i.test(text);

/** WA's agency legal-animal description can identify the deer type; a generic or
 * mixed description does not. Names or the GMU alone are not proof of a restriction. */
export function waLegalDeerType(takeMethod:string|null|undefined):'MULE'|'WHITETAIL'|'BLACKTAIL'|null {
  const text=takeMethod??'';
  if(isWaMixedBuckPermit(text))return null;
  const types:('MULE'|'WHITETAIL'|'BLACKTAIL')[]=[];
  if(/\bmule deer\b/i.test(text))types.push('MULE');
  if(/\bwhite[ -]*tail(?:ed)?\b/i.test(text))types.push('WHITETAIL');
  if(/\bblack[ -]*tail(?:ed)?\b/i.test(text))types.push('BLACKTAIL');
  return types.length===1?types[0]:null;
}

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

function overlapsEarlyNovember(open:Date|string|null|undefined,close:Date|string|null|undefined):boolean {
  if(!open||!close)return false;
  const a=new Date(open),b=new Date(close);
  if(!Number.isFinite(+a)||!Number.isFinite(+b)||+b<+a)return false;
  for(let year=a.getUTCFullYear();year<=b.getUTCFullYear();year++)
    if(+a<=Date.UTC(year,10,14,23,59,59,999) && +b>=Date.UTC(year,10,1))return true;
  return false;
}

/** Score a single unit within a hunt; a multi-unit hunt does not confer one unit's tier on another. */
export function trophyForUnit(hunt: {
  state:string; species:string; type:string; antlerClass:string; weapon:string;
  units?:string[];
  openDate?:Date|string|null; closeDate?:Date|string|null; bigPct5?:number|null; resOdds5?:number|null; nrOdds5?:number|null; resOddsLast?:number|null; nrOddsLast?:number|null; oddsLastYear?:number|null; appsLast?:number|null; hunters5?:number|null; harvest5?:number|null; harvestYears?:number|null; youthOnly?:boolean; privateOnly?:boolean;
  huntNumber?:number|null; resAppsLast?:number|null; nrAppsLast?:number|null;
  deerType?:string|null; tagCode?:string|null; tagSeasons?:unknown; name?:string|null; takeMethod?:string|null; pointOdds?:unknown; season?:string|null;
}, unit:string) {
  const v2=idahoV2Tier(hunt);
  // The v2 tier belongs to the hunt; a unit outside the hunt's (verified) units gets nothing.
  if(v2)return (withIdahoVerifiedArea(hunt).units??[]).includes(unit.trim())?v2:{score:null,tier:null,reason:'This unit is not part of the hunt'};
  if ((hunt.pointOdds as {multiSeason?:boolean}|null)?.multiSeason)
    return {score:null,tier:null,reason:'Statewide multi-season tag has no unit-specific classification'};
  const rules = seasonRules(hunt.tagSeasons, hunt.species);
  const seasons=sortedSeasons(hunt.tagSeasons).filter(s=>!/^(?:[AB] tag · )?(?:antlerless|cow|doe)/i.test(s.sex));
  if(hunt.state.toUpperCase()==='UT' && seasons.some(s=>s.uncertain))
    return {score:null,tier:null,reason:'Hunt dates vary within the published window; trophy season is unverified'};
  const antlerMaximum = rules.includes('2-point bucks only') || rules.includes('Spike bulls only') ||
    (seasons.length ? seasons.every(s=>maximumAntlerRule(`${s.sex} ${s.notes}`)) : maximumAntlerRule(hunt.takeMethod ?? ''));
  const speciesText=`${hunt.deerType ?? ''} ${hunt.name ?? ''} ${hunt.takeMethod ?? ''}`;
  const whitetailOnly = hunt.species==='DEER' && !isWaMixedBuckPermit(hunt.takeMethod) && (rules.includes('Whitetail only') || (/white.?tail/i.test(speciesText) && !/mule/i.test(speciesText)));
  if (antlerMaximum || !['DEER','ELK','PRONGHORN'].includes(hunt.species.toUpperCase()) || !['ANTLERED','EITHER'].includes(hunt.antlerClass.toUpperCase()))
    return {score:null,tier:null,reason:'Trophy classification not applicable'};
  const state=hunt.state.toUpperCase();
  if(state==='WA' && hunt.species.toUpperCase()==='DEER' && isWaMixedBuckPermit(hunt.takeMethod))
    return {score:null,tier:null,reason:'This permit allows any buck or an antlerless whitetail; available unit trophy evidence does not identify the buck species'};
  // Utah DWR's 2026 premium limited-entry buck deer table includes these
  // distinct permits, including multiseason PLE. Match the actual hunt and
  // boundary, not every hunt in a premium unit (e.g. management buck tags).
  const premiumUtUnits:Record<string,string>={DB1000:'94',DB1001:'163',DB1002:'1',DB1003:'94',DB1004:'163',DB1005:'94',DB1006:'163',DB1007:'94',DB1008:'163'};
  const premiumCode=(hunt.tagCode??'').toUpperCase();
  const premiumUt=state==='UT' && hunt.species.toUpperCase()==='DEER' && hunt.type.toUpperCase()==='CONTROLLED' &&
    premiumUtUnits[premiumCode]===unit.trim() && /\b(?:premium|ple)\b/i.test(`${hunt.name??''} ${hunt.takeMethod??''}`);
  if(premiumUt)
    return {score:100 as const,tier:'unicorn' as const,reason:'Utah DWR premium limited-entry buck deer permit; trophy potential is not guaranteed'};
  const apps=state==='CO'||state==='WA' ? hunt.appsLast : typeof hunt.resAppsLast==='number' && typeof hunt.nrAppsLast==='number' ? hunt.resAppsLast+hunt.nrAppsLast : null;
  const code=hunt.tagCode??(hunt.huntNumber===null||hunt.huntNumber===undefined?null:String(hunt.huntNumber));
  // Idaho's 2026 official Area 55 early hunt excludes Unit 57, despite a stale summary association.
  if(state==='ID' && hunt.species.toUpperCase()==='DEER' && code==='1044' && hunt.oddsLastYear===2026 && unit.trim()==='57' &&
      overlapsMonth(hunt.openDate,hunt.closeDate,8) && overlapsMonth(hunt.openDate,hunt.closeDate,9))
    return {score:null,tier:null,reason:'Unit 57 is not part of the verified 2026 Area 55 hunt'};
  const peerStates=['WA','WY','UT','MT','ID'];
  const peerDemand=peerStates.includes(state) && code && typeof hunt.oddsLastYear==='number' && typeof apps==='number' && hunt.units?.length===1
    ? reviewTrophyPeerBenchmark({state,species:hunt.species,year:hunt.oddsLastYear,code,pool:'Combined',measure:'Applications',value:apps}) : null;
  const huntEvidence=peerStates.includes(state) && code ? {huntDemandHigh:peerDemand ? peerDemand.percentile>=75 : null,huntDemandExceptional:peerDemand?.exceptional??null,huntDemandProvisional:peerDemand?.provisional??true} : {};
  // The curated WA blacktail reference describes special permits, so do not
  // apply it to general seasons merely because the unit and animal match.
  const waType=state==='WA'&&hunt.type.toUpperCase()==='CONTROLLED'&&hunt.species.toUpperCase()==='DEER'?waLegalDeerType(hunt.takeMethod):null;
  // Contradictory explicit type fields remain unresolved instead of selecting one.
  const statedType=hunt.deerType?.toUpperCase();
  const deerType=waType&&statedType&&['MULE','WHITETAIL','BLACKTAIL'].includes(statedType)&&statedType!==waType
    ? null : waType??(whitetailOnly?'WHITETAIL':hunt.deerType);
  const candidate=resolveSeasonCandidate({state,species:hunt.species,unit,huntCode:code,drawYear:hunt.oddsLastYear,applications:apps,deerType,...huntEvidence});
  const rawCandidate=resolveTrophyCandidate({state,species:hunt.species,unit,huntCode:code,drawYear:hunt.oddsLastYear,applications:apps,deerType,...huntEvidence});
  if (code && rawCandidate.sourceIds.length===0 && !/No verified|multiple subspecies|conditional or inactive/.test(rawCandidate.reason) &&
      unlistedExceptionalHunt({state,species:hunt.species.toUpperCase(),code,year:hunt.oddsLastYear??null,applications:apps??null,units:[unit],sourceCoverage:'absent'}))
    return {score:65 as const,tier:'county' as const,reason:'Exceptional comparable hunt demand; no source-list entry; provisional'};
  const tiers:Record<TrophyScore,TrophyTier>={50:'unclassified',65:'county',80:'trophy',100:'unicorn'};
  const result:{score:TrophyScore|null;tier:TrophyTier|null;reason:string}={score:candidate.score,tier:tiers[candidate.score],reason:`${candidate.reason}${candidate.provisional?'; provisional':''}`};
  // A county-only lead cannot be upgraded by a generic geographic or season override.
  const bcLow=rawCandidate.reason.startsWith('B&C-only association; demand');
  const spans=seasons.length ? seasons.flatMap(s=>s.dates ?? []) : [{open:hunt.openDate,close:hunt.closeDate}];
  const inMonth=(month:number)=>spans.some(s=>overlapsMonth(s.open,s.close,month));
  const hasDates=spans.some(s=>!!s.open && !!s.close && Number.isFinite(+new Date(s.open)) && Number.isFinite(+new Date(s.close)) && +new Date(s.open)<=+new Date(s.close));
  const earlyId55=state==='ID' && hunt.species.toUpperCase()==='DEER' && unit.trim().toUpperCase().replace(/^UNIT\s*/, '')==='55' &&
    hunt.type.toUpperCase()==='CONTROLLED' && code==='1044' && hunt.oddsLastYear===2026 && (inMonth(8)||inMonth(9));
  const seasonal=(r:typeof result):typeof result=>{
    if(r.score===null || !hasDates || earlyId55 || state==='CO' || state==='AZ' || state==='ID' || !['DEER','ELK'].includes(hunt.species.toUpperCase())) return r;
    const prime=hunt.species.toUpperCase()==='DEER' ? spans.some(s=>overlapsEarlyNovember(s.open,s.close)) : spans.some(s=>overlapsRut(s.open,s.close));
    if(prime || r.score===50) return r;
    const score=r.score===100?80:r.score===80?65:50;
    return {score,tier:score===80?'trophy':score===65?'county':'unclassified',reason:`${r.reason}; outside the preferred season`};
  };
  const po=hunt.pointOdds as {kind?:string;category?:string;license?:string}|null;
  // Reviewed hunt-specific evidence, not a general early-season upgrade. Eastmans
  // forecast this exact hunt Excellent in 2021; CPW documents historical E-34
  // mature-bull context. Neither source measures current hunt-level antler size.
  const calendarDay=(v:Date|string|null|undefined) => v instanceof Date
    ? Number.isFinite(+v) ? v.toISOString().slice(0,10) : ''
    : typeof v==='string' ? v.slice(0,10) : '';
  const reviewedEarly76 = state==='CO' && hunt.species.toUpperCase()==='ELK' &&
    hunt.type.toUpperCase()==='CONTROLLED' && hunt.antlerClass.toUpperCase()==='ANTLERED' &&
    hunt.privateOnly===false && hunt.youthOnly===false && code?.toUpperCase()==='EM076E1R' &&
    hunt.oddsLastYear===2026 && unit.trim()==='76' && hunt.units?.length===1 && hunt.units[0].trim()==='76' &&
    spans.length===1 && ['2026','2027'].some(year=>calendarDay(spans[0].open)===`${year}-10-01` && calendarDay(spans[0].close)===`${year}-10-07`);
  if (reviewedEarly76)
    return {score:80 as const,tier:'trophy' as const,reason:'Reviewed Unit 76 early rifle forecast and herd context; historical sources do not measure current antler size; provisional'};
  // The 2024 Eastmans table rates these exact early hunts Excellent. An earlier
  // forecast for Unit 1 changed to Good in 2024, so it is intentionally absent.
  const earlyElkUnits:Record<string,string>={EE002E1R:'2',EE010E1R:'10',EE201E1R:'201'};
  const reviewedUnit=earlyElkUnits[code?.toUpperCase()??''];
  const reviewedEarlyElk=state==='CO' && hunt.species.toUpperCase()==='ELK' && hunt.type.toUpperCase()==='CONTROLLED' &&
    hunt.antlerClass.toUpperCase()==='EITHER' && hunt.privateOnly===false && hunt.youthOnly===false &&
    hunt.oddsLastYear===2026 && reviewedUnit===unit.trim() && hunt.units?.length===1 && hunt.units[0].trim()===reviewedUnit &&
    spans.length===1 && ['2026','2027'].some(year=>calendarDay(spans[0].open)===`${year}-10-01` && calendarDay(spans[0].close)===`${year}-10-11`);
  if(reviewedEarlyElk)
    return {score:80 as const,tier:'trophy' as const,reason:'Reviewed 2024 early rifle hunt forecast; historical forecast does not measure current antler size; provisional'};
  const regs=(hunt.pointOdds as {regs?:{year?:number;partial?:boolean;unitText?:string}}|null)?.regs;
  const reviewedHigh74=state==='CO' && hunt.species.toUpperCase()==='DEER' && hunt.type.toUpperCase()==='CONTROLLED' &&
    hunt.antlerClass.toUpperCase()==='ANTLERED' && hunt.privateOnly===false && hunt.youthOnly===false &&
    code?.toUpperCase()==='DM074E1R' && hunt.oddsLastYear===2026 && unit.trim()==='74' && hunt.units?.length===1 && hunt.units[0].trim()==='74' &&
    regs?.year===2026 && regs.partial===true && /\b74\b.*\babove\s+11,?000\s+feet\b/i.test(regs.unitText??'') &&
    spans.length===1 && calendarDay(spans[0].open)==='2026-09-05' && calendarDay(spans[0].close)==='2026-09-13';
  if(reviewedHigh74)
    return {score:80 as const,tier:'trophy' as const,reason:'Reviewed 2024 early high-country forecast for Unit 74 above 11,000 feet; historical forecast does not measure current antler size; provisional'};
  const early55Dates:Record<string,string[][]>={DM055O1A:[['2026-09-02','2026-09-30'],['2027-09-02','2027-09-30']],DM055O1M:[['2026-09-12','2026-09-20'],['2027-09-11','2027-09-19']]};
  const reviewedEarly55=state==='CO' && hunt.species.toUpperCase()==='DEER' && hunt.type.toUpperCase()==='CONTROLLED' &&
    hunt.antlerClass.toUpperCase()==='ANTLERED' && hunt.privateOnly===false && hunt.youthOnly===false &&
    hunt.oddsLastYear===2026 && unit.trim()==='55' && hunt.units?.length===1 && hunt.units[0].trim()==='55' &&
    regs?.year===2026 && regs.partial===false && /^\s*55\s*$/.test(regs.unitText??'') && spans.length===1 &&
    (early55Dates[code?.toUpperCase()??'']??[]).some(([open,close])=>calendarDay(spans[0].open)===open && calendarDay(spans[0].close)===close);
  if(reviewedEarly55)
    return {score:80 as const,tier:'trophy' as const,reason:'Reviewed 2024 Unit 55 hunt-specific forecast; historical forecast does not measure current antler size; provisional'};
  // These two previously reviewed Washington hunt comparisons remain hunt-specific.
  // A unit-wide source designation must not erase their documented demand distinction.
  if (!bcLow && state==='WA' && hunt.species.toUpperCase()==='DEER' && String(hunt.tagCode)==='1033' && result.score!==null && result.score>80)
    Object.assign(result,{score:80,tier:'trophy',reason:'Reviewed Entiat demand comparison; provisional'});
  if (!bcLow && state==='WA' && hunt.species.toUpperCase()==='DEER' && String(hunt.tagCode)==='1034' && result.score!==null && result.score>65)
    Object.assign(result,{score:65,tier:'county',reason:'Reviewed Swakane demand comparison'});
  if (!bcLow && state==='WA' && hunt.species.toUpperCase()==='ELK' && String(hunt.tagCode)==='2016' && result.score!==null && result.score>65 &&
      !(hunt.oddsLastYear===2025 && po?.kind==='squared' && po.category==='Quality Elk' && typeof hunt.appsLast==='number' && hunt.appsLast>=1242 && spans.some(s=>overlapsRut(s.open,s.close))))
    Object.assign(result,{score:65,tier:'county',reason:'Reviewed Colockum exceptional-demand conditions not met'});
  // 2025 Quality Elk application counts, 95th percentile (93 eligible hunts, nearest rank).
  // Demand is descriptive; a small permit quota or low odds cannot establish demand.
  if(!bcLow && result.score!==null && result.score<80 && state==='WA' && hunt.species.toUpperCase()==='ELK' && hunt.type.toUpperCase()==='CONTROLLED' && !hunt.youthOnly && !hunt.privateOnly && hunt.oddsLastYear===2025 && po?.kind==='squared' && po.category==='Quality Elk' && typeof hunt.appsLast==='number' && hunt.appsLast>=1242 && spans.some(s=>overlapsRut(s.open,s.close)))
    return seasonal({score:80,tier:'trophy',reason:'High same-category applications for an early-season quality elk permit; demand does not establish trophy size'});
  if(!bcLow && result.score!==null && hunt.state.toUpperCase()==='WA' && hunt.species.toUpperCase()==='ELK' && ['157','162','169','172','EA1008','EA1009'].includes(unit.trim().toUpperCase())) {
    if(spans.some(s=>overlapsRut(s.open,s.close)) && result.score<65)
      return seasonal({score:65,tier:'county',reason:'Blue Mountains elk hunt open during September or early October'});
  }
  // Draw cutoffs depend on permits and pool allocation. They describe odds, not
  // the animals on the unit, so Colorado and Wyoming no longer gain trophy tiers from them.
  if (result.score===null || hunt.state.toUpperCase()!=='ID' || hunt.species.toUpperCase()!=='DEER') return seasonal(result);
  // The early controlled Unit 55 hunt is the owner's explicit premium exception.
  if (earlyId55)
    return {score:80 as const,tier:'trophy' as const,reason:'Reviewed 2026 Idaho Unit 55 early controlled hunt 1044; provisional'};
  return seasonal(result);
}

/** A multi-unit hunt uses a conservative floor until a defensible hunt-wide rollup exists. */
export function trophyForHunt(hunt: Parameters<typeof trophyForUnit>[0] & { units:string[]; pointOdds?:unknown }):TrophyScore|null {
  // A statewide multi-season tag is not evidence about any one unit.
  if ((hunt.pointOdds as {multiSeason?:boolean}|null)?.multiSeason) return null;
  const v2=idahoV2Tier(hunt);
  if(v2)return v2.score;
  const scores = (hunt.units ?? []).map(u=>trophyForUnit(hunt,u).score).filter((x):x is 50|65|80|100=>x!==null);
  if (!scores.length) return null;
  const state=hunt.state.toUpperCase(),species=hunt.species.toUpperCase();
  const applications=state==='CO'||state==='WA'?hunt.appsLast:typeof hunt.resAppsLast==='number'&&typeof hunt.nrAppsLast==='number'?hunt.resAppsLast+hunt.nrAppsLast:null;
  const code=hunt.tagCode??(hunt.huntNumber===null||hunt.huntNumber===undefined?null:String(hunt.huntNumber));
  const coverage=hunt.units.map(unit=>resolveTrophyCandidate({state,species,unit,drawYear:hunt.oddsLastYear,huntCode:code,applications,deerType:hunt.deerType}));
  const absent=coverage.every(x=>x.sourceIds.length===0 && !/No verified|multiple subspecies|conditional or inactive/.test(x.reason));
  if(scores.length && code && absent && unlistedExceptionalHunt({state,species,code,year:hunt.oddsLastYear??null,applications:applications??null,units:hunt.units,sourceCoverage:'absent'}))
    return Math.max(65,...scores) as TrophyScore;
  return scores.length ? Math.min(...scores) as TrophyScore : null;
}

/** Explain whether the displayed hunt tier relies on missing or unverified inputs. */
export function trophyHuntEvidence(hunt: Parameters<typeof trophyForHunt>[0], score:TrophyScore) {
  const unitScores=(hunt.units??[]).map(unit=>trophyForUnit(hunt,unit).score).filter((value):value is TrophyScore=>value!==null);
  if(new Set(unitScores).size>1)
    return {provisional:true,reason:'The hunt covers units with different evidence; its conservative tier is provisional and applications apply to the entire hunt.'};
  const matches=(hunt.units??[]).map(unit=>trophyForUnit(hunt,unit)).filter(r=>r.score===score);
  if (!matches.length) return score===65 && trophyForHunt(hunt)===65
    ? {provisional:true,reason:'Exceptional comparable demand belongs to the hunt, not every unit; small comparison groups can be unstable.'}
    : {provisional:true,reason:'Stored tier does not match current unit evidence; score review is needed.'};
  const known=matches.find(r=>!r.reason.includes('provisional'));
  return {provisional:!known,reason:(known??matches[0]).reason};
}
