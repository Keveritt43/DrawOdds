import test from 'node:test';
import assert from 'node:assert/strict';
import {trophyForHunt, trophyForUnit, trophyHuntEvidence} from '../src/lib/trophyHunt';

test('an unlisted exceptional pronghorn hunt receives Good with the same unit-map tier', () => {
  const h={state:'MT',species:'PRONGHORN',type:'CONTROLLED',weapon:'ANY',antlerClass:'EITHER',
    units:['A322'],tagCode:'322-20',oddsLastYear:2026,resAppsLast:3512,nrAppsLast:491};
  assert.equal(trophyForHunt(h),65);
  assert.equal(trophyForUnit(h,'A322').score,65);
  assert.equal(trophyForHunt({...h,oddsLastYear:2025}),50);
});

test('Utah county-only evidence without high demand stays Standard and is marked provisional when unknown', () => {
  const h={state:'UT',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['607']};
  assert.equal(trophyForHunt({...h,oddsLastYear:2026}),50);
  const unknown={...h,oddsLastYear:null};
  assert.equal(trophyForHunt(unknown),50);
  assert.equal(trophyHuntEvidence(unknown,50).provisional,true);
});

test('the retained Idaho Unit 55 early-season exception is consistent in hunt and map', () => {
  const h={state:'ID',species:'DEER',type:'CONTROLLED',weapon:'ANY',antlerClass:'ANTLERED',units:['55'],
    huntNumber:1044,oddsLastYear:2026,openDate:'2026-08-15',closeDate:'2026-09-24'};
  assert.equal(trophyForHunt(h),80);
  assert.equal(trophyForUnit(h,'55').score,80);
  assert.equal(trophyForUnit(h,'57').score,null);
  assert.notEqual(trophyForHunt({...h,huntNumber:9999}),80);
});
