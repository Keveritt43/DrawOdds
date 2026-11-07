/** Offline audit of a saved {rows: HuntSummary[]} snapshot. Never connects to a database. */
import { readFileSync } from 'node:fs';
import { scorePlan, type ScoreSnapshot } from '../src/lib/scorePlan';
import { seasonRules } from '../src/lib/tagSeasons';
import type { HuntSummary } from '@prisma/client';

const path=process.argv[2];
if (!path) throw new Error('Usage: tsx scripts/audit-species-scores.ts <saved-snapshot.json>');
const saved=JSON.parse(readFileSync(path,'utf8')) as {rows:HuntSummary[]};
if (!Array.isArray(saved.rows) || saved.rows.some(r=>r.state!=='ID')) throw new Error('Expected an Idaho-only summary snapshot');
const fields=['scoreQuality','scoreSuccess','scoreAccess','scoreCrowd','scoreTrophy','scoreOppRes','scoreOppNr'] as const;
const snapshot:ScoreSnapshot=saved.rows.map(r=>({
  input:{id:r.id,species:r.species,type:r.type,nrTag:r.nrTag,weapon:r.weapon,antlerClass:r.antlerClass,
    hunters5:r.hunters5,harvest5:r.harvest5,huntersSqMi:r.huntersSqMi,publicPct:r.publicPct,
    huntablePct:r.huntablePct,bigPct5:r.bigPct5,deerType:r.deerType,
    twoPoint:seasonRules(r.tagSeasons,r.species).includes('2-point bucks only'),
    resOdds5:r.resOdds5,nrOdds5:r.nrOdds5,capped:r.capped},
  before:{scoreQuality:r.scoreQuality,scoreSuccess:r.scoreSuccess,scoreAccess:r.scoreAccess,
    scoreCrowd:r.scoreCrowd,scoreTrophy:r.scoreTrophy,scoreOppRes:r.scoreOppRes,scoreOppNr:r.scoreOppNr},
}));
const plan=scorePlan(snapshot);
const changed=plan.rows.filter(r=>fields.some(k=>r.before[k]!==r.after[k]));
console.log(JSON.stringify({
  notice:'Offline saved snapshot only. Not a fresh production dry run or authorization to apply.',
  version:plan.version,digest:plan.digest,total:plan.rows.length,changed:changed.length,
  species:['PRONGHORN','DEER','ELK','MOOSE','BIGHORN','GOAT'].map(species=>{
    const ids=new Set(snapshot.filter(r=>r.input.species===species).map(r=>r.input.id));
    return {species,rows:ids.size,changed:changed.filter(r=>ids.has(r.id)).length,
      newlyUnscored:plan.rows.filter(r=>ids.has(r.id)&&r.before.scoreQuality!==null&&r.after.scoreQuality===null).length};
  }),
  example:plan.rows.filter(r=>saved.rows.find(s=>s.id===r.id)?.huntNumber===4038),
},null,2));
