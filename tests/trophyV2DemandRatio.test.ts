import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demandRatioPercentile,type DemandRow} from '../src/lib/trophyV2DemandRatio';
const row=(code:string,applications:number,permits:number|null,extra:Partial<DemandRow>={}):DemandRow=>
 ({code,species:'ELK',year:2026,category:'Limited-Entry',weapon:'ANY',pool:'Resident',applications,permits,...extra});
test('a small hunt with heavy demand outranks a large hunt with more raw applications',()=>{
 const rows=[row('BIG',5000,2000),row('SMALL',2000,5),...Array.from({length:10},(_,i)=>row(`P${i}`,100*(i+1),10))];
 const big=demandRatioPercentile(rows,rows[0])!,small=demandRatioPercentile(rows,rows[1])!;
 assert.equal(big.ratio,2.5);assert.equal(small.ratio,400);
 assert.ok(small.percentile>big.percentile);assert.equal(small.percentile,1-.5/12);
});
test('falls back to all weapons only with ten peers, and leaves no-permit pools unknown',()=>{
 const archery=Array.from({length:4},(_,i)=>row(`A${i}`,50+i,5,{weapon:'ARCHERY'}));
 const rifle=Array.from({length:8},(_,i)=>row(`R${i}`,40+i,5));
 const r=demandRatioPercentile([...archery,...rifle],archery[0])!;
 assert.equal(r.allWeapon,true);assert.equal(r.peers,12);
 assert.equal(demandRatioPercentile([...archery,...rifle.slice(0,5)],archery[0]),null);
 assert.equal(demandRatioPercentile(rifle,row('NR',30,null)),null);
 assert.equal(demandRatioPercentile(rifle,row('NR',30,0)),null);
});
test('other pools and categories never join the cohort; a conflicting duplicate is unknown',()=>{
 const rows=Array.from({length:10},(_,i)=>row(`P${i}`,10*(i+1),1));
 const nr=rows.map(r=>({...r,pool:'Nonresident' as const,applications:1}));
 assert.equal(demandRatioPercentile([...rows,...nr],rows[0])!.peers,10);
 assert.equal(demandRatioPercentile([...rows,{...rows[3],applications:999}],rows[3]),null);
});
