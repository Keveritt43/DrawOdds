import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HuntSummary } from '@prisma/client';
import { parseFilters } from '../src/lib/finder';
import { prepareIdahoExport } from '../src/lib/idahoExport';
import { trophyForHunt } from '../src/lib/trophyHunt';

const hunt = { id:'c:1044', state:'ID', species:'DEER', type:'CONTROLLED', huntNumber:1044,
  tagCode:null, oddsLastYear:2026, openDate:new Date('2026-08-15T12:00:00Z'), closeDate:new Date('2026-09-24T12:00:00Z'),
  units:['55','57'], antlerClass:'ANTLERED', weapon:'ANY', tagSeasons:null, pointOdds:null,
  publicPct:52, privatePct:48, huntablePct:53, accessYesPct:1, accessYesCount:1, huntersSqMi:.02,
  scoreQuality:75, scoreAccess:80, scoreCrowd:90, scoreOppRes:30, scoreOppNr:20, scoreTrophy:50,
  nrTag:false, youthOnly:false, privateOnly:false } as unknown as HuntSummary;

test('legacy Idaho export uses verified area and current trophy score', () => {
  const result=prepareIdahoExport(hunt,parseFilters({}),false)!;
  assert.deepEqual(result.units,['55']);
  assert.equal(result.publicPct,52.4); assert.equal(result.huntersSqMi,null); assert.equal(result.scoreQuality,75);
  assert.equal(result.scoreTrophy,trophyForHunt(result));
});
test('legacy Idaho export filters corrected values rather than stale values', () => {
  assert.equal(prepareIdahoExport(hunt,parseFilters({unit:'57'}),false),null);
  assert.notEqual(prepareIdahoExport(hunt,parseFilters({minPublic:'10'}),false),null);
  assert.notEqual(prepareIdahoExport(hunt,parseFilters({minScore:'10'}),false),null);
  assert.equal(prepareIdahoExport(hunt,parseFilters({maxDensity:'1'}),false),null);
  const result=prepareIdahoExport(hunt,parseFilters({unit:'55'}),false)!;
  assert.notEqual(result.scoreTrophy,null);
  assert.equal(prepareIdahoExport(hunt,parseFilters({trophy:String(result.scoreTrophy)}),false)?.id,hunt.id);
  assert.equal(prepareIdahoExport(hunt,parseFilters({trophy:String(result.scoreTrophy===50?80:50)}),false),null);
});
