import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedValues } from '../src/lib/selectedValues';
import { parseFilters } from '../src/lib/finder';

test('repeated and comma-separated trophy selections agree between the panel and search', () => {
  const params = new URLSearchParams('trophy=100,80&trophy=65&trophy=50');
  assert.deepEqual(selectedValues(params, 'trophy'), ['100', '80', '65', '50']);
  assert.deepEqual(parseFilters({ trophy: params.getAll('trophy') }).trophy, [100, 80, 65, 50]);
  const remaining = selectedValues(params, 'trophy').filter(value => value !== '80');
  params.set('trophy', remaining.join(','));
  assert.deepEqual(parseFilters({ trophy: params.get('trophy')! }).trophy, [100, 65, 50]);
  assert.deepEqual(selectedValues(new URLSearchParams('antler=ALL'), 'antler', 'ANTLERED'), []);
});
