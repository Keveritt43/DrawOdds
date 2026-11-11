import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MT_BONUS_TYPES, mtBonusInPlay, parseMtForm, readMtPoints } from '../src/lib/mtPoints';

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return [(n: string) => f.get(n), (n: string) => f.has(n)] as const;
};
const full = (over: Record<string, string> = {}) => {
  const e: Record<string, string> = { mtResidency: 'NONRESIDENT', mtCombo: '2' };
  for (const { key } of MT_BONUS_TYPES) { e['mtBonus_' + key] = '0'; e['mtBuy_' + key] = 'on'; }
  return { ...e, ...over };
};

test('no Montana section in the form leaves Montana alone', () => {
  assert.equal(parseMtForm(...form({ idahoResidency: 'RESIDENT' })), null);
});

test('combination preference points are whole and capped at 3', () => {
  assert.equal(typeof parseMtForm(...form(full({ mtCombo: '4' }))), 'string');
  assert.equal(typeof parseMtForm(...form(full({ mtCombo: '1.5' }))), 'string');
  const ok = parseMtForm(...form(full({ mtCombo: '3' })));
  assert.ok(ok && typeof ok === 'object');
  assert.equal(ok.mtCombo, 3);
});

test('each bonus licence type keeps its own balance and buying switch', () => {
  const e = full({ mtBonus_ELK_PERMIT: '7', mtBonus_ANTELOPE: '2' });
  delete e.mtBuy_ANTELOPE; // unchecked checkbox is absent from the form
  const v = parseMtForm(...form(e));
  assert.ok(v && typeof v === 'object');
  assert.equal(v.mtBonus.ELK_PERMIT, 7);
  assert.equal(v.mtBonus.DEER_PERMIT, 0);
  assert.equal(v.mtBuying.ELK_PERMIT, true);
  assert.equal(v.mtBuying.ANTELOPE, false);
});

test('unbought bonus points do not count that year, but are kept', () => {
  const p = readMtPoints({ MT: { res: 'RESIDENT', mtCombo: 0, mtBonus: { ANTELOPE: 5 }, mtBuying: { ANTELOPE: false }, set: true } });
  assert.equal(p.bonus.ANTELOPE, 5);
  assert.equal(mtBonusInPlay(p, 'ANTELOPE'), 0);
  assert.equal(mtBonusInPlay({ ...p, buying: { ...p.buying, ANTELOPE: true } }, 'ANTELOPE'), 5);
});

test('reading an empty or junk store is safe and marks Montana unset', () => {
  const p = readMtPoints({ MT: { mtCombo: 9, mtBonus: { DEER_B: -3 } } });
  assert.equal(p.combo, 3);
  assert.equal(p.bonus.DEER_B, 0);
  assert.equal(p.res, 'NONRESIDENT');
  assert.equal(p.set, false);
  assert.equal(readMtPoints(null).buying.ELK_B, true);
});
