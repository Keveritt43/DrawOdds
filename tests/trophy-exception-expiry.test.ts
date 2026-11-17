import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TROPHY_EXCEPTION_REVIEW as R} from '../src/lib/trophyHunt';

const list=R.exceptions.map(e=>`  - ${e}`).join('\n');
test('bundled draw data has not moved past the year the trophy exceptions were reviewed',()=>{
  for(const st of ['UT','WA','WY'] as const){
    const hunts=JSON.parse(readFileSync(`data/${st.toLowerCase()}/hunts.json`,'utf8')).hunts as {oddsLastYear?:number|null}[];
    const latest=Math.max(...hunts.map(h=>h.oddsLastYear).filter((y):y is number=>typeof y==='number'));
    assert.ok(latest<=R.drawYears[st],`${st} data now reaches ${latest}, past the reviewed ${R.drawYears[st]}. Re-review these exceptions in src/lib/trophyHunt.ts, update their years, then TROPHY_EXCEPTION_REVIEW:\n${list}`);
  }
});
test('trophy exceptions are re-reviewed before their review date',()=>{
  const today=new Date().toISOString().slice(0,10);
  assert.ok(today<=R.reviewBy,`Past ${R.reviewBy}: Colorado and Idaho may now be on a newer draw year, so these exceptions may have stopped matching:\n${list}`);
});
test('every year pinned in trophyHunt.ts is a declared reviewed year',()=>{
  const src=readFileSync('src/lib/trophyHunt.ts','utf8');
  const years=new Set([...src.matchAll(/oddsLastYear===(\d{4})|regs\?\.year===(\d{4})/g)].map(m=>Number(m[1]??m[2])));
  const declared=new Set(Object.values(R.drawYears));
  for(const y of years) assert.ok(declared.has(y),`trophyHunt.ts pins ${y}, which TROPHY_EXCEPTION_REVIEW does not declare`);
});
