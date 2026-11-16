import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchesHuntPreset, parseHuntPresets } from '../src/lib/huntPresets';
import { wyPresetHarvest } from '../src/lib/wyPresetHarvest';
import wyHarvest from '../data/wy/harvest.json';
const f = { youth:'exclude' as const, antler:['ANTLERED'], weapon:[], months:[], dayFrom:null, dayTo:null, dayMode:'open' as const };
const h = { species:'ELK', weapon:'ARCHERY', openDate:new Date('2026-09-12'), closeDate:new Date('2026-09-24'), youthOnly:false, antlerClass:'ANTLERED', scoreTrophy:65, publicPct:65, success5:.6 };
test('preset thresholds use measured values', () => {
  assert.equal(matchesHuntPreset('max-trophy',h,.5,false,f),false);
  assert.equal(matchesHuntPreset('trophy-sleepers',h,.1,false,f),true);
  assert.equal(matchesHuntPreset('trophy-sleepers',h,null,true,f),true);
  assert.equal(matchesHuntPreset('trophy-sleepers',h,null,false,f),false);
  assert.equal(matchesHuntPreset('peak-rut',h,null,false,f),true);
  assert.equal(matchesHuntPreset('public-diy',h,null,false,f),true);
  assert.equal(matchesHuntPreset('tag-filler',h,null,false,f),true);
  assert.equal(matchesHuntPreset('tag-filler',{...h,success5:null},null,false,f),false);
  assert.deepEqual(parseHuntPresets('peak-rut,bogus,peak-rut,tag-filler'),['peak-rut','tag-filler']);
});
test('pronghorn peak-rut timing uses the September window', () => {
  const p={...h,species:'PRONGHORN',openDate:new Date('2026-09-11T00:00:00Z'),closeDate:new Date('2026-09-30T00:00:00Z')};
  assert.equal(matchesHuntPreset('peak-rut',p,null,false,f),true);
  assert.equal(matchesHuntPreset('peak-rut',{...p,openDate:new Date('2026-10-11'),closeDate:new Date('2026-10-20')},null,false,f),false);
  assert.equal(matchesHuntPreset('peak-rut',{...p,scoreTrophy:null},null,false,f),false);
});
import { matchesTiming } from '../src/lib/huntPresets';
test('timing applies to the same eligible season segment as weapon and dates', () => {
  const segmented = { ...h, tagSeasons: { seasons: [
    { weapon:'ARCHERY', sex:'antlered', notes:'', dates:[{open:'2026-09-12',close:'2026-09-24'}] },
    { weapon:'ANY', sex:'antlered', notes:'', dates:[{open:'2026-10-13',close:'2026-10-20'}] },
  ] } };
  assert.equal(matchesTiming(segmented,f),true);
  assert.equal(matchesTiming(segmented,{...f,weapon:['ANY']}),false);
});
import { presetHref } from '../src/lib/filterPresets';
test('saved search retains all selected preset alternatives', () => {
  assert.match(presetHref('/hunts?states=ID,CO&huntPreset=peak-rut%2Ctag-filler') ?? '', /huntPreset=peak-rut%2Ctag-filler/);
});
test('Wyoming Tag Filler uses separately identified pooled active-license rates', () => {
  const elk = { ...h, state:'WY', success5:null, pointOdds:{ harvest:wyHarvest.species.elk['1-1'] } };
  const rates = wyPresetHarvest(elk.pointOdds, 'ELK');
  assert.equal(rates[0].years, 4);
  assert.ok(rates[0].rate > .6 && rates[0].rate < .61);
  assert.equal(matchesHuntPreset('tag-filler',elk,null,false,f),true);
  assert.equal(matchesHuntPreset('tag-filler',{...elk,publicPct:64},null,false,f),false);
  assert.equal(matchesHuntPreset('tag-filler',{...elk,pointOdds:{...elk.pointOdds,harvestBasis:'region'}},null,false,f),false);
  assert.equal(matchesHuntPreset('tag-filler',{...elk,pointOdds:{harvest:[{year:2025,hunters:0,harvest:0}]}},null,false,f),false);
  assert.equal(matchesHuntPreset('tag-filler',{...elk,state:'ID'},null,false,f),false);
});
test('Wyoming deer species rates are independent and do not add overlapping licenses', () => {
  const pointOdds={harvest:[{year:2025,basis:'mule+whitetail',huntersMule:100,mule:20,huntersWhitetail:100,whitetail:70}]};
  assert.deepEqual(wyPresetHarvest(pointOdds,'DEER').map(r=>[r.label,r.rate]),[['Mule deer',.2],['Whitetail',.7]]);
  assert.equal(matchesHuntPreset('tag-filler',{...h,state:'WY',species:'DEER',success5:null,pointOdds},null,false,f),true);
  assert.deepEqual(wyPresetHarvest({harvest:[{year:2025,basis:'mule+whitetail',huntersMule:1,mule:2}]},'DEER'),[]);
});

test('Montana permit-based Tag Filler is a separate, explicitly identified proxy', () => {
  const p={...h,state:'MT',species:'DEER',success5:null,pointOdds:{mulePermit:true,harvest:[{year:2023,hunters:25,harvest:21},{year:2025,hunters:25,harvest:18}]}};
  assert.equal(matchesHuntPreset('tag-filler',p,null,false,f),true);
  assert.equal(matchesHuntPreset('tag-filler',{...p,pointOdds:{harvest:[{hunters:25,harvest:21}]}},null,false,f),false);
  assert.equal(matchesHuntPreset('tag-filler',{...p,pointOdds:{mulePermit:true,harvest:[{hunters:0,harvest:0}]}},null,false,f),false);
  assert.equal(matchesHuntPreset('tag-filler',{...p,publicPct:64},null,false,f),false);
});
