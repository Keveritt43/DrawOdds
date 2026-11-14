import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreHunts, opportunity, accessScore, type ScoreInput } from '../src/lib/score';
import { successBands, successVerdict } from '../src/lib/format';
const hunt = (extra: Partial<ScoreInput> = {}): ScoreInput => ({ id: 'h', species: 'ELK', type: 'CONTROLLED', weapon: 'MUZZLELOADER', antlerClass: 'ANTLERLESS', hunters5: 1000, harvest5: 190, huntablePct: 100, huntersSqMi: 0, resOdds5: 1, nrOdds5: 1, ...extra });
const score = (extra: Partial<ScoreInput> = {}) => scoreHunts([hunt(extra)]).get('h')!;

test('all species use the same success benchmarks across weapons, labels and scores', () => {
  const bands: Record<string, [number, number, number]> = {
    DEER: [.55,.35,.75], PRONGHORN: [.6,.35,.85],
    MOOSE: [.7,.5,.9], BIGHORN: [.7,.5,.9], GOAT: [.7,.5,.9],
  };
  for (const species of ['DEER','ELK','PRONGHORN','MOOSE','BIGHORN','GOAT']) {
    for (const type of ['GENERAL','CONTROLLED']) {
      const expected = species === 'ELK' ? type === 'CONTROLLED' ? [.5,.2,.8] : [.2,.1,.5] : bands[species];
      const [hi,lo] = expected;
      for (const weapon of ['ANY','ARCHERY','MUZZLELOADER','SHORT_RANGE','OTHER']) {
        assert.deepEqual(successBands(species,weapon,type),expected);
        assert.equal(successVerdict(lo-.001,species,weapon,type).tone,'bad');
        assert.equal(successVerdict(lo,species,weapon,type).tone,'ok');
        assert.equal(successVerdict(hi,species,weapon,type).tone,'good');
        let previous = -1;
        for (let harvest5=0;harvest5<=1000;harvest5+=10) {
          const s=score({species,type,weapon,harvest5});
          assert.deepEqual(s,score({species,type,weapon:'ANY',harvest5}));
          assert.ok(s.scoreQuality!>=previous); previous=s.scoreQuality!;
          assert.ok(s.scoreQuality!<=s.scoreSuccess!+20);
          if (harvest5/1000<lo) assert.ok(s.scoreQuality!<50);
        }
      }
    }
  }
});

test('4038 pronghorn regression: 36% harvest cannot earn Success 100 or elite Quality', () => {
  const actual=score({species:'PRONGHORN',weapon:'ARCHERY',antlerClass:'EITHER',
    hunters5:110,harvest5:40,huntablePct:59.84249320021723,huntersSqMi:.01613158238449535});
  assert.equal(actual.scoreSuccess,32);
  assert.equal(actual.scoreQuality,52);
  assert.equal(successVerdict(40/110,'PRONGHORN','ARCHERY','CONTROLLED').text,'Typical');
  for (const species of ['PRONGHORN','DEER']) {
    const s=score({species,weapon:'ARCHERY',harvest5:380});
    assert.ok(s.scoreSuccess!<40);
    assert.ok(s.scoreQuality!<60);
    assert.equal(successVerdict(.38,species,'ARCHERY','CONTROLLED').tone,'ok');
  }
});
test('controlled elk thresholds are absolute across weapons and match labels', () => {
  for (const weapon of ['ANY', 'ARCHERY', 'MUZZLELOADER', 'SHORT_RANGE']) {
    assert.deepEqual(successBands('ELK', weapon, 'CONTROLLED'), [.5, .2, .8]);
    assert.equal(successVerdict(.19, 'ELK', weapon, 'CONTROLLED').tone, 'bad');
    assert.equal(successVerdict(.5, 'ELK', weapon, 'CONTROLLED').tone, 'good');
  }
  assert.deepEqual(successBands('ELK', 'ANY', 'GENERAL'), [.2, .1, .5]);
});
test('2129 regression: low success cannot become elite with perfect access and density', () => {
  const actual = score({ hunters5: 517, harvest5: 97, huntablePct: 73.8, huntersSqMi: .12 });
  assert.equal(actual.scoreSuccess, 28);
  assert.equal(actual.scoreQuality, 48);
  assert.equal(actual.scoreOppNr, 48);
  for (let harvest5=0;harvest5<200;harvest5++) assert.ok(score({harvest5}).scoreQuality!<50);
  for (const antlerClass of ['ANTLERLESS', 'ANTLERED', 'EITHER']) {
    assert.ok(score({ antlerClass, bigPct5: 1 }).scoreQuality! < 50);
    assert.ok(score({ antlerClass, bigPct5: 1, harvest5: 0 }).scoreQuality! <= 20);
  }
});
test('good general elk can score well and a strong cow hunt needs no trophy', () => {
  assert.ok(score({ type: 'GENERAL', harvest5: 250, huntablePct: 50 }).scoreQuality! >= 70);
  assert.ok(score({ harvest5: 650 }).scoreQuality! >= 80);
  assert.equal(score({ harvest5: 650 }).scoreTrophy, null);
});
test('absolute grades ignore peer composition, missing trophies and draw changes', () => {
  const h = hunt();
  const peers = Array.from({length: 50}, (_,i) => hunt({ id: String(i), harvest5: 900 }));
  assert.deepEqual(scoreHunts([h,...peers]).get('h'), score());
  assert.equal(score({bigPct5: 1}).scoreQuality, score().scoreQuality);
  assert.equal(score({resOdds5:.01}).scoreQuality, score().scoreQuality);
});
test('invalid or missing inputs do not manufacture ratings', () => {
  for (const extra of [{harvest5:null},{harvest5:-1},{harvest5:1001},{harvest5:NaN},{hunters5:Infinity},{hunters5:29},{huntablePct:null},{huntablePct:101},{huntersSqMi:null},{huntersSqMi:-1}]) assert.equal(score(extra).scoreQuality, null);
  assert.equal(accessScore(-1), null);
  assert.equal(opportunity(80, NaN), null);
  assert.equal(opportunity(80, 1.1), null);
});
test('Opportunity remains absolute for all residencies and tag types', () => {
  assert.equal(opportunity(80,.25),40);
  assert.equal(opportunity(80,.01),8);
  assert.equal(opportunity(80,0),0);
  assert.equal(opportunity(80,null),null);
  assert.equal(score({type:'GENERAL',resOdds5:null}).scoreOppRes,score({type:'GENERAL'}).scoreQuality);
  assert.equal(score({type:'GENERAL',nrTag:true,capped:true}).scoreOppRes,null);
  assert.equal(score({nrOdds5:null}).scoreOppNr,null);
});
test('quality monotonic with success, access and elbow room; trophy bounded and sample moderated', () => {
  let previous = -1;
  for (let h=0;h<=1000;h+=5) {
    const s=score({harvest5:h});
    assert.ok(s.scoreQuality!>=previous); previous=s.scoreQuality!;
    for (const v of Object.values(s)) if(v!==null) assert.ok(Number.isInteger(v)&&v>=0&&v<=100);
    assert.ok(s.scoreOppRes!<=s.scoreQuality!);
  }
  assert.ok(score({harvest5:600,huntablePct:80}).scoreQuality!>=score({harvest5:600,huntablePct:30}).scoreQuality!);
  assert.ok(score({harvest5:600,huntersSqMi:.1}).scoreQuality!>=score({harvest5:600,huntersSqMi:2}).scoreQuality!);
  const base=score({antlerClass:'ANTLERED',harvest5:600}).scoreQuality!;
  for(const bigPct5 of [0,.25,.5,.75,1]) assert.ok(Math.abs(score({antlerClass:'ANTLERED',harvest5:600,bigPct5}).scoreQuality!-base)<=5);
  assert.equal(score({antlerClass:'ANTLERED',twoPoint:true,bigPct5:1}).scoreTrophy,null);
  assert.equal(score({species:'DEER',antlerClass:'ANTLERED',deerType:'WHITETAIL',bigPct5:1}).scoreTrophy,null);
  assert.equal(score({species:'MOOSE',hunters5:9,harvest5:9}).scoreQuality,null);
  assert.notEqual(score({species:'MOOSE',hunters5:10,harvest5:9}).scoreQuality,null);
});
test('a recognized trophy tier can be shown without enough harvest data for Quality', () => {
  const result = score({ state:'UT', units:['94'], species:'DEER', antlerClass:'ANTLERED', hunters5:0, harvest5:0 });
  assert.equal(result.scoreTrophy, 100);
  assert.equal(result.scoreQuality, null);
});
import {readFileSync} from 'node:fs';

test('public Idaho snapshot keeps scores bounded and cannot reward poor controlled-elk harvest',()=>{
 const {rows}=JSON.parse(readFileSync('tests/fixtures/idaho-score-snapshot.json','utf8')) as {rows:ScoreInput[]};
 assert.equal(rows.length,1303);
 const result=scoreHunts(rows);
 for(const row of rows){const s=result.get(row.id)!;
  for(const value of Object.values(s))if(value!==null)assert.ok(value>=0&&value<=100&&Number.isInteger(value));
  for(const value of [s.scoreOppRes,s.scoreOppNr])if(value!==null)assert.ok(value<=s.scoreQuality!);
  if(row.species==='ELK'&&row.type==='CONTROLLED'&&(row.harvest5??0)/(row.hunters5||1)<.2&&s.scoreQuality!==null)assert.ok(s.scoreQuality<50,row.id);
 }
 assert.equal(result.get('elk-2129')!.scoreQuality,48);
});

