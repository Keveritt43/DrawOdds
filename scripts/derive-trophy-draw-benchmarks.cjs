/** Read-only descriptive screen. Pass an archived/fresh Idaho snapshot as argv[2].
 * Output must be reviewed against official reports before copying into data/.
 * A percentile is not a statistical significance test or a personal draw probability.
 */
const fs=require('node:fs');
const idSnapshot=process.argv[2];
if(!idSnapshot)throw Error('Pass a read-only Idaho HuntSummary snapshot JSON.');
const inputs={ID:idSnapshot,WA:'data/wa/hunts.json',MT:'data/mt/hunts.json',UT:'data/ut/hunts.json',WY:'data/wy/hunts.json'};
for(const [state,path] of Object.entries(inputs)){
 const data=JSON.parse(fs.readFileSync(path,'utf8')),rows=data.rows??data.hunts,groups=new Map();
 for(const h of rows){
  if(!['DEER','ELK'].includes(h.species)||h.youthOnly||h.privateOnly||!['ANTLERED','EITHER'].includes(h.antlerClass)||!Number.isInteger(h.oddsLastYear)||typeof h.nrOddsLast!=='number'||h.nrOddsLast<0||h.nrOddsLast>1)continue;
  const po=h.pointOdds??{};const kind=state==='ID'?'random':po.kind;if(!kind)continue;
  const category=state==='WA'?(po.category??'unknown'):state==='MT'?(po.license??kind):kind;
  const key=[state,h.species,h.oddsLastYear,kind,category].join('|');let group=groups.get(key);if(!group)groups.set(key,group=new Map());
  // A general tag can appear once for each method; do not count those copies separately.
  const identity=h.type==='GENERAL'?`GENERAL:${(h.units??[]).join(',')}`:`CONTROLLED:${h.id}`;
  if(!group.has(identity))group.set(identity,h.nrOddsLast);
 }
 for(const [key,values] of groups){const a=[...values.values()].sort((a,b)=>a-b);if(a.length>=20)console.log(JSON.stringify({key,n:a.length,p75:a[Math.ceil(.75*a.length)-1]}));}
}
