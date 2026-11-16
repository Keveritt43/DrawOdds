/** Offline v2 scoring experiment. Not wired to displayed scores or production writes. */
export type TrophyV2Tier='Elite'|'Excellent'|'Good'|'Standard';
export type TrophyV2Confidence='Verified'|'Moderate'|'Provisional';
export interface TrophyV2Input {
  /** Counts must refer to distinct named sources; independence is established separately. */
  namedSources:number;
  independentNamedSources:number;
  verifiedAgencyAntlerOrAge:boolean;
  /** Distinguishes confirmed absence of a county tier from missing source data. */
  countyEvidenceKnown:boolean;
  countyTier:1|2|3|4|null;
  /** Independently established; a management-unit overlap alone is not confirmation. */
  boundaryVerified:boolean;
  /** Fraction in [0,1]; null means an applicable county adjustment is not established. */
  privateLandPenalty:number|null;
  /** Percentile in [0,1] for the same residency, species, year and compatible weapon cohort. */
  rawDemandPercentile:number|null;
  peerCount:number;
  /** For cohorts under ten, both baseline and offset need independent calibration. */
  allWeaponPercentile:number|null;
  weaponOffset:number|null;
  /** Supplied timing rubric applied to an actual, certain and weapon-specific segment. */
  timingPoints:number|null;
  /** Verified mature-animal proxy only; null explicitly uses the guide's neutral five points. */
  harvestPoints:number|null;
}
const unit=(x:number|null):x is number=>x!==null&&Number.isFinite(x)&&x>=0&&x<=1;
const bounded=(x:number|null,max:number):x is number=>x!==null&&Number.isFinite(x)&&x>=0&&x<=max;

/** Return null for inputs the proposed formula does not yet define; never invent an offset or date. */
export function trophyV2Shadow(x:TrophyV2Input):{score:number;tier:TrophyV2Tier;confidence:TrophyV2Confidence;parts:{corroboration:number;demand:number;timing:number;harvest:number};harvestNeutral:boolean}|null {
  if(!Number.isInteger(x.namedSources)||x.namedSources<0||!Number.isInteger(x.independentNamedSources)||x.independentNamedSources<0||x.independentNamedSources>x.namedSources||!Number.isInteger(x.peerCount)||x.peerCount<0||!bounded(x.timingPoints,15))return null;
  if(!x.countyEvidenceKnown&&!x.verifiedAgencyAntlerOrAge)return null;
  if(x.countyTier!==null&&(![1,2,3,4].includes(x.countyTier)||!unit(x.privateLandPenalty)))return null;
  if(x.harvestPoints!==null&&!bounded(x.harvestPoints,10))return null;
  let pct:number;
  if(x.peerCount>=10){
    if(!unit(x.rawDemandPercentile))return null;
    const w=x.peerCount/(x.peerCount+8);
    pct=w*x.rawDemandPercentile+(1-w)*0.5;
  }else{
    if(!unit(x.allWeaponPercentile)||x.weaponOffset===null||!Number.isFinite(x.weaponOffset)||Math.abs(x.weaponOffset)>1)return null;
    pct=Math.max(0,Math.min(1,x.allWeaponPercentile+x.weaponOffset));
  }
  const publications=x.namedSources===0?0:Math.min(32,18+(x.namedSources>=2?8:0)+(x.namedSources>=3?4:0)+(x.namedSources>=4?2:0));
  const county=x.countyTier===null?0:({1:15,2:11,3:7,4:3}[x.countyTier]*(1-x.privateLandPenalty!));
  const corroboration=x.verifiedAgencyAntlerOrAge?40:Math.min(40,publications+county);
  const demand=35*pct, timing=x.timingPoints, harvest=x.harvestPoints??5;
  let score=Math.min(100,corroboration+demand+timing+harvest);
  if(x.namedSources===0&&!x.verifiedAgencyAntlerOrAge)score=Math.min(score,84);
  score=Math.round(score*10)/10;
  const tier:TrophyV2Tier=score>=85?'Elite':score>=70?'Excellent':score>=55?'Good':'Standard';
  const confidence:TrophyV2Confidence=x.independentNamedSources>=2||x.verifiedAgencyAntlerOrAge?'Verified':x.namedSources>=1||((x.countyTier===1||x.countyTier===2)&&x.boundaryVerified)?'Moderate':'Provisional';
  return {score,tier,confidence,parts:{corroboration,demand,timing,harvest},harvestNeutral:x.harvestPoints===null};
}
