import {mtHarvestProxy} from './mtHarvestProxy';

type Row = {state:string; species:string; pointOdds:unknown; tagSeasons:unknown; scoreQuality:number|null};
/** Explain known reasons for withholding a score without claiming broader source verification. */
export function scoreEvidence(r:Row):{label:string; explanation:string}|null {
  if(r.scoreQuality!==null)return null;
  if(r.state==='UT' && (r.tagSeasons as {seasons?:{uncertain?:boolean}[]}|null)?.seasons?.some(s=>s.uncertain))
    return {label:'Dates vary', explanation:'Exact hunt dates vary within the published window, so season-dependent scoring is unavailable.'};
  if(r.state==='WY') {
    if(r.species==='DEER') return {label:'Deer harvest populations differ',explanation:'Separate mule deer and whitetail hunter counts can overlap; combined hunter success and Quality are unavailable.'};
    if(['ELK','PRONGHORN'].includes(r.species) && !(r.pointOdds as {verifiedRegionHarvest?:boolean}|null)?.verifiedRegionHarvest)
      return {label:'Active-license data',explanation:'WGFD reports harvest per active license; unique-hunter success and density are not established for this hunt.'};
  }
  if(r.state==='MT') {
    const kind=mtHarvestProxy(r.pointOdds);
    if(kind==='permit')return {label:'Permit context',explanation:'Estimated mule bucks per issued permit is not hunter success; Quality is unavailable.'};
    if(kind==='species')return {label:'District context',explanation:'The harvest and hunter counts describe different deer populations; Quality is unavailable.'};
    if(kind==='district')return {label:'District participation',explanation:'Hunters may appear in more than one district; the summed count is not unique hunters, so Quality is unavailable.'};
  }
  return null;
}
