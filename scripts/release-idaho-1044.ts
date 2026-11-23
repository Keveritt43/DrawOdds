/** Explicit Area 55 score-only release. No agency sync or schema operations. */
import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { idahoScoreSelect } from '../src/lib/idahoScoreSelect';
import { scorePlan, type ScoreSnapshot } from '../src/lib/scorePlan';
import { seasonRules } from '../src/lib/tagSeasons';
import { scoreLand } from '../src/lib/privateLand';

const db=new PrismaClient();
const EXPECTED:Record<string,unknown>={
  'c:-802082915':{scoreQuality:81,scoreSuccess:80,scoreAccess:81,scoreCrowd:82,scoreTrophy:50,scoreOppRes:31,scoreOppNr:26},
  'c:-810471724':{scoreQuality:88,scoreSuccess:83,scoreAccess:81,scoreCrowd:98,scoreTrophy:100,scoreOppRes:18,scoreOppNr:12},
  'c:80516':{scoreQuality:89,scoreSuccess:90,scoreAccess:81,scoreCrowd:95,scoreTrophy:null,scoreOppRes:63,scoreOppNr:65},
};
const SCORE_KEYS=['scoreQuality','scoreSuccess','scoreAccess','scoreCrowd','scoreTrophy','scoreOppRes','scoreOppNr'] as const;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function read(tx:Prisma.TransactionClient) {
  const [all, inputs, unit]=await Promise.all([
    tx.huntSummary.findMany({orderBy:{id:'asc'}}),
    tx.huntSummary.findMany({where:{state:'ID'},select:idahoScoreSelect,orderBy:{id:'asc'}}),
    tx.unit.findUnique({where:{state_name:{state:'ID',name:'55'}},select:{acres:true,publicPct:true,privatePct:true,accessYesAcres:true,accessYesCount:true}}),
  ]);
  if(!unit || unit.acres!==648520 || unit.publicPct!==52.4 || unit.privatePct!==47.6 || unit.accessYesAcres!==0 || unit.accessYesCount!==0)
    throw new Error(`Unit 55 snapshot changed; review current inputs: ${JSON.stringify(unit)}`);
  const rows:ScoreSnapshot=inputs.map(({scoreQuality,scoreSuccess,scoreAccess,scoreCrowd,scoreTrophy,scoreOppRes,scoreOppNr,tagSeasons,huntNumber,privateOnly,...input})=>({
    input:{...input,state:'ID',tagSeasons,huntNumber,privateOnly,...scoreLand({...input,state:'ID',huntNumber,privateOnly}),twoPoint:seasonRules(tagSeasons,input.species).includes('2-point bucks only'),antlerMaximum:seasonRules(tagSeasons,input.species).includes('Spike bulls only')},
    before:{scoreQuality,scoreSuccess,scoreAccess,scoreCrowd,scoreTrophy,scoreOppRes,scoreOppNr},
  }));
  const idNonScore=all.filter(r=>r.state==='ID').map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!SCORE_KEYS.includes(k as typeof SCORE_KEYS[number]))));
  const other=all.filter(r=>r.state!=='ID');
  return {all,unit,rows,plan:scorePlan(rows),fingerprints:{idNonScore:hash(idNonScore),otherStates:hash(other)}};
}
async function main(){
  const [mode,digest]=process.argv.slice(2);
  if(mode!=='dry-run' && mode!=='apply')throw Error('Use dry-run or apply <reviewed digest>');
  await db.$transaction(async tx=>{
    if(mode==='dry-run')await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const before=await read(tx);
    const changed=before.plan.rows.filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after));
    if(changed.length!==Object.keys(EXPECTED).length || changed.some(r=>!EXPECTED[r.id] || JSON.stringify(r.after)!==JSON.stringify(EXPECTED[r.id])))
      throw Error(`Unexpected plan; no writes: ${JSON.stringify(changed)}`);
    console.log('REVIEW '+JSON.stringify({digest:before.plan.digest,version:before.plan.version,rows:before.rows.length,unit:before.unit,changed,fingerprints:before.fingerprints}));
    if(mode==='dry-run'){
      const backup=gzipSync(Buffer.from(JSON.stringify({idaho:before.all.filter(r=>r.state==='ID'),unit:before.unit,rows:before.rows,plan:before.plan,fingerprints:before.fingerprints}))).toString('base64');
      // Railway rate-limits burst logs. Pace chunks so the complete fresh backup
      // can be independently retrieved and checked before any write.
      for(let i=0;i<backup.length;i+=3000){console.log(`SNAPSHOT ${String(i/3000).padStart(4,'0')} ${backup.slice(i,i+3000)}`);await new Promise(resolve=>setTimeout(resolve,40));}
      console.log(`SNAPSHOT_END ${hash(backup)} ${backup.length}`);
      return;
    }
    if(!digest || digest!==before.plan.digest)throw Error('Stale or unreviewed score plan; no writes');
    let count=0;
    for(const row of changed){
      const s=row.after;
      const updated=await tx.$executeRaw`UPDATE "HuntSummary" SET "scoreQuality"=${s.scoreQuality}, "scoreSuccess"=${s.scoreSuccess}, "scoreAccess"=${s.scoreAccess}, "scoreCrowd"=${s.scoreCrowd}, "scoreTrophy"=${s.scoreTrophy}, "scoreOppRes"=${s.scoreOppRes}, "scoreOppNr"=${s.scoreOppNr} WHERE "id"=${row.id} AND "state"='ID'`;
      if(updated!==1)throw Error('Expected exactly one Idaho row; rolling back');
      count+=updated;
    }
    const after=await read(tx);
    if(JSON.stringify(before.fingerprints)!==JSON.stringify(after.fingerprints))throw Error('Non-score or other-state data changed; rolling back');
    if(after.plan.rows.some(r=>JSON.stringify(r.before)!==JSON.stringify(r.after)))throw Error('Post-write score plan is not current; rolling back');
    console.log('APPLIED '+JSON.stringify({updated:count,ids:changed.map(r=>r.id),verified:after.fingerprints,remaining:0}));
  },{isolationLevel:mode==='dry-run'?Prisma.TransactionIsolationLevel.RepeatableRead:Prisma.TransactionIsolationLevel.Serializable,timeout:120000});
}
main().catch(e=>{console.error('RELEASE_FAILED',e.message);process.exitCode=1}).finally(()=>db.$disconnect());
