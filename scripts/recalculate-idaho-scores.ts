/** Scores only: never imports the sync runner or rebuilds summary rows. */
import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';
import { scorePlan, validateScorePlan, type ScoreSnapshot } from '../src/lib/scorePlan';
import { seasonRules } from '../src/lib/tagSeasons';
import { scoreLand } from '../src/lib/privateLand';
const db=new PrismaClient();
const select={id:true,units:true,openDate:true,closeDate:true,species:true,type:true,nrTag:true,weapon:true,antlerClass:true,hunters5:true,harvest5:true,harvestYears:true,huntersSqMi:true,publicPct:true,huntablePct:true,bigPct5:true,deerType:true,tagSeasons:true,resOdds5:true,nrOdds5:true,nrOddsLast:true,oddsLastYear:true,appsLast:true,resAppsLast:true,nrAppsLast:true,youthOnly:true,capped:true,huntNumber:true,privateOnly:true,scoreQuality:true,scoreSuccess:true,scoreAccess:true,scoreCrowd:true,scoreTrophy:true,scoreOppRes:true,scoreOppNr:true} satisfies Prisma.HuntSummarySelect;
async function snapshot(tx:Prisma.TransactionClient):Promise<ScoreSnapshot> {
  const rows=await tx.huntSummary.findMany({where:{state:'ID'},select,orderBy:{id:'asc'}});
  return rows.map(({scoreQuality,scoreSuccess,scoreAccess,scoreCrowd,scoreTrophy,scoreOppRes,scoreOppNr,tagSeasons,huntNumber,privateOnly,...input})=>({
    // private-land-only hunts score with no public land (src/lib/privateLand.ts)
    input:{...input,state:'ID',tagSeasons,huntNumber,privateOnly,...scoreLand({...input,state:'ID',huntNumber,privateOnly}),twoPoint:seasonRules(tagSeasons,input.species).includes('2-point bucks only'),antlerMaximum:seasonRules(tagSeasons,input.species).includes('Spike bulls only')},
    before:{scoreQuality,scoreSuccess,scoreAccess,scoreCrowd,scoreTrophy,scoreOppRes,scoreOppNr},
  }));
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==2||!['--dry-run','--apply'].includes(args[0]))throw new Error('Usage: tsx scripts/recalculate-idaho-scores.ts --dry-run|--apply <plan.json>');
  const [mode,path]=args;
  if(mode==='--dry-run'){
    const plan=await db.$transaction(async tx=>{
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return scorePlan(await snapshot(tx));
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000});
    writeFileSync(path,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
    console.log(`Read-only plan saved: ${plan.rows.length} Idaho rows; ${plan.digest}. No database writes.`);
    // One reviewable line: how many rows change, and how trophy tiers move.
    const changed=plan.rows.filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after));
    const moves:Record<string,number>={};
    for(const r of changed)if(r.before.scoreTrophy!==r.after.scoreTrophy){const k=`${r.before.scoreTrophy}->${r.after.scoreTrophy}`;moves[k]=(moves[k]??0)+1;}
    const diff=(k:keyof typeof plan.rows[number]['before'])=>changed.filter(r=>r.before[k]!==r.after[k]).length;
    console.log('PLAN_SUMMARY '+JSON.stringify({digest:plan.digest,rows:plan.rows.length,changed:changed.length,trophy:diff('scoreTrophy'),quality:diff('scoreQuality'),oppRes:diff('scoreOppRes'),oppNr:diff('scoreOppNr'),trophyMoves:moves}));
  }else{
    const saved=JSON.parse(readFileSync(path,'utf8'));
    const count=await db.$transaction(async tx=>{
      const fresh=validateScorePlan(saved,await snapshot(tx));
      let changed=0;
      for(const row of fresh.rows){
        if(JSON.stringify(row.before)===JSON.stringify(row.after))continue;
        // Prisma updateMany also writes @updatedAt; the authorized rollout must
        // preserve every non-score field, including the timestamp.
        const s=row.after;
        const count=await tx.$executeRaw`UPDATE "HuntSummary" SET "scoreQuality"=${s.scoreQuality}, "scoreSuccess"=${s.scoreSuccess}, "scoreAccess"=${s.scoreAccess}, "scoreCrowd"=${s.scoreCrowd}, "scoreTrophy"=${s.scoreTrophy}, "scoreOppRes"=${s.scoreOppRes}, "scoreOppNr"=${s.scoreOppNr} WHERE "id"=${row.id} AND "state"='ID'`;
        if(count!==1)throw new Error(`Missing Idaho row ${row.id}; rolling back`);
        changed++;
      }
      return changed;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:120000});
    console.log(`Updated only score columns on ${count} Idaho rows. Review plan retains previous scores.`);
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
