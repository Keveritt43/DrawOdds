import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waLegalDeerType,trophyForUnit,trophyForHunt} from '../src/lib/trophyHunt';
import {resolveTrophyCandidate} from '../src/lib/trophyCandidateResolver';
import wa from '../data/wa/hunts.json';

test('WA deer type is taken from an explicit legal animal, not geography',()=>{
 assert.equal(waLegalDeerType('Mule deer, 3 pt. min.'),'MULE');
 assert.equal(waLegalDeerType('White-tailed, any buck'),'WHITETAIL');
 assert.equal(waLegalDeerType('Black-tailed deer: any buck'),'BLACKTAIL');
 assert.equal(waLegalDeerType('Mule deer or white-tailed deer'),null);
 assert.equal(waLegalDeerType('Any buck'),null);
});
test('GMU 117 special permits use the animal stated by WDFW',()=>{
 const mule=wa.hunts.find(h=>h.id==='WA:1008')!,white=wa.hunts.find(h=>h.id==='WA:1007')!;
 assert.ok(mule&&white);
 const muleRef=resolveTrophyCandidate({state:'WA',species:'DEER',unit:'117',deerType:waLegalDeerType(mule.takeMethod)});
 const whiteRef=resolveTrophyCandidate({state:'WA',species:'DEER',unit:'117',deerType:waLegalDeerType(white.takeMethod)});
 assert.deepEqual(muleRef.sourceIds,['WA_DEER_MULEDEER_117']);
 assert.deepEqual(whiteRef.sourceIds,['WA_DEER_WHITETAIL_117']);
 assert.doesNotMatch(trophyForUnit(mule,'117').reason,/multiple subspecies/);
 assert.equal(trophyForHunt(mule),trophyForUnit(mule,'117').score);
 assert.match(trophyForUnit({...mule,deerType:'WHITETAIL'},'117').reason,/multiple subspecies/);
});
test('blacktail is distinct and general hunts do not inherit special-permit evidence',()=>{
 const ref=resolveTrophyCandidate({state:'WA',species:'DEER',unit:'520',deerType:'BLACKTAIL'});
 assert.deepEqual(ref.sourceIds,['WA_DEER_COLUMBIABLACKTAIL_520']);
 const general=wa.hunts.find(h=>h.id==='WA:GD-520-ANY')!;
 assert.equal(trophyForHunt(general),50);
});
