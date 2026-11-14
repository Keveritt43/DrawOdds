/** Offline candidate hunt classification; not connected to production scoring. */
import {resolveSeasonCandidate} from './trophyCandidateSeason';
import {unlistedExceptionalHunt} from './trophyHuntDemandCandidate';
import {seasonRules, sortedSeasons} from './tagSeasons';
import type {CandidateScore} from './trophyCandidateTier';

export interface CandidateHuntInput {
  state:string; species:string; units:string[]; antlerClass:string;
  tagCode?:string|null; huntNumber?:number|null; oddsLastYear?:number|null;
  appsLast?:number|null; resAppsLast?:number|null; nrAppsLast?:number|null;
  deerType?:string|null; tagSeasons?:unknown; takeMethod?:string|null;
  pointOdds?:unknown; privateOnly?:boolean; youthOnly?:boolean;
}
export interface HuntCandidateResult {score:CandidateScore|null; provisional:boolean; reason:string}

export function candidateHunt(h:CandidateHuntInput):HuntCandidateResult {
  const species=h.species.toUpperCase(), state=h.state.toUpperCase();
  if (!['DEER','ELK','PRONGHORN'].includes(species) || !['ANTLERED','EITHER'].includes(h.antlerClass.toUpperCase()))
    return {score:null,provisional:false,reason:'Ineligible species or antlerless-only hunt'};
  if (!h.units.length || (h.pointOdds as {multiSeason?:boolean}|null)?.multiSeason)
    return {score:null,provisional:true,reason:'No specific unit evidence for this hunt'};
  const rules=seasonRules(h.tagSeasons,species);
  const seasons=sortedSeasons(h.tagSeasons).filter(s=>!/^(?:[AB] tag · )?(?:antlerless|cow|doe)/i.test(s.sex));
  const maximum=(text:string)=>/\bspike(?:\s+(?:bulls?|elk))?\s+(?:only|or antlerless)\b|\b(?:no more than|not more than|at most|maximum of)\s*\d+\s*[- ]?(?:pt|point)|\b\d+\s*[- ]?(?:pt|point)s?\s*(?:(?:bucks?|deer|bulls?|elk)\s*)?(?:only|max(?:imum)?|or (?:less|fewer))\b/i.test(text);
  if (rules.includes('2-point bucks only') || rules.includes('Spike bulls only') ||
      (seasons.length ? seasons.every(s=>maximum(`${s.sex} ${s.notes}`)) : maximum(h.takeMethod ?? '')))
    return {score:null,provisional:false,reason:'Antler-maximum-restricted hunt'};
  const applications = state==='CO'||state==='WA' ? h.appsLast :
    typeof h.resAppsLast==='number' && typeof h.nrAppsLast==='number' ? h.resAppsLast+h.nrAppsLast : null;
  const code=h.tagCode??(h.huntNumber===null||h.huntNumber===undefined?null:String(h.huntNumber));
  const items=h.units.map(unit=>resolveSeasonCandidate({state,species,unit,huntCode:code,drawYear:h.oddsLastYear,applications,deerType:h.deerType}));
  const best=items.reduce((a,b)=>b.score>a.score?b:a);
  const sourceCoverage=items.some(x=>x.sourceIds.length>0) ? 'present' :
    items.some(x=>/No verified|multiple subspecies|conditional or inactive/.test(x.reason)) ? 'unknown' : 'absent';
  if (code && unlistedExceptionalHunt({state,species,code,year:h.oddsLastYear??null,applications:applications??null,units:h.units,sourceCoverage}))
    return {score:65,provisional:false,reason:'Exceptional comparable hunt-level demand; individual units do not inherit this rating'};
  if (h.privateOnly || h.youthOnly)
    return {score:best.score>65?65:best.score,provisional:true,reason:'Restricted hunt: source applicability requires review'};
  return {score:best.score,provisional:best.provisional,reason:best.reason};
}
