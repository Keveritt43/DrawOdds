/** Curated trophy designations. Scores describe recognition, not absence of trophy animals.
 * Only exact unit matches are promoted; mapped unit associations are a geographic proxy.
 * Antlerless hunts are excluded entirely.
 */
import geographicUnits from '../../data/trophy-unit-areas.json';
export type TrophyTier = 'unicorn' | 'trophy' | 'county' | 'unclassified';
export type TrophyScore = 100 | 80 | 65 | 50;
export interface TrophyHunt {
  species: string;
  state: string;
  units: string[];
  type?: string;
  antlerClass: string;
  weapon?: string | null;
  season?: string | null;
  deerType?: string | null;
  twoPoint?: boolean;
  antlerMaximum?: boolean;
}
export interface TrophyResult { score: TrophyScore | null; tier: TrophyTier | null; reason: string }
type Rule = { species: 'ELK' | 'DEER'; state: string; units: string[]; tier: 'unicorn' | 'trophy'; condition?: 'late' | 'early' };
const rules: Rule[] = [
  {species:'ELK',state:'AZ',units:['9','10','23'],tier:'unicorn',condition:'early'},
  {species:'ELK',state:'NM',units:['16D','16A','15'],tier:'unicorn'},
  {species:'ELK',state:'NV',units:['111','112','113','114','115'],tier:'unicorn'},
  // Utah's boundary IDs are not the regulation unit numbers. Only mapped IDs are used here.
  {species:'ELK',state:'UT',units:['183','685'],tier:'unicorn'},
  {species:'DEER',state:'AZ',units:['13B','13A','12A'],tier:'unicorn'},
  {species:'DEER',state:'UT',units:['94','163'],tier:'unicorn'},
  {species:'DEER',state:'CO',units:['44','43','54','55','66'],tier:'unicorn',condition:'late'},
  {species:'DEER',state:'NV',units:['231','6','10'],tier:'unicorn',condition:'late'},
  {species:'ELK',state:'AZ',units:['9','10','23','1','3C','27','8'],tier:'trophy'},
  {species:'ELK',state:'MT',units:['313','314','704'],tier:'trophy'},
  {species:'DEER',state:'CO',units:['44','43','35','36','21','30'],tier:'trophy',condition:'late'},
  {species:'DEER',state:'NV',units:['231','6','10'],tier:'trophy'},
  {species:'ELK',state:'NV',units:['111','112','113','114','115'],tier:'trophy'},
];
/** Unit associations supplied in the owner's analysis. An association does not locate individual records. */
const mappedCountyUnits: Record<string, Record<string, string[]>> = {
  'AZ:ELK': { Coconino:['5A','5B','6A','6B','7E','7W','8','9','11M','12A','12B','13A','13B'], Apache:['1','2A','2B','2C','3B','27'] },
  'AZ:DEER': { Coconino:['5A','5B','6A','6B','7E','7W','8','9','11M','12A','12B','13A','13B'], Mohave:['10','15A','15B','15C','15D','16A','17A','17B','18A','18B'] },
  'CO:DEER': { Eagle:['34','35','36','43','44','45','47'], Garfield:['21','22','23','24','25','26','30','31','32','33','42','43'], Mesa:['30','31','40','41','42'] },
  'CO:ELK': { Mesa:['30','31','40','41','42'] },
  'MT:ELK': { Park:['313','314','317','390','393'], 'Powder River':['704'] },
  'NV:DEER': { Lincoln:['221','222','223','231','241','242'], Elko:['6','7','10'] },
  'NV:ELK': { 'White Pine':['111','112','113','114','115','121','131','132'] },
  'NM:DEER': { 'Rio Arriba':['2A','2B','2C','4','5A','5B','6A','6B','6C','51'] },
  'NM:ELK': { Catron:['15','16A','16B','16C','16D','16E','21','22','23'] },
  'WA:DEER': { Okanogan:['203','204','209','215','218','224','231','233','239','242','243'], Chelan:['244','245','246','247','248','249','250','251'] },
  'WA:ELK': { Kittitas:['328','329','330','334','335','336'] },
};
const scoreFor: Record<TrophyTier,TrophyScore> = {unicorn:100,trophy:80,county:65,unclassified:50};
const normalize = (v:string) => v.trim().toUpperCase().replace(/^UNIT\s*/,'');
const geographicUnitSets = Object.fromEntries(Object.entries(geographicUnits.states).flatMap(([state,bySpecies]) =>
  Object.entries(bySpecies).map(([species,entries])=>[`${state}:${species}`,new Set(entries.map(entry=>normalize(entry.unit)))]))) as Record<string,Set<string>>;
const antlerless = (v:string) => /ANTLERLESS|COW|DOE|EITHER SEX ANTLERLESS/.test(v.toUpperCase());
const matchesCondition = (condition: Rule['condition'], hunt: TrophyHunt) => {
  if (!condition) return true;
  const s = (hunt.season ?? '').toLowerCase();
  if (!s) return false; // never infer a special season from the unit alone
  if (hunt.state.toUpperCase()==='CO' && condition==='late') return /late|3rd|4th|third|fourth/.test(s) && /rifle/.test(s);
  if (hunt.state.toUpperCase()==='AZ' && condition==='early') return /early|rut/.test(s) && (/archery|rifle/.test(s) || hunt.weapon==='ARCHERY');
  if (hunt.state.toUpperCase()==='NV' && condition==='late') return /late|rut/.test(s) && (/rifle|muzzleloader/.test(s) || hunt.weapon==='MUZZLELOADER');
  return condition === 'late' ? /late|3rd|4th|third|fourth|rut/.test(s) : /early|rut/.test(s);
};
export function classifyTrophy(hunt:TrophyHunt): TrophyResult {
  if (hunt.twoPoint || hunt.antlerMaximum || antlerless(hunt.antlerClass) || !['ELK','DEER'].includes(hunt.species.toUpperCase()) || hunt.deerType?.toUpperCase()==='WHITETAIL')
    return {score:null,tier:null,reason:'Trophy classification not applicable'};
  if (!hunt.units.length) return {score:null,tier:null,reason:'Unit is unknown'};
  const units = new Set(hunt.units.map(normalize));
  const state = hunt.state.toUpperCase(), species = hunt.species.toUpperCase();
  for (const tier of ['unicorn','trophy'] as const) {
    const match = rules.find(r => r.tier===tier && r.state===state && r.species===species && r.units.some(u=>units.has(u)) && matchesCondition(r.condition,hunt));
    if (match) {
      if (hunt.type === 'GENERAL') return tier === 'unicorn'
        ? {score:80,tier:'trophy',reason:'General hunt in a recognized premium unit'}
        : {score:65,tier:'county',reason:'General hunt in a recognized premium unit'};
      return {score:scoreFor[tier],tier,reason:`Recognized ${tier} unit`};
    }
  }
  const associations = mappedCountyUnits[`${state}:${species}`];
  if (associations && Object.values(associations).some(mapped => mapped.some(u => units.has(normalize(u)))))
    return {score:65,tier:'county',reason:'Unit associated with a recognized geographic area; individual record locations are not known'};
  const crosswalk = geographicUnitSets[`${state}:${species}`];
  if (crosswalk && [...units].some(unit=>crosswalk.has(unit)))
    return {score:65,tier:'county',reason:'Unit intersects a recognized area, sometimes only in a small portion; individual record locations are not known'};
  return {score:50,tier:'unclassified',reason:'No designation in the current dataset; not evidence of low trophy potential'};
}
/** Neutral at 50; maximum +5 points before the existing success ceiling. */
export function trophyQualityBonus(score: TrophyScore | null):number {
  return score === null ? 0 : (score - 50) / 10;
}
