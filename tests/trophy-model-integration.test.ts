import test from 'node:test';
import assert from 'node:assert/strict';
import {trophyForHunt, trophyForUnit, trophyHuntEvidence, idahoV2Tier} from '../src/lib/trophyHunt';
import utahHunts from '../data/ut/hunts.json';

test('an unlisted exceptional pronghorn hunt receives Good with the same unit-map tier', () => {
  const h={state:'MT',species:'PRONGHORN',type:'CONTROLLED',weapon:'ANY',antlerClass:'EITHER',
    units:['A322'],tagCode:'322-20',oddsLastYear:2026,resAppsLast:3512,nrAppsLast:491};
  assert.equal(trophyForHunt(h),65);
  assert.equal(trophyForUnit(h,'A322').score,65);
  assert.equal(trophyForHunt({...h,oddsLastYear:2025}),50);
});

test('Utah updated named sources are recognized and unknown demand remains provisional', () => {
  const h={state:'UT',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['607']};
  assert.equal(trophyForHunt({...h,oddsLastYear:2026}),65);
  const unknown={...h,oddsLastYear:null};
  assert.equal(trophyForHunt(unknown),65);
  assert.equal(trophyHuntEvidence(unknown,65).provisional,true);
});

test('updated Utah evidence produces consistent hunt and unit tiers for a representative elk hunt', () => {
  const hunt = utahHunts.hunts.find(h => h.tagCode === 'EB3049');
  assert.ok(hunt);
  assert.equal(trophyForHunt(hunt), 100);
  assert.equal(trophyForUnit(hunt, hunt.units[0]).score, 100);
});

test('DWR premium buck deer permits are Elite across weapons and multiseason hunts', () => {
  for (const code of ['DB1000','DB1001','DB1002','DB1003','DB1004','DB1005','DB1006','DB1007','DB1008']) {
    const hunt=utahHunts.hunts.find(h=>h.tagCode===code);
    assert.ok(hunt,code);
    assert.equal(trophyForHunt(hunt),100,code);
    assert.equal(trophyForUnit(hunt,hunt.units[0]).score,100,code);
    assert.match(trophyHuntEvidence(hunt,100).reason,/DWR premium/);
  }
  const henry=utahHunts.hunts.find(h=>h.tagCode==='DB1003')!;
  assert.notEqual(trophyForUnit(henry,'163').score,100);
  assert.equal(trophyForHunt({...henry,antlerClass:'ANTLERLESS'}),null);
  const management=utahHunts.hunts.find(h=>h.tagCode==='DB1009')!;
  assert.notEqual(trophyForHunt(management),100);
  assert.notEqual(trophyForHunt({...henry,tagCode:'DB9999'}),100);
});

test('Idaho 1044 (Area 55) uses its v2 tier in hunt and map, and never shades Unit 57', () => {
  const h={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['55'],
    huntNumber:1044,oddsLastYear:2026,openDate:'2026-08-15',closeDate:'2026-09-24'};
  assert.equal(trophyForHunt(h),65);
  assert.equal(trophyForUnit(h,'55').score,65);
  assert.equal(trophyForUnit(h,'57').score,null);
  assert.notEqual(trophyForHunt({...h,huntNumber:9999}),80);
});

test('Idaho v2 tiers: Unit 54 November above October, unit 40 November at 80, other years fall back', () => {
  const base={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',oddsLastYear:2026};
  assert.equal(trophyForHunt({...base,units:['54'],huntNumber:1043,openDate:'2026-11-15',closeDate:'2026-11-30'}),100);
  assert.equal(trophyForHunt({...base,units:['54'],huntNumber:1042,openDate:'2026-10-05',closeDate:'2026-10-31'}),65);
  const h={...base,units:['40'],huntNumber:1031,resAppsLast:5008,nrAppsLast:1174,openDate:'2026-11-01',closeDate:'2026-11-24',bigPct5:.7647,resOdds5:.039,nrOdds5:.024};
  assert.equal(trophyForHunt(h),80);
  assert.equal(trophyForUnit(h,'40').score,80);
  assert.match(trophyForUnit(h,'40').reason,/Ranks \d+ of 108 Idaho controlled deer hunts/);
  assert.equal(trophyHuntEvidence(h,80).provisional,true);
  assert.match(trophyHuntEvidence(h,80).reason,/another hunt or a broader area/);
  assert.equal(idahoV2Tier({...h,oddsLastYear:2027}),null,'a new draw year falls back until the table is regenerated');
  assert.equal(idahoV2Tier({...h,species:'ELK'}),null);
  assert.equal(idahoV2Tier({...h,state:'CO'}),null);
});


test('an Idaho hunt number with different units never inherits a v2 tier', () => {
  const h={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',oddsLastYear:2026,huntNumber:1001,openDate:'2026-08-30',closeDate:'2026-12-01'};
  assert.equal(idahoV2Tier({...h,units:['39']}),null);
  assert.notEqual(idahoV2Tier({...h,units:['1','2','3','4','4A','5','6','7','9']}),null);
  assert.equal(idahoV2Tier({...h,units:[]}),null);
});

test('Idaho 1044 stored as Units 55+57 gets the same v2 tier as the corrected Area 55 hunt', () => {
  const raw={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['55','57'],
    huntNumber:1044,oddsLastYear:2026,openDate:'2026-08-15',closeDate:'2026-09-24'};
  assert.equal(trophyForHunt(raw),65);
  assert.equal(trophyForUnit(raw,'55').score,65);
  assert.equal(trophyForUnit(raw,'57').score,null);
});
