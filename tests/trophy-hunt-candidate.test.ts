import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateHunt} from '../src/lib/trophyHuntCandidate';

test('Colorado deer Unit 40 retains different season results', () => {
 const base={state:'CO',species:'DEER',units:['40'],antlerClass:'ANTLERED',oddsLastYear:2026};
 assert.equal(candidateHunt({...base,tagCode:'DM040O2R',appsLast:388}).score,65);
 assert.equal(candidateHunt({...base,tagCode:'DM040O3R',appsLast:450}).score,80);
 assert.equal(candidateHunt({...base,tagCode:'DM040O4R',appsLast:173}).score,65);
 assert.equal(candidateHunt({...base,antlerClass:'ANTLERLESS'}).score,null);
});
test('maximum-antler restriction remains ineligible and missing units remain unknown', () => {
 const base={state:'ID',species:'DEER',units:['55'],antlerClass:'ANTLERED'};
 assert.equal(candidateHunt({...base,takeMethod:'2 point bucks only'}).score,null);
 assert.equal(candidateHunt({...base,units:[]}).score,null);
});
