import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idahoUnitResearchHref, validHuntReturn, withFinderReturn } from '../src/lib/huntNavigation';

test('hunt to unit and back retains residency and the exact finder context', () => {
 const finder='/hunts?states=ID%2CCO&species=DEER&view=table&page=2';
 const hunt=withFinderReturn('/hunts/deer-1042?as=nr',finder);
 const link=new URL(idahoUnitResearchHref('54',hunt),'https://example.test');
 assert.equal(link.pathname,'/units/54');assert.equal(link.searchParams.get('as'),'nr');
 const back=validHuntReturn(link.searchParams.get('returnHunt'));assert.equal(back,hunt);
 assert.equal(new URL(back!,'https://example.test').searchParams.get('returnTo'),finder);
});
test('unit return refuses external destinations, malformed encodings and nested redirects', () => {
 for(const value of ['https://example.com/hunts/deer-1042','//example.com/hunts/deer-1042','/hunts','/hunts/../admin','/hunts/%2f%2fexample.com','/hunts/%5cattack','/hunts/%zz','/hunts/deer-1042#x','/hunts/deer-1042?returnTo=https%3A%2F%2Fevil.test']) assert.equal(validHuntReturn(value),null,value);
 assert.equal(idahoUnitResearchHref('54','https://evil.test/hunts/x'),'/units/54');
});
