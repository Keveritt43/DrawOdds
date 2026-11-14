/** Offline model audit of an existing snapshot; this does not connect to or mutate a database. */
import {readFileSync,writeFileSync} from 'node:fs';
import {scorePlan,type ScoreSnapshot} from '../src/lib/scorePlan';
import {scoreLand} from '../src/lib/privateLand';
import {seasonRules} from '../src/lib/tagSeasons';
const path=process.argv[2];
if(!path)throw Error('Pass the path to an existing Idaho snapshot JSON');
const raw=JSON.parse(readFileSync(path,'utf8')) as {rows:Record<string,any>[]};
const fields=['scoreQuality','scoreSuccess','scoreAccess','scoreCrowd','scoreTrophy','scoreOppRes','scoreOppNr'] as const;
const snapshot:ScoreSnapshot=raw.rows.map(r=>({
  input:{id:r.id,state:'ID',units:r.units,openDate:r.openDate,closeDate:r.closeDate,species:r.species,type:r.type,nrTag:r.nrTag,weapon:r.weapon,antlerClass:r.antlerClass,
    hunters5:r.hunters5,harvest5:r.harvest5,harvestYears:r.harvestYears,nrOddsLast:r.nrOddsLast,oddsLastYear:r.oddsLastYear,youthOnly:r.youthOnly,privateOnly:r.privateOnly,huntersSqMi:r.huntersSqMi,...scoreLand({state:'ID',species:r.species,type:r.type,huntNumber:r.huntNumber,privateOnly:r.privateOnly,publicPct:r.publicPct,huntablePct:r.huntablePct}),
    bigPct5:r.bigPct5,deerType:r.deerType,tagSeasons:r.tagSeasons,twoPoint:seasonRules(r.tagSeasons,r.species).includes('2-point bucks only'),
    antlerMaximum:seasonRules(r.tagSeasons,r.species).includes('Spike bulls only'),resOdds5:r.resOdds5,nrOdds5:r.nrOdds5,capped:r.capped},
  before:Object.fromEntries(fields.map(k=>[k,r[k]])) as ScoreSnapshot[number]['before'],
}));
const plan=scorePlan(snapshot),qualityDeltas=plan.rows.map(r=>r.before.scoreQuality!==null&&r.after.scoreQuality!==null?r.after.scoreQuality-r.before.scoreQuality:null).filter((n):n is number=>n!==null);
const tiers:Record<string,number>={}; for(const r of plan.rows)tiers[String(r.after.scoreTrophy)]=(tiers[String(r.after.scoreTrophy)]??0)+1;
const summary={snapshot:path,rows:plan.rows.length,model:plan.version,trophyTiers:tiers,changedRows:plan.rows.filter(r=>fields.some(k=>r.before[k]!==r.after[k])).length,
  qualityIncreases:qualityDeltas.filter(n=>n>0).length,qualityDecreases:qualityDeltas.filter(n=>n<0).length,
  qualityDeltaMin:Math.min(...qualityDeltas),qualityDeltaMax:Math.max(...qualityDeltas),
  note:'Archived snapshot only; not a fresh production plan, and never valid for an apply.'};
writeFileSync('out/trophy-demand/idaho-archived-audit.json',JSON.stringify({summary,plan},null,2));
console.log(JSON.stringify(summary));
