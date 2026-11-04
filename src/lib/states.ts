/**
 * Every state the site covers, and what each one has. Pages and filters ask this registry ("does this state have
 * elk zones?") instead of assuming Idaho, so adding a state is mostly data plus one entry here.
 * Client-safe (no database). See docs/multi-state.md for the plan.
 */
import type { Draw, SpeciesKey } from './species';

export type StateCode = 'ID';

export interface StateFeatures {
  /** Elk zones grouping units, with zone A/B tags (Idaho). */
  elkZones: boolean;
  /** Nonresident general deer/elk tags are drawn, not sold over the counter. */
  nrGeneralTagDraw: boolean;
  /** Elk population objectives by unit (bulls/cows below, within, above). */
  elkObjectives: boolean;
  /** Migration studies loaded for this state. */
  migration: boolean;
  /** Leftover / second-drawing tags tracked. */
  leftovers: boolean;
  /** Controlled hunts drawn in their own hunt areas for these species (not units). */
  areaSpecies: SpeciesKey[];
}

export interface StateConfig {
  code: StateCode;
  name: string;
  /** URL segment once routes are state-prefixed: /idaho/... */
  slug: string;
  enabled: boolean;
  agency: { short: string; name: string; url: string };
  /** Hunting-on-private-land access program, if any ("Access Yes!"). */
  accessProgram: string | null;
  /** How draws reward past applications: Idaho has none (a fresh random draw every year). */
  points: 'none' | 'preference' | 'bonus' | 'hybrid';
  /** Separate drawings an applicant chooses between (Idaho: deer/elk/pronghorn or moose/sheep/goat). */
  draws: { key: Draw; label: string; species: SpeciesKey[] }[];
  species: SpeciesKey[];
  /** Map framing: [[west, south], [east, north]]. */
  bounds: [[number, number], [number, number]];
  features: StateFeatures;
}

export const STATES: Record<StateCode, StateConfig> = {
  ID: {
    code: 'ID',
    name: 'Idaho',
    slug: 'idaho',
    enabled: true,
    agency: { short: 'IDFG', name: 'Idaho Department of Fish and Game', url: 'https://idfg.idaho.gov/hunt' },
    accessProgram: 'Access Yes!',
    points: 'none',
    draws: [
      { key: 'DEP', label: 'Deer · Elk · Pronghorn', species: ['DEER', 'ELK', 'PRONGHORN'] },
      { key: 'MSG', label: 'Moose · Sheep · Goat', species: ['MOOSE', 'BIGHORN', 'GOAT'] },
    ],
    species: ['DEER', 'ELK', 'PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'],
    bounds: [[-117.3, 41.95], [-111.0, 49.05]],
    features: { elkZones: true, nrGeneralTagDraw: true, elkObjectives: true, migration: true, leftovers: true, areaSpecies: ['PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'] },
  },
};

export const DEFAULT_STATE: StateCode = 'ID';
export const STATE_COOKIE = 'state';
export const enabledStates = () => Object.values(STATES).filter((s) => s.enabled);
export const stateConfig = (code?: string | null): StateConfig => {
  const c = (code ?? '').toUpperCase() as StateCode;
  return STATES[c]?.enabled ? STATES[c] : STATES[DEFAULT_STATE];
};

/**
 * A unit's address in URLs and favorites. Idaho keeps its bare names ("39", "36A") so old links work; other states
 * get a prefix ("co-70"), because Colorado has a unit 70 too.
 */
export const unitKey = (state: string, name: string) => (state === 'ID' ? name : `${state.toLowerCase()}-${name}`);
export function parseUnitKey(key: string): { state: StateCode; name: string } {
  const m = /^([a-z]{2})-(.+)$/i.exec(key);
  const code = m?.[1].toUpperCase() as StateCode | undefined;
  if (m && code && code in STATES) return { state: code, name: m[2] };
  return { state: 'ID', name: key };
}
