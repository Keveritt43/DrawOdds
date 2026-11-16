import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {HuntSummary} from '@prisma/client';
import {withUtSeasonCorrections} from '../src/lib/utSeasonCorrections';
import {withStateTrophyScores} from '../src/lib/stateTrophyScores';
import {matchesHuntSeason,type SeasonFilters} from '../src/lib/huntSeasonFilter';
import {seasonsSummary} from '../src/lib/tagSeasons';
import {otcElkOverlap} from '../src/lib/overlappingSeasons';

const hunts=JSON.parse(readFileSync('data/ut/hunts.json','utf8')).hunts as HuntSummary[];
const get=(code:string)=>hunts.find(h=>h.tagCode===code)!;
const filters:SeasonFilters={youth:'include',antler:[],weapon:[],months:[],dayFrom:null,dayTo:null,dayMode:'open'};
test('Utah agency archery labels drive weapon filters and preserve multiseason restrictions',()=>{
 const raw=get('EB3132'),fixed=withUtSeasonCorrections(raw);
 assert.equal(raw.weapon,'ANY');assert.equal(fixed.weapon,'ARCHERY');
 assert.equal(matchesHuntSeason(fixed,{...filters,weapon:['ARCHERY']},true),true);
 assert.equal(matchesHuntSeason(fixed,{...filters,weapon:['ANY']},true),false);
 const multi=withUtSeasonCorrections(get('DB1109'));
 assert.match(seasonsSummary(multi.tagSeasons),/Restricted archery/);
 assert.match(seasonsSummary(multi.tagSeasons),/Restricted rifle/);
});
test('HAMSS is labeled restricted and matches archery or muzzleloader without claiming any weapon',()=>{
 const fixed=withUtSeasonCorrections(get('DB1091'));
 assert.equal(fixed.weapon,'OTHER');assert.match(seasonsSummary(fixed.tagSeasons),/HAMSS restricted weapons/);
 assert.equal(matchesHuntSeason(fixed,{...filters,weapon:['ARCHERY']},true),true);
 assert.equal(matchesHuntSeason(fixed,{...filters,weapon:['MUZZLELOADER']},true),true);
 assert.equal(matchesHuntSeason(fixed,{...filters,weapon:['ANY']},true),false);
});
test('unconfirmed operator dates are windows, not proof of availability or trophy season',()=>{
 const raw=get('DB1200'), fixed=withUtSeasonCorrections(raw);
 assert.match(seasonsSummary(fixed.tagSeasons),/window.*dates vary/);
 assert.equal(matchesHuntSeason(fixed,filters,true),true);
 assert.equal(matchesHuntSeason(fixed,{...filters,months:[10]},true),false);
 assert.equal(withStateTrophyScores(raw).scoreTrophy,null);
 assert.equal(withStateTrophyScores(raw).scoreQuality,null);
 assert.deepEqual(withUtSeasonCorrections(fixed),fixed);
 const target={...fixed,openDate:new Date('2026-09-01'),closeDate:new Date('2026-10-31')};
 assert.equal(otcElkOverlap(target,[]),null);
});
test('Utah correction does not overwrite a changed source window',()=>{
 const raw=get('EB3132'), ts=structuredClone(raw.tagSeasons) as any;
 ts.seasons[0].dates[0].close='2026-09-29';const changed={...raw,tagSeasons:ts};
 assert.equal(withUtSeasonCorrections(changed),changed);
});
