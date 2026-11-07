import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finderHref, validFinderReturn, withFinderReturn } from '../src/lib/huntNavigation';

test('finder return keeps combined states, filters and result position through hunt detail links', () => {
  const query = 'states=ID%2CCO&species=DEER&season=2&deerType=MULE&sort=opp&view=table&page=2';
  const back = finderHref(query, 'ID');
  const detail = new URL(withFinderReturn('/hunts/example?odds=last#odds', back), 'https://example.test');
  assert.equal(detail.searchParams.get('odds'), 'last');
  assert.equal(detail.hash, '#odds');
  assert.equal(validFinderReturn(detail.searchParams.get('returnTo')), '/hunts?' + query);
  const related = withFinderReturn('/hunts/related', detail.searchParams.get('returnTo'));
  assert.equal(new URL(related, detail).searchParams.get('returnTo'), back);
});

test('legacy finder return skips default overlays and never replays reset', () => {
  assert.equal(finderHref('reset=1&draw=DEP', 'ID'), '/hunts?draw=DEP&state=ID&restore=1');
  assert.equal(finderHref('state=CO&page=2', 'ID'), '/hunts?state=CO&page=2&restore=1');
});

test('finder return only accepts local finder URLs', () => {
  for (const invalid of ['//other.example/hunts', 'https://other.example/hunts', '/hunts/123', '/hunts#x', '/hunts?returnTo=%2Fhunts', '/hunts?x=\\other']) {
    assert.equal(validFinderReturn(invalid), null);
    assert.equal(withFinderReturn('/hunts/example', invalid), '/hunts/example');
  }
});
