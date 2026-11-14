import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {HuntSummary} from '@prisma/client';
import {withStateTrophyScores} from '../src/lib/stateTrophyScores';
import {scoreHunts} from '../src/lib/score';

test('read-time state Quality and trophy tier use the same evidence without changing inputs',()=>{
 const row={id:'wa-check',state:'WA',species:'ELK',type:'CONTROLLED',units:['172'],name:'Mountain View',weapon:'ANY',antlerClass:'ANTLERED',openDate:new Date('2026-10-26'),closeDate:new Date('2026-11-08'),tagSeasons:null,pointOdds:{kind:'squared',category:'Quality Elk'},resOddsLast:.009,nrOddsLast:.009,oddsLastYear:2025,hunters5:280,harvest5:210,harvestYears:5,huntersSqMi:.2,publicPct:70,huntablePct:70,privateOnly:false,nrTag:false,scoreQuality:3,scoreTrophy:50} as unknown as HuntSummary;
 const before=JSON.stringify(row),actual=withStateTrophyScores(row);
 const expected=scoreHunts([{...row,nrTag:false,huntablePct:row.publicPct}]).get(row.id)!;
 assert.equal(actual.scoreTrophy,65,'late season drops supported premium one tier');
 assert.equal(actual.scoreQuality,expected.scoreQuality);
 assert.equal(JSON.stringify(row),before);
});
test('Wyoming deer with unvalidated harvest is never given a computed Quality',()=>{
 const row={id:'wy-check',state:'WY',species:'DEER',type:'CONTROLLED',units:['D101'],weapon:'ANY',antlerClass:'ANTLERED',hunters5:100,harvest5:80,publicPct:90,huntersSqMi:1,scoreQuality:99} as unknown as HuntSummary;
 assert.equal(withStateTrophyScores(row).scoreQuality,null);
});
