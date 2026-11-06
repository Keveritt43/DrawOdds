/** Read-only HTTP checks. No sync, schema, profile writes or authenticated cookies. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const origin = process.argv.slice(2).find(arg => /^https?:\/\//.test(arg)) || 'https://web-production-39e54.up.railway.app';
const cookie = 'state=ID; residency=NONRESIDENT';
async function get(path: string, headers: Record<string, string> = {}) {
  const start = performance.now();
  const response = await fetch(origin + path, { headers: { cookie, ...headers } });
  const body = await response.text();
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  assert.ok(!body.includes('Application error: a server-side exception'), path);
  return { response, body, ms: Math.round(performance.now() - start) };
}
// Agency names and notes can contain embedded commas/newlines.
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function main() {
  const health = await get('/api/health');
  assert.equal(JSON.parse(health.body).ok, true);
  const baseline = await Promise.all(['ID', 'CO'].map(async state => {
    const x = await get('/api/export?species=ELK&type=CONTROLLED&antler=ANTLERED', { cookie: `state=${state}; residency=NONRESIDENT` });
    return { state, rows: csv(x.body).length - 1, sha256: createHash('sha256').update(x.body).digest('hex') };
  }));
  if (process.argv.includes('--baseline')) { console.log(JSON.stringify({ legacy: baseline })); return; }
  const query = 'states=ID,CO&species=ELK&weapon=ARCHERY&antler=ANTLERED&minScore=0&sort=opp&from=9-1&to=9-30';
  const cold = await get(`/hunts?${query}`);
  const warm = await get(`/hunts?${query}&view=table`);
  const exported = await get(`/api/export?${query}`);
  assert.equal(exported.response.headers.get('cache-control'), 'private, no-store');
  const records = csv(exported.body), head = records.shift()!;
  const col = (name: string) => head.indexOf(name);
  assert.ok(records.length > 0);
  assert.deepEqual([...new Set(records.map(r => r[col('State')]))].sort(), ['CO', 'ID']);
  assert.ok(records.every(r => r[col('Species')] === 'Elk'));
  // Zone tags can advertise several weapons; their eligible archery season drives matching.
  assert.ok(records.filter(r => r[col('State')] === 'CO').every(r => r[col('Weapon')] === 'Archery'));
  const text = cold.body.replace(/<[^>]*>/g, '');
  assert.match(text, new RegExp(`${records.length} hunt options`));
  assert.ok(warm.body.includes('class="htable"'));
  const grouped = await get(`/hunts?${query}&view=unit`);
  assert.ok(grouped.body.includes('/units/'));
  const unit = await get('/api/export?states=ID,CO&species=ELK&unit=CO:39&minScore=0');
  const unitRows = csv(unit.body).slice(1);
  assert.ok(unitRows.length > 0);
  assert.ok(unitRows.every(r => r[0] === 'CO' && r[col('Units')].split(' ').includes('39')));
  for (const state of ['ID', 'CO']) {
    const geometry = await get(`/api/search/units?state=${state}`);
    assert.match(geometry.response.headers.get('cache-control') ?? '', /public/);
    const fc = JSON.parse(geometry.body);
    assert.ok(fc.features.length > 0);
    assert.ok(fc.features.every((f: { properties: Record<string, string> }) => f.properties.name.startsWith(`${state}:`) && Object.keys(f.properties).length === 1));
  }
  const invalid = await fetch(origin + '/api/search/units?state=XX');
  assert.equal(invalid.status, 400);
  console.log(JSON.stringify({ ok: true, matches: records.length, firstRequestMs: cold.ms, warmTableMs: warm.ms, csvMs: exported.ms, legacy: baseline }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
