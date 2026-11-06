import { cache } from 'react';
import { db } from './db';
import type { CoPressureContext } from './coPressure';
/** One read-only context per server request; no agency sync or persisted score rewrite. */
export const getCoScoringContext = cache(async (): Promise<CoPressureContext> => {
  const [generalElk,reports]=await Promise.all([
    db.huntSummary.findMany({where:{state:'CO',species:'ELK',type:'GENERAL'},select:{id:true,state:true,species:true,type:true,tagCode:true,units:true,openDate:true,closeDate:true,tagSeasons:true}}),
    db.stateReport.findMany({where:{state:'CO',species:'ELK',kind:'harvest-unit'},select:{year:true,source:true,data:true},orderBy:{year:'desc'}}),
  ]);
  return {generalElk,reports};
});
