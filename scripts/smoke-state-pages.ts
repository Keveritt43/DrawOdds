/** CI-only smoke test against the disposable local PostgreSQL service. Never production. */
import specialHunts from '../data/co-special-import.json';
import {spawn, spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {db} from '../src/lib/db';import fixture from '../tests/fixtures/co-page-smoke.json';
async function main(){
 const target=new URL(process.env.DATABASE_URL??'http://invalid');if(process.env.DRAWODDS_SMOKE!=='1'||!['localhost','127.0.0.1'].includes(target.hostname))throw Error('CI-only local database required');
 for(const row of fixture){const r={...row} as any;for(const key of ['openDate','closeDate'])if(r[key])r[key]=new Date(r[key]);await db.hunt.create({data:{idfgId:r.huntId,state:'CO',year:2027,species:r.species,type:r.type,name:r.name,code:r.tagCode,takeMethod:r.takeMethod,weapon:r.weapon,antlerClass:r.antlerClass,sexText:r.antlerClass,units:r.units}});await db.huntSummary.create({data:r});}
 for(const [index,cls]of ['EITHER','ANTLERLESS'].entries()){const huntId=80000001+index;await db.hunt.create({data:{idfgId:huntId,state:'ID',year:2027,species:'DEER',type:'GENERAL',name:'CI '+cls,takeMethod:'Any Weapon',weapon:'ANY',antlerClass:cls as 'EITHER'|'ANTLERLESS',sexText:cls,units:['30']}});await db.huntSummary.create({data:{id:'ci-'+cls,slug:cls==='EITHER'?'ci-youth-window':'ci-cow',huntId,state:'ID',name:'CI '+cls,species:'DEER',type:'GENERAL',weapon:'ANY',takeMethod:'Any Weapon',antlerClass:cls as 'EITHER'|'ANTLERLESS',unit:'30',units:['30'],months:[10],seasonDays:[],openDate:new Date('2027-10-10'),closeDate:new Date('2027-10-31'),tagSeasons:cls==='EITHER'?{year:2027,seasons:[{weapon:'ANY',sex:'antlered',notes:'',dates:[{open:'2027-10-10',close:'2027-10-24'}]},{weapon:'ANY',sex:'antlerless (youth hunt only)',notes:'',dates:[{open:'2027-10-10',close:'2027-10-31'}]}]}:undefined}});}
 await db.unit.create({data:{state:'CO',name:'70',acres:100000}});
 await db.stateReport.create({data:{id:'ci-unit-elk',state:'CO',species:'ELK',kind:'harvest-unit',year:2024,source:'https://cpw.state.co.us/activities/hunting/big-game/hunting-elk/elk-statistics',data:{totals:{rifle3:[{unit:'70',hunters:123,harvest:40,days:500}]},split:{},parserVersion:3}}});
 const numericUnits=[...new Set(specialHunts.flatMap(h=>h.units).filter(u=>/^\d/.test(u)))];
 await db.unit.createMany({data:numericUnits.map(name=>({state:'CO',name})),skipDuplicates:true});
 const idFixture=80000003;
 await db.hunt.create({data:{idfgId:idFixture,state:'ID',year:2026,species:'MOOSE',type:'CONTROLLED',name:'CI Idaho Bull Moose',takeMethod:'Any Weapon',weapon:'ANY',antlerClass:'ANTLERED',sexText:'Bull',units:['30']}});
 await db.huntSummary.create({data:{id:'ci-idaho-moose',slug:'ci-idaho-moose',huntId:idFixture,state:'ID',name:'CI Idaho Bull Moose',species:'MOOSE',type:'CONTROLLED',weapon:'ANY',takeMethod:'Any Weapon',antlerClass:'ANTLERED',units:['30'],months:[],seasonDays:[]}});
 for(const result of ['inserted','already imported']){
   const seeded=spawnSync(process.execPath,['scripts/import-co-special.cjs','--apply'],{env:process.env,encoding:'utf8'});
   assert.equal(seeded.status,0,seeded.stderr);assert.ok(seeded.stdout.includes('[CO_SPECIAL_IMPORT] '+result),seeded.stdout);
 }
 assert.equal(await db.huntSummary.count({where:{state:'CO',species:{in:['MOOSE','BIGHORN','GOAT']}}}),373);
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3100'],{env:{...process.env,AUTH_URL:'http://localhost:3100',AUTH_TRUST_HOST:'true',BOOTSTRAP_SYNC:'0',AUTO_SYNC_ENABLED:'0'},stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 const base='http://localhost:3100';async function page(path:string,state='CO',cookie=''){const r=await fetch(base+path,{headers:{cookie:'state='+state+'; '+cookie},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path+' '+logs.slice(-1200));return r.text();}
 try{let ready=false;for(let i=0;i<60;i++){try{await fetch(base+'/login');ready=true;break}catch{await new Promise(r=>setTimeout(r,500));}}assert.ok(ready,'Next server ready');
 for(const p of ['/','/guide','/about','/changes','/score','/planner','/map']){const html=await page(p);assert.ok(html.includes('Colorado'),p+' has Colorado context');}
 const hunt=await page('/hunts/co-ef070o3r');assert.ok(hunt.includes('Land Ownership And Access'));assert.ok(hunt.includes('Hunters By Hunt Code'));assert.ok(hunt.includes('Hunters In These Units By Season'));assert.ok(hunt.includes('123'));
 const co=await page('/hunts?species=ELK&antler=ANTLERLESS&minPublic=10');assert.ok(co.includes('co-ef070o3r'));assert.ok(co.includes('Recommended Tags'));assert.ok(!/<details[^>]*class="picks"[^>]*open/.test(co));
 const hidden=await page('/hunts?from=10-30&to=10-31&antler=ANTLERED','ID');assert.ok(!hidden.includes('/hunts/ci-youth-window'),'hidden youth extension excluded');const shown=await page('/hunts?from=10-30&to=10-31&antler=ANTLERED&youth=include','ID');assert.ok(shown.includes('/hunts/ci-youth-window'),'included youth extension matches');
 const put=await fetch(base+'/api/filters',{method:'PUT',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({state:'CO',query:'species=ELK&antler=ANTLERLESS&minPublic=10',owner:null})});assert.equal(put.status,200);const cookie=put.headers.get('set-cookie')!.split(';')[0];const restored=await fetch(base+'/hunts',{headers:{cookie:'state=CO; '+cookie}});assert.ok(restored.url.includes('antler=ANTLERLESS'));assert.ok(restored.url.includes('minPublic=10'));assert.equal(restored.status,200);
 const special=await page('/hunts?states=CO,ID&draw=msg&species=MOOSE&view=table');
 assert.ok(special.includes('ci-idaho-moose')&&special.includes('first-choice draw rate'));
 const moose=await page('/hunts/co-mf007o1a');
 assert.ok(moose.includes('Historical Primary Draw')&&moose.includes('MF007O1M')&&moose.includes('Drawn Out At')&&moose.includes('Hunter Success'));
 const sheep=await page('/hunts/co-cms56o1r');
 assert.ok(sheep.includes('random draw for desert bighorn sheep'));
 const goat=await page('/units/co-G01');
 assert.ok(goat.includes('co-geg01o1a')&&goat.includes('Population Estimates'));
 const pts='pts='+encodeURIComponent(JSON.stringify({CO:{res:'RESIDENT',DEER:8,ELK:7,PRONGHORN:5,MOOSE:3,BIGHORN:3,GOAT:3,weighted:{MOOSE:4,BIGHORN:6,GOAT:0},specialSet:true,set:true,youth:false}}));
 const personal=await page('/hunts/co-geg01o1a','CO',pts);
 for(const title of ['Your Draw Odds','Draw odds at each weighted point level','Applicants and drawn by weighted points','Historical draw odds at your points','Hunters and harvest'])assert.ok(personal.includes(title),'missing special-species graph '+title);
 assert.ok(personal.includes('3 preference + 0 weighted points'));
 const savedGoat=await db.huntSummary.findUniqueOrThrow({where:{id:'co:GEG01O1A'}});
 const favorites='saved_items='+encodeURIComponent(JSON.stringify({hunts:[savedGoat.huntId],units:['co-G01']}));
 const account=await page('/account','CO',pts+'; '+favorites);
 for(const value of ['saved-id','saved-co','Saved Filters','Favorite Units','/units/co-G01','/hunts/co-geg01o1a','GOAT_weighted'])assert.ok(account.includes(value),'account saved items '+value);
 const features=JSON.parse(await page('/api/search/units?state=CO&draw=msg&species=GOAT')).features;
 assert.equal(features.length,16);assert.ok(features.every((f:{properties:{name:string}})=>f.properties.name.startsWith('CO:G')));
 const weekend=await page('/api/export?states=CO&draw=msg&species=GOAT&q=GEG07O1R&from=9-5&to=9-6');
 assert.ok(!weekend.includes('GEG07O1R'));
 const weekday=await page('/api/export?states=CO&draw=msg&species=GOAT&q=GEG07O1R&from=9-7&to=9-7');
 assert.ok(weekday.includes('GEG07O1R')&&weekday.includes('historical'));
 const wrong=await fetch(base+'/api/filters',{method:'PUT',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({state:'CO',query:'antler=ANTLERLESS',owner:'different-user'})});assert.equal(wrong.status,409);
 console.log('STATE_PAGE_SMOKE_SUCCESS: Colorado pages, hunt pressure, land filters, collapsed recommendations, youth dates and visitor preference restoration');
 }finally{server.kill('SIGTERM');await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
