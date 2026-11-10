import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoresSavedFilters, filterQuery } from '../src/lib/filterPreferences';

test('a bare /hunts reopens the saved search', () => {
  assert.equal(restoresSavedFilters({}), true);
  // a key the router left undefined is not a search
  assert.equal(restoresSavedFilters({ species: undefined }), true);
});

test('a URL that names a filter is left alone, so links never pick up filters nobody chose', () => {
  // the homepage tile a beginner clicks: it must not come back pinned to the last unit searched
  assert.equal(restoresSavedFilters({ species: 'DEER', type: 'CONTROLLED' }), false);
  assert.equal(restoresSavedFilters({ type: 'GENERAL' }), false);
  // a shared link has to show its recipient what its sender saw
  assert.equal(restoresSavedFilters({ unit: '50', minPublic: '50' }), false);
  // how the search is shown counts too: a tile that promises the best success means all hunts, not the saved ones
  assert.equal(restoresSavedFilters({ sort: 'success' }), false);
  assert.equal(restoresSavedFilters({ state: 'ID' }), false);
  assert.equal(restoresSavedFilters({ draw: 'msg' }), false);
});

test('the finder keeps its own resume and clear paths', () => {
  // finderHref marks a return as a complete search
  assert.equal(restoresSavedFilters({ state: 'ID', restore: '1' }), false);
  assert.equal(restoresSavedFilters({ restore: '1' }), false);
  // "Reset all filters" clears rather than restores
  assert.equal(restoresSavedFilters({ reset: '1' }), false);
});

test('a saved search never carries routing keys back into the next visit', () => {
  const saved = filterQuery('species=DEER&unit=50&page=3&restore=1&reset=1&state=ID&as=RESIDENT');
  assert.equal(saved, 'species=DEER&unit=50');
  // and what comes back out of the cookie is still a search that stops the next restore
  assert.equal(restoresSavedFilters(Object.fromEntries(new URLSearchParams(saved))), false);
});
