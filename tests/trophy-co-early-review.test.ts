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
