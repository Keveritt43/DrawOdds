import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchesHuntPreset, parseHuntPresets } from '../src/lib/huntPresets';
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
