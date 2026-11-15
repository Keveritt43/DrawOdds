import test from 'node:test';
import assert from 'node:assert/strict';
import {trophyForHunt, trophyForUnit, trophyHuntEvidence} from '../src/lib/trophyHunt';
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

test('the retained Idaho Unit 55 early-season exception is consistent in hunt and map', () => {
  const h={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['55'],
    huntNumber:1044,oddsLastYear:2026,openDate:'2026-08-15',closeDate:'2026-09-24'};
  assert.equal(trophyForHunt(h),80);
  assert.equal(trophyForUnit(h,'55').score,80);
  assert.equal(trophyForUnit(h,'57').score,null);
  assert.notEqual(trophyForHunt({...h,huntNumber:9999}),80);
});

test('Idaho unit 40 November deer can reach provisional Elite without tier-one B&C', () => {
  const h={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['40'],huntNumber:1031,
    oddsLastYear:2026,resAppsLast:5008,nrAppsLast:1174,openDate:'2026-11-01',closeDate:'2026-11-24',
    bigPct5:.7647,resOdds5:.039,nrOdds5:.024};
  assert.equal(trophyForHunt(h),100);
  assert.equal(trophyForUnit(h,'40').score,100);
  assert.equal(trophyHuntEvidence(h,100).provisional,true);
  assert.notEqual(trophyForHunt({...h,resAppsLast:5007}),100,'mismatched observations are unknown');
  assert.equal(trophyForHunt({...h,openDate:'2026-10-01',closeDate:'2026-10-20'}),80,'non-prime season is adjusted');
});
