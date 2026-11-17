import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawAlerts, alertLead, localDay } from '../src/lib/drawDeadlines';

const nrGeneral = (now: Date) => drawAlerts(now).find((a) => a.what.startsWith('Idaho nonresident general') && !a.what.includes('second'));

test('Idaho NR general draw shows as opening soon four weeks out, not before', () => {
  const a = nrGeneral(new Date('2026-11-13T20:00:00Z'));
  assert.ok(a);
  assert.equal(a.open, false);
  assert.equal(a.opensIn, 22);
  assert.equal(alertLead(a), 'Opens in 22 days');
  // Nov 6 is 29 days out: past the 4-week horizon
  assert.equal(nrGeneral(new Date('2026-11-06T18:00:00Z')), undefined);
});

test('open window counts down to the close in Mountain time', () => {
  const a = nrGeneral(new Date('2026-12-05T18:00:00Z'))!;
  assert.equal(a.open, true);
  assert.equal(alertLead(a), 'Open now · 10 days left');
  assert.equal(alertLead(nrGeneral(new Date('2026-12-14T18:00:00Z'))!), 'Open now · 1 day left');
  assert.equal(alertLead(nrGeneral(new Date('2026-12-15T18:00:00Z'))!), 'Open now · Closes today');
  // 11 pm Mountain on Dec 15 is already Dec 16 in UTC: still open, closes today
  assert.equal(alertLead(nrGeneral(new Date('2026-12-16T06:00:00Z'))!), 'Open now · Closes today');
  // the next morning it is gone
  assert.equal(nrGeneral(new Date('2026-12-16T15:00:00Z')), undefined);
});

test('open windows come before upcoming ones', () => {
  const xs = drawAlerts(new Date('2027-01-20T18:00:00Z'));
  // Feb 5 second period is 16 days out; nothing open
  assert.ok(xs.length >= 1 && xs.every((x) => !x.open));
  assert.ok(xs[0].what.includes('second application period'));
});

test('localDay uses the agency calendar, not UTC', () => {
  assert.equal(localDay(new Date('2026-12-16T05:00:00Z'), 'America/Denver').toISOString().slice(0, 10), '2026-12-15');
});
