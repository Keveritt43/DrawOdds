import { db } from './db';
import { getCoScoringContext } from './coScoringContext';
import { withCoScores, type CoScored } from './coScores';
import { otcElkOverlap } from './overlappingSeasons';
import { getPointsStore, readState } from './points';
import { readMtPoints } from './mtPoints';
import { readUtPoints } from './utPoints';
import { readOrPoints } from './orPoints';
import { readNvPoints } from './nvPoints';
import { readWaPoints } from './waPoints';
import { readNmSettings } from './nmSettings';
import { getResidency, getState } from './residency';
import { param, preparePublic, runSearch, type SearchParams } from './multiStateSearch';
import { searchStates, wySpecialView } from './searchStates';
import type { StateCode } from './states';

type PublicIndex = { rows: CoScored[]; overlaps: Record<string, boolean | null>; migrations: Partial<Record<string, string[]>> };
// Bounded by enabled states, shared between requests, never contains personal settings.
// Each state is rebuilt from the database at most once every five minutes. Once a state has a
// built index, an expired one keeps serving while the rebuild runs in the background, so no
// visitor waits on it; data only changes through reviewed imports. Failures keep the last good
// index (or, before there is one, are retried on the next request).
type Entry = { expires: number; ready?: PublicIndex; building?: Promise<PublicIndex> };
// On globalThis, not module scope: Next.js bundles src/instrumentation.ts separately from the app routes, so a
// module-level Map gives the startup warm-up its own copy that pages never read (found in the logs, Nov 18).
const shared = globalThis as typeof globalThis & { __drawoddsSearchIndexes?: Map<StateCode, Entry> };
const indexes = (shared.__drawoddsSearchIndexes ??= new Map<StateCode, Entry>());
const INDEX_TTL = 300_000;

async function buildIndex(state: StateCode): Promise<PublicIndex> {
  const started = Date.now();
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
  // Prepare each row's public metrics now, while the previous index still serves, so no search pays for it.
  // In small slices, so a background rebuild never holds up other requests for long.
  for (let i = 0; i < scored.length; i++) {
    preparePublic(scored[i]);
    if (i % 100 === 99) await new Promise(r => setImmediate(r));
  }
  console.log(`[search-index] ${state} rows=${scored.length} ms=${Date.now() - started}`);
  return { rows: scored, overlaps, migrations };
}

function rebuild(state: StateCode, entry: Entry): Promise<PublicIndex> {
  if (entry.building) return entry.building;
  const building = buildIndex(state);
  entry.building = building;
  building.then(index => { entry.ready = index; entry.expires = Date.now() + INDEX_TTL; },
    () => { if (!entry.ready) indexes.delete(state); })
    .finally(() => { if (entry.building === building) entry.building = undefined; });
  return building;
}

export function publicSearchIndex(state: StateCode): Promise<PublicIndex> {
  let entry = indexes.get(state);
  if (!entry) { entry = { expires: 0 }; indexes.set(state, entry); }
  if (entry.ready) {
    if (entry.expires <= Date.now()) rebuild(state, entry).catch(() => { /* keep serving the last good index */ });
    return Promise.resolve(entry.ready);
  }
  return rebuild(state, entry);
}

/** Shared by cards, map aggregates, table and export; resolves residency independently of the header. */
export async function searchHunts(sp: SearchParams) {
  const started = Date.now();
  const header = await getState();
  const states = searchStates(sp.states, header.code);
  const [data, store, id] = await Promise.all([
    Promise.all(states.map(publicSearchIndex)), getPointsStore(), getResidency(undefined, 'ID'),
  ]);
  const wy = readState(store.store, 'WY');
  // a pool preview from the filter rail changes this search only, never the saved setting
  const settings = { ID: id.residency, CO: readState(store.store, 'CO'), WY: { ...wy, wySpecial: wySpecialView(param(sp, 'wyPool'), wy.wySpecial === true) },
    MT: readMtPoints(store.store as Record<string, unknown>), UT: readUtPoints(store.store as Record<string, unknown>), WA: readWaPoints(store.store as Record<string, unknown>), NM: readNmSettings(store.store as Record<string, unknown>),
    OR: readOrPoints(store.store as Record<string, unknown>), NV: readNvPoints(store.store as Record<string, unknown>) };
  const migrations = Object.assign({}, ...data.map(d => d.migrations));
  const overlaps = Object.assign({}, ...data.map(d => d.overlaps));
  const loaded = Date.now();
  const results = runSearch(data.flatMap(d => d.rows), sp, header.code, settings, migrations, overlaps);
  // one line per search, so the next speed-up targets the measured cost rather than a guess
  console.log(`[search] states=${states.join(',')} results=${results.length} loadMs=${loaded - started} searchMs=${Date.now() - loaded}`);
  // rows each selected state has at all, before any filter: Montana's "not in Find Hunts yet" notice keys off this
  const indexed = Object.fromEntries(states.map((s, i) => [s, data[i].rows.length])) as Partial<Record<StateCode, number>>;
  return { header, states, settings, results, overlaps, wySavedSpecial: wy.wySpecial === true, indexed };
}
