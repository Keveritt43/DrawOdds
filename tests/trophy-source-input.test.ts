import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../data/trophy-source-western-v3.json';
import updated from '../data/trophy-source-western-v4.json';

test('owner source retains all records, future states and Utah management-unit identity', () => {
  assert.equal(createHash('sha256').update(readFileSync('data/trophy-source-western-v3.csv')).digest('hex'), source.sha256);
  assert.equal(source.records.length, 2422);
  assert.equal(new Set(source.records.map(r => r.id)).size, source.records.length);
  assert.deepEqual([...new Set(source.records.map(r => r.state))].sort(), ['AZ','CA','CO','ID','MT','NM','NV','OR','UT','WA','WY']);
  const utah = source.records.filter(r => r.state === 'UT');
  assert.equal(utah.length, 79);
  assert.ok(utah.every(r => r.unitSystem === 'UT_MANAGEMENT_UNIT'));
});

test('updated source preserves Idaho scoring inputs and identifies Utah management units', () => {
  assert.equal(createHash('sha256').update(readFileSync('data/trophy-source-western-v4.csv')).digest('hex'), updated.sha256);
  assert.equal(updated.records.length, 2433);
  assert.equal(new Set(updated.records.map(r => r.id)).size, updated.records.length);
  const byId = (rows: typeof updated.records) => rows.filter(r => r.state === 'ID').sort((a,b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId([...updated.records]), byId([...source.records]));
  const utah = updated.records.filter(r => r.state === 'UT');
  assert.equal(utah.length, 90);
  assert.ok(utah.every(r => r.unitSystem === 'UT_MANAGEMENT_UNIT'));
  assert.ok(utah.some(r => r.sourceTags.some(tag => tag !== 'BC' && tag !== 'bc_top_counties')));
});
