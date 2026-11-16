import test from 'node:test';
import assert from 'node:assert/strict';
import {trophyForHunt, trophyForUnit, trophyHuntEvidence} from '../src/lib/trophyHunt';

const reviewed = {state:'CO', species:'ELK', type:'CONTROLLED', antlerClass:'ANTLERED', weapon:'ANY',
  units:['76'], tagCode:'EM076E1R', oddsLastYear:2026, appsLast:1200,
  openDate:'2027-10-01', closeDate:'2027-10-07', privateOnly:false, youthOnly:false};

test('documented early bull hunt has one provisional tier across hunt and unit', () => {
  const result=trophyForUnit(reviewed,'76');
  assert.equal(result.score,80);
  assert.match(result.reason,/historical.*provisional/);
  assert.equal(trophyForHunt(reviewed),80);
  assert.equal(trophyHuntEvidence(reviewed,80).provisional,true);
});

test('review does not extend to changed identity, eligibility, dates, year, or multi-unit hunts', () => {
  for (const change of [{tagCode:'EM076O1R'}, {oddsLastYear:2027}, {openDate:'2027-10-02'},
    {closeDate:'2027-10-08'}, {openDate:null}, {privateOnly:true}, {youthOnly:true},
    {privateOnly:undefined}, {antlerClass:'EITHER'}, {units:['76','79']}]) {
    assert.doesNotMatch(trophyForUnit({...reviewed,...change},'76').reason,/Reviewed Unit 76 early rifle/);
  }
  assert.equal(trophyForHunt({...reviewed,antlerClass:'ANTLERLESS'}),null);
});

test('reviewed Colorado early elk hunts retain code-specific provisional forecasts', () => {
  for (const unit of ['2','10','201']) {
    const h={...reviewed,units:[unit],tagCode:`EE${unit.padStart(3,'0')}E1R`,antlerClass:'EITHER',closeDate:'2027-10-11'};
    assert.equal(trophyForHunt(h),80);
    assert.equal(trophyHuntEvidence(h,80).provisional,true);
    assert.doesNotMatch(trophyForUnit({...h,closeDate:'2027-10-10'},unit).reason,/Reviewed 2024/);
    assert.doesNotMatch(trophyForUnit({...h,privateOnly:true},unit).reason,/Reviewed 2024/);
  }
  for (const unit of ['1','61']) {
    const h={...reviewed,units:[unit],tagCode:`EE${unit.padStart(3,'0')}E1R`,antlerClass:'EITHER',closeDate:unit==='61'?'2027-10-07':'2027-10-11'};
    assert.equal(trophyForHunt(h),65);
  }
});

test('Unit 74 high-country review requires the verified partial-area restriction', () => {
  const h={...reviewed,species:'DEER',units:['74'],tagCode:'DM074E1R',openDate:'2026-09-05',closeDate:'2026-09-13',
    pointOdds:{regs:{year:2026,partial:true,unitText:'That portion of GMU 74 above 11,000 feet elevation'}}};
  assert.equal(trophyForHunt(h),80);
  assert.match(trophyForUnit(h,'74').reason,/above 11,000 feet.*provisional/);
  assert.equal(trophyHuntEvidence(h,80).provisional,true);
  for (const regs of [{year:2026,partial:false,unitText:'74'}, {year:2026,partial:true,unitText:'74 below 11,000 feet'},
    {year:2027,partial:true,unitText:'74 above 11,000 feet'}])
    assert.notEqual(trophyForHunt({...h,pointOdds:{regs}}),80);
  assert.notEqual(trophyForHunt({...h,closeDate:'2026-09-14'}),80);
});

test('Unit 55 archery and muzzleloader reviews require matching season and hunt area', () => {
  const h={...reviewed,species:'DEER',units:['55'],openDate:'2027-09-02',closeDate:'2027-09-30',
    tagCode:'DM055O1A',pointOdds:{regs:{year:2026,partial:false,unitText:'55'}}};
  assert.equal(trophyForHunt(h),80);
  assert.equal(trophyHuntEvidence(h,80).provisional,true);
  assert.equal(trophyForHunt({...h,tagCode:'DM055O1M',openDate:'2027-09-11',closeDate:'2027-09-19'}),80);
  assert.notEqual(trophyForHunt({...h,openDate:'2027-09-03'}),80);
  assert.notEqual(trophyForHunt({...h,pointOdds:{regs:{year:2026,partial:true,unitText:'55'}}}),80);
});
