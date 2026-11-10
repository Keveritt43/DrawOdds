import { db } from './db';
import { getCoScoringContext } from './coScoringContext';
import { withCoScores, type CoScored } from './coScores';
import { otcElkOverlap } from './overlappingSeasons';
import { getPointsStore, readState } from './points';
import { getResidency, getState } from './residency';
import { param, runSearch, type SearchParams } from './multiStateSearch';
import { searchStates, wySpecialView } from './searchStates';
import type { StateCode } from './states';

type PublicIndex = { rows: CoScored[]; overlaps: Record<string, boolean | null>; migrations: Partial<Record<string, string[]>> };
// Bounded by enabled states, shared between requests, never contains personal settings.
// Rebuild at most once every five minutes per state; failures are immediately retryable.
const indexes = new Map<StateCode, { expires: number; promise: Promise<PublicIndex> }>();
export function publicSearchIndex(state: StateCode): Promise<PublicIndex> {
  const previous = indexes.get(state);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const promise = (async () => {
    const [rows, context, studies] = await Promise.all([
      db.huntSummary.findMany({ where: { state } }),
      state === 'CO' ? getCoScoringContext() : Promise.resolve(undefined),
      state === 'ID' ? db.migrationStudy.findMany({ where: { state }, select: { species: true, units: true } }) : Promise.resolve([]),
    ]);
    const migrations: PublicIndex['migrations'] = {};
    for (const study of studies) migrations[study.species] = [...new Set([...(migrations[study.species] ?? []), ...study.units])];
    const overlaps: PublicIndex['overlaps'] = {};
    const scored = rows.map(r => {
      if (context && r.species === 'DEER') overlaps[r.id] = otcElkOverlap(r, context.generalElk);
      return state === 'CO' ? withCoScores(r, context) : r;
    });
    return { rows: scored, overlaps, migrations };
  })();
  const entry = { expires: Date.now() + 300_000, promise };
  indexes.set(state, entry);
  promise.catch(() => { if (indexes.get(state) === entry) indexes.delete(state); });
  return promise;
}

/** Shared by cards, map aggregates, table and export; resolves residency independently of the header. */
export async function searchHunts(sp: SearchParams) {
  const header = await getState();
  const states = searchStates(sp.states, header.code);
  const [data, store, id] = await Promise.all([
    Promise.all(states.map(publicSearchIndex)), getPointsStore(), getResidency(undefined, 'ID'),
  ]);
  const wy = readState(store.store, 'WY');
  // a pool preview from the filter rail changes this search only, never the saved setting
  const settings = { ID: id.residency, CO: readState(store.store, 'CO'), WY: { ...wy, wySpecial: wySpecialView(param(sp, 'wyPool'), wy.wySpecial === true) } };
  const migrations = Object.assign({}, ...data.map(d => d.migrations));
  const overlaps = Object.assign({}, ...data.map(d => d.overlaps));
  const results = runSearch(data.flatMap(d => d.rows), sp, header.code, settings, migrations, overlaps);
  return { header, states, settings, results, overlaps, wySavedSpecial: wy.wySpecial === true };
}
