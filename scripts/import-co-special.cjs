
/** Insert only the reviewed CPW snapshot. No schema changes or agency requests. */
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const approved = {
  'co-special-import': 'ef1d376753e633ed107e13932e8ab6e6a28bd0a6922ee58b5c4b88d7d7649988',
  'co-special-gmu': 'b4d68fbd1d9d58ad39d734bba12c025f8c79fca3d999589bc745871c2f1382b2',
  'co-special-land': '6c4ccf0e5948d0e8c3a9756995e81059168954025abd2a87a22e44c18bdf858e',
  'co-special-reports': '4d745179ab116e88e70a21475990395dd6743c16a4d7f8ef9539af4d59db6fc4',
};
const sha = value => createHash('sha256').update(value).digest('hex');
const signature = sha(JSON.stringify(approved));
const marker = 'CO|special-import|2026';
const year = 2026;
const special = ['MOOSE','BIGHORN','GOAT'];
const state = 'CO';
const labels = {MOOSE:'Moose',BIGHORN:'Rocky Mountain Bighorn Sheep',GOAT:'Mountain Goat',DESERT:'Desert Bighorn Sheep'};
const methods = {A:'Archery',M:'Muzzleloader',R:'Rifle',X:'Season choice'};
const weapon = {A:'ARCHERY',M:'MUZZLELOADER',R:'ANY',X:'ANY'};
const hash = key => {
  let h = 2166136261;
  for (let i=0;i<key.length;i++) h=Math.imul(h^key.charCodeAt(i),16777619);
  return -((h>>>1)||1);
};
function load(name){
  const file = readFileSync('data/'+name+'.json','utf8').replace(/\r\n/g,'\n');
  if(sha(file)!==approved[name])throw Error('Snapshot checksum mismatch: '+name);
  return JSON.parse(file);
}
const toDate = s => s ? new Date(s+'T00:00:00.000Z') : null;
const dayMs = 86400000;
const dayIndex = d => Math.round((d-Date.UTC(d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1,6,1))/dayMs);
const rate = (draw, i) => draw?.apps[i] ? draw.drew[i]/draw.apps[i] : null;

function prepare() {
  const snapshot=load('co-special-import');
  const geometries=load('co-special-gmu');
  const land=load('co-special-land');
  const catalog=load('co-special-reports');
  const hunts=[], summaries=[];
  const speciesCounts={MOOSE:0,GOAT:0,BIGHORN:0,DESERT:0};
  for(const h of snapshot){
    const code=h.code, species=h.species==='DESERT'?'BIGHORN':h.species, d=h.draws[0], prev=h.draws[1]?.year===year-1?h.draws[1]:null;
    if(!special.includes(species)||!h.units.length||d.year!==year)throw Error('Invalid Colorado hunt '+code);
    speciesCounts[h.species]++;
    const huntId=hash('CO|'+code);
    const takeMethod=methods[code.at(-1)];
    if(!takeMethod)throw Error('Unknown weapon '+code);
    const antlerClass={M:'ANTLERED',F:'ANTLERLESS',E:'EITHER'}[code[1]];
    const sexText=antlerClass==='EITHER'?'Either sex':(h.species==='MOOSE'?['Bull','Cow']:h.species==='GOAT'?['Billy','Nanny']:['Ram','Ewe'])[antlerClass==='ANTLERED'?0:1];
    const name='Unit '+h.units[0]+' · '+labels[h.species]+' · '+sexText+' · '+takeMethod;
    const spans=h.seasons.flatMap(s=>s.dates);
    const openDate=toDate(spans.map(s=>s.open).sort()[0]),closeDate=toDate(spans.map(s=>s.close).sort().at(-1));
    const days=new Set(), months=new Set();
    for(const s of spans) for(let t=+toDate(s.open),last=+toDate(s.close);t<=last;t+=dayMs){
      const date=new Date(t); days.add(dayIndex(date)); months.add(date.getUTCMonth()+1);
    }
    const tags=d.shared?d.issued:d.quota;
    const base={state,species,type:'CONTROLLED',name,units:h.units,takeMethod,weapon:weapon[code.at(-1)],antlerClass,openDate,closeDate,tags};
    hunts.push({...base,idfgId:huntId,code,year,sexText,source:'cpw-reviewed-special-2026'});
    const harvest=h.harvest[0], success=harvest?.hunters?harvest.harvest/harvest.hunters:null;
    summaries.push({...base,huntId,id:'co:'+code,slug:'co-'+code.toLowerCase(),tagCode:code,
      openMonth:openDate?openDate.getUTCMonth()+1:null,closeMonth:closeDate?closeDate.getUTCMonth()+1:null,
      months:[...months].sort((a,b)=>a-b), seasonDays:[...days].sort((a,b)=>a-b),closeDay:closeDate?dayIndex(closeDate):null,
      tagSeasons:{year,seasons:h.seasons},
      privateOnly:['P','W','J'].includes(code[5]),
      oddsLastYear:year,oddsYears:h.draws.length,
      resAppsLast:d.apps[0], nrAppsLast:d.apps[1], appsLast:d.apps.reduce((a,b)=>a+b,0),
      resOddsLast:rate(d,0), nrOddsLast:rate(d,1), resOddsPrev:rate(prev,0), nrOddsPrev:rate(prev,1),
      resAppsPrev:prev?.apps[0]??null,nrAppsPrev:prev?.apps[1]??null,
      permitsLast:d.issued,permitsPrev:prev?.issued??null,
      harvestYears:h.harvest.length,harvestLastYear:harvest?.year??null,
      hunters5:harvest?.hunters??null,harvest5:harvest?.harvest??null,success5:success,successLast:success,
      daysPerHunter5:harvest?.hunters&&harvest.days!==null?harvest.days/harvest.hunters:null,
      daysPerHarvest5:harvest?.harvest&&harvest.days!==null?harvest.days/harvest.harvest:null,
      smallSample:!harvest||harvest.hunters<10,
      pointOdds:{special:h},
      weapons:[...new Set(h.seasons.map(s=>s.weapon))],
    });
  }
  if (JSON.stringify(speciesCounts)!==JSON.stringify({MOOSE:197,GOAT:48,BIGHORN:124,DESERT:4}) ||
      new Set(hunts.map(h=>h.idfgId)).size!==hunts.length ||
      new Set(summaries.map(h=>h.slug)).size!==summaries.length)
    throw Error('Unexpected scope, count or collision');
  const units=Object.entries(geometries).map(([name,geometry])=>{
    const l=land[name];
    if(!/^[SG]\d\d$/.test(name)||!l||geometry.type!=='MultiPolygon'||!geometry.coordinates.length)throw Error('Invalid special GMU '+name);
    const {acres,publicPct,privatePct,ownership}=l;
    return {state,name,geometry,acres,publicPct,privatePct,landOwnership:Object.entries(ownership).map(([manager,pct])=>({manager,pct}))};
  });
  if(units.length!==90)throw Error('Unexpected boundary count');
  const reports = catalog.map(r=>({
    id:['CO','special',r.species,r.kind,r.year].join('|'),state,species:r.species==='DESERT'?'BIGHORN':r.species,
    kind:'special-'+r.kind,year:r.year,source:r.url,data:{subspecies:r.species},
  }));
  return {hunts,summaries,units,reports,speciesCounts};
}

async function importSpecial(db, payload) {
  const {hunts,summaries,units,reports}=payload;
  const where = {state,species:{in:special}};
  const unitNames=units.map(u=>u.name);
  const baseNames=[...new Set(summaries.flatMap(h=>h.units).filter(u=>!unitNames.includes(u)))];
  return db.$transaction(async tx=>{
    const before=await tx.$queryRaw`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text, '[]')) AS digest
      FROM "HuntSummary" s WHERE state <> 'CO' OR species NOT IN ('MOOSE','BIGHORN','GOAT')`;
    const [existing, huntCount, summaryCount, unitCount, reportCount, baseCount] = await Promise.all([
      tx.stateReport.findUnique({where:{id:marker}}),tx.hunt.count({where}),tx.huntSummary.count({where}),
      tx.unit.count({where:{state,name:{in:unitNames}}}),tx.stateReport.count({where:{state,kind:{startsWith:'special-'}}}),
      tx.unit.count({where:{state,name:{in:baseNames}}}),
    ]);
    if(existing){
      if(existing.data.signature!==signature||huntCount!==hunts.length||summaryCount!==summaries.length||unitCount!==units.length||reportCount!==reports.length)
        throw Error('Existing import does not match the reviewed snapshot');
      return 'already imported';
    }
    if(huntCount||summaryCount||unitCount||reportCount)throw Error('Existing special species rows; refusing to overwrite');
    if(baseCount!==baseNames.length)throw Error('Missing existing Colorado moose GMUs');
    if(await tx.hunt.count({where:{idfgId:{in:hunts.map(h=>h.idfgId)}}})||
      await tx.huntSummary.count({where:{OR:[{id:{in:summaries.map(h=>h.id)}},{slug:{in:summaries.map(h=>h.slug)}}]}}))
      throw Error('A hunt ID or slug already exists');
    await tx.unit.createMany({data:units});
    await tx.hunt.createMany({data:hunts});
    for(let i=0;i<summaries.length;i+=75) await tx.huntSummary.createMany({data:summaries.slice(i,i+75)});
    await tx.stateReport.createMany({data:reports});
    await tx.stateReport.create({data:{id:marker,state,kind:'reviewed-import',year,source:'reviewed CPW snapshot',data:{signature}}});
    const after=await tx.$queryRaw`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text, '[]')) AS digest
      FROM "HuntSummary" s WHERE state <> 'CO' OR species NOT IN ('MOOSE','BIGHORN','GOAT')`;
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Existing hunt summaries changed');
    return 'inserted';
  },{isolationLevel:'Serializable',maxWait:10000,timeout:90000});
}
async function main(){
  const payload=prepare();
  const apply=process.argv.includes('--apply');
  const target={project:'3b787b52-68db-4733-850a-aa0e2685586e',environment:'839f3c6e-14ff-43b5-a6ad-b23b5b6c0698',service:'250d9cb4-cbc7-45a2-ad97-1584e78014b3'};
  console.log('[CO_SPECIAL_SNAPSHOT]',JSON.stringify({signature,counts:payload.speciesCounts,units:payload.units.length,reports:payload.reports.length,apply}));
  if(!apply)return;
  const local=process.env.DRAWODDS_SMOKE==='1'&&['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname);
  const production=process.env.RAILWAY_PROJECT_ID===target.project&&process.env.RAILWAY_ENVIRONMENT_ID===target.environment&&process.env.RAILWAY_SERVICE_ID===target.service;
  if(!local&&!production)throw Error('Import requires the specified Railway production web service or the disposable CI database');
  const db=new PrismaClient();
  try{console.log('[CO_SPECIAL_IMPORT]',await importSpecial(db,payload));}
  finally{await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error('[CO_SPECIAL_IMPORT_FAILED]',error);process.exitCode=1;});
module.exports={prepare,importSpecial};
