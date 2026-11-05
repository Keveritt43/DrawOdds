/** Reproduce the public-snapshot comparison without network or database access. */
import {readFileSync,writeFileSync} from 'node:fs';
import {scoreHunts,curve,type ScoreInput,type ScoreOutput} from '../src/lib/score';
import {successBands} from '../src/lib/format';
type Row=ScoreInput&{name:string;source:string;baseline:ScoreOutput};
const snapshot=JSON.parse(readFileSync('tests/fixtures/idaho-score-snapshot.json','utf8')) as {captured:string;limitations:string;rows:Row[]};
const scores=scoreHunts(snapshot.rows);
const rows=snapshot.rows.map(r=>{
 const s=scores.get(r.id)!;
 const success=s.scoreSuccess,access=s.scoreAccess,crowd=s.scoreCrowd;
 const complete=success!==null&&access!==null&&crowd!==null&&s.scoreQuality!==null;
 const [hi,lo,top]=successBands(r.species,r.weapon,r.nrTag?'GENERAL':r.type);
 const raw=(r.harvest5??0)/(r.hunters5||1);
 const ceiling=Math.min(Math.min(curve(raw,[[0,0],[lo,30],[hi,75],[top,100]]),success??0)+20,raw<lo?49:100);
 const bonus=s.scoreTrophy===null?0:(s.scoreTrophy-50)*.1*(r.harvest5??0)/((r.harvest5??0)+50);
 return {...r,after:s,
 // A tests stronger success weighting alone; B adds the harvest ceiling; C shifts 10 points from access to success.
 candidateA:complete?Math.max(0,Math.min(100,Math.round(.65*success!+.2*access!+.15*crowd!+bonus))):null,
 candidateC:complete?Math.max(0,Math.min(100,Math.round(Math.min(.75*success!+.1*access!+.15*crowd!+bonus,ceiling)))):null};
});
const mean=(v:number[])=>v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):'—';
const summary=(name:string,get:(r:typeof rows[number])=>number|null)=>{
 const values=rows.map(get).filter((x):x is number=>x!==null);return `| ${name} | ${values.length} | ${mean(values)} | ${values.filter(v=>v>=80).length} | ${values.filter(v=>v>=90).length} |`;
};
const fmt=(v:number|null)=>v===null?'—':String(v);
const comparison=(r:typeof rows[number])=>`| [${r.id}](${r.source}) | ${r.type} ${r.weapon} ${r.antlerClass} | ${r.hunters5?((r.harvest5??0)/r.hunters5*100).toFixed(1):'—'}% | ${fmt(r.baseline.scoreQuality)} → ${fmt(r.after.scoreQuality)} | ${fmt(r.baseline.scoreOppRes)} → ${fmt(r.after.scoreOppRes)} | ${fmt(r.baseline.scoreOppNr)} → ${fmt(r.after.scoreOppNr)} |`;
const candidates=rows.filter(r=>r.species==='ELK'&&r.type==='CONTROLLED'&&(r.harvest5??0)/(r.hunters5||1)<.2&&r.after.scoreQuality!==null);
const names=['elk-2129','elk-2066','elk-2005','elk-unit-20a-general-any-weapon'];
const selected=names.flatMap(id=>rows.filter(r=>r.id===id));
for(const pred of [
 (r:typeof rows[number])=>r.species==='ELK'&&r.type==='GENERAL'&&!r.nrTag&&(r.harvest5??0)/(r.hunters5||1)>=.2,
 (r:typeof rows[number])=>r.species==='ELK'&&r.antlerClass==='ANTLERED'&&r.after.scoreTrophy!==null,
 (r:typeof rows[number])=>r.species==='DEER',
 (r:typeof rows[number])=>r.species==='MOOSE',
 (r:typeof rows[number])=>r.hunters5!==null&&(r.hunters5??0)<30,
]){const r=rows.filter(pred).sort((a,b)=>(b.after.scoreQuality??-1)-(a.after.scoreQuality??-1))[0];if(r&&!selected.includes(r))selected.push(r);}
const lines=[`# Idaho scoring comparison — ${snapshot.captured}`,'',`Snapshot: ${rows.length} rows from existing production exports; no agency sync or database writes. ${snapshot.limitations}`,'',
'Candidate A: 65/20/15 success/access/density plus bounded trophy adjustment, without harvest ceiling. Candidate B (selected): same weights with observed/sample-adjusted Success + 20 ceiling. Candidate C: 75/10/15 with the same ceiling. Trophy is neutral when unavailable in all three. All candidates use the new fixed conservative prior and absolute Opportunity.','',
'| Model | Scored | Mean Quality | Quality ≥80 | Quality ≥90 |','|---|---:|---:|---:|---:|',summary('Old (reconstructed)',r=>r.baseline.scoreQuality),summary('A: weighted only',r=>r.candidateA),summary('B: harvest ceiling (selected)',r=>r.after.scoreQuality),summary('C: 75% success',r=>r.candidateC),'',
`Among ${candidates.length} scored controlled elk hunts below 20% observed success: A gives ${candidates.filter(r=>(r.candidateA??0)>=50).length} Quality ≥50; B gives ${candidates.filter(r=>(r.after.scoreQuality??0)>=50).length}. B preserves more useful access influence than C, while explicitly stopping compensation for poor harvest.`,'',
'| Hunt | Context | Harvest success | Quality before → after | Resident Opportunity | NR Opportunity |','|---|---|---:|---:|---:|---:|',...selected.map(comparison),'',
'## Largest Quality decreases (audit for unintended effects)','','| Hunt | Context | Harvest success | Quality before → after | Resident Opportunity | NR Opportunity |','|---|---|---:|---:|---:|---:|',...rows.filter(r=>r.after.scoreQuality!==null&&r.baseline.scoreQuality!==null).sort((a,b)=>(a.after.scoreQuality!-a.baseline.scoreQuality!)-(b.after.scoreQuality!-b.baseline.scoreQuality!)).slice(0,10).map(comparison),'',
'## Limits and review decisions','',
'- The supplied identifier `2-1-2-9` appears to mean hunt 2129. The literal URL is absent; 2129 matches cow/muzzleloader, 18.8% success and live Quality 87. The live resident Opportunity was 100 and reconstructed NR Opportunity 99. Live component bars were Success 80, Access 90, Elbow room 93, trophy omitted.',
'- Old Quality was 35/35/20 with trophy omitted and remaining weights renormalized. Controlled muzzleloader elk high-success threshold was just 16.5% (30% × 0.55), low 8.25%, top 33%. Peer shrinkage further changed the grade; the final percentile made Opportunity look nearly perfect.',
'- Selected controlled benchmarks are deliberately stricter and weapon independent: under 20% is poor, 50% strong, 80% exceptional. General elk: under 10% poor, 20% strong, 50% exceptional. No empirical claim is made that these judgment thresholds optimize hunter preferences.',
'- Sample floor remains 30 hunter-seasons (10 for moose/sheep/goat). Fixed prior = 50 hunter-seasons at the low benchmark (10 for those species); it suppresses tiny perfect samples without depending on peers. Observed-success ceiling prevents upward shrinkage from hiding a poor outcome.',
'- Trophy adjusts a common base by ±5 at most, shrunk by harvest/(harvest+50). Cow hunts have zero adjustment, not redistributed weights. Bull trophy share is conditional on successful harvest and lacks its own denominator here; total harvest is an upper-bound sample proxy, so its influence stays small.',
'- Public + Access Yes! acreage is a land proxy, not verified legal or physical access. Density is a whole-area annual average, not public-land crowding; it can flatter private-heavy or very large areas, and overlapping seasons can share hunters. Its weight is reduced to 15%; no invented precision is added.',
'- General harvest combines sex/season classes, and tag rows aggregate units/weapons. These remain data-granularity limitations. CSV lacks capped and two-point flags, rounds percentages/density, and can mark known capped tags as OTC in this offline comparison; use the exact database dry run before rollout. The production implementation retains capped-tag and two-point exclusions.',
'- Missing land/density now suppresses overall Quality rather than redistributing their weights. Missing/invalid harvest or odds remains unknown, never zero. Invalid harvest above hunters is rejected rather than clamped. This may reduce score coverage and should be reviewed.',
'- Absolute Opportunity uses Quality × sqrt(odds). This is a preference index, not expected harvest probability; Draw and Fill already presents draw odds × success. No relative percentile is shown, avoiding new UI controls and schema columns.',
'- Finder already sorts/filters stored score columns per residency and excludes Quality <50 by default when sorting Opportunity; no finder layout or navigation changes are needed. Recalculation is required before existing stored rows reflect this model.',
'', 'Reproduce with `npm run scores:compare`. Exact production values must come from the reviewed scores-only dry run documented in `docs/idaho-scoring-rollout.md`.',''];
writeFileSync('docs/idaho-scoring-comparison.md',lines.join('\n'));
console.log(lines.slice(0,24).join('\n'));
