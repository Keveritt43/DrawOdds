import meta from '../../data/id-visual-meta.json';
export const ID_CONDITIONS_DATE=meta.droughtDate;
export const ID_CONDITIONS_SNAPSHOT=meta.snapshot;
export type IdahoFirePeriod = 'recent' | 'mature' | 'five' | 'all';
export const firePeriodsFor=(year:number):Record<IdahoFirePeriod,string>=>({recent:`${year-3}–${year-1} (1–3 years before ${year})`,mature:`${Math.max(2018,year-8)}–${year-3} (3–8 years before ${year})`,five:`${year-5}–${year-1} (1–5 years before ${year})`,all:`2018–${year} (${year} incomplete)`});
export const FIRE_PERIODS=firePeriodsFor(Number(meta.snapshot.slice(0,4)));
export const idFirePeriod=(value:string):IdahoFirePeriod|null=>Object.hasOwn(FIRE_PERIODS,value)?value as IdahoFirePeriod:null;
