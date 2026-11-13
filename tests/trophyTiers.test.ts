import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyTrophy, trophyQualityBonus } from '../src/lib/trophyTiers';

const elk = {species:'ELK',state:'AZ',units:['9'],antlerClass:'ANTLERED'};
test('unicorn only for matching season',()=>{
 assert.equal(classifyTrophy({...elk,season:'early archery'}).score,100);
 assert.equal(classifyTrophy(elk).score,80);
});
test('antlerless excluded rather than assigned a zero or fifty',()=>{
 const r=classifyTrophy({...elk,antlerClass:'ANTLERLESS',season:'early rifle'});
 assert.equal(r.score,null); assert.equal(r.tier,null);
});
test('unverified county overlap remains neutral',()=>{
 assert.equal(classifyTrophy({species:'DEER',state:'CO',units:['34'],antlerClass:'ANTLERED'}).score,50);
 assert.equal(classifyTrophy({species:'ELK',state:'ID',units:['999'],antlerClass:'ANTLERED'}).score,50);
});
test('trophy only adds quality premium above neutral',()=>{
 assert.equal(trophyQualityBonus(null),0);
 assert.equal(trophyQualityBonus(50),0);
 assert.equal(trophyQualityBonus(65),1.5);
 assert.equal(trophyQualityBonus(80),3);
 assert.equal(trophyQualityBonus(100),5);
});
