/**
 * Every state the site covers, and what each one has. Pages and filters ask this registry ("does this state have
 * elk zones?") instead of assuming Idaho, so adding a state is mostly data plus one entry here.
 * Client-safe (no database). See docs/multi-state.md for the plan.
 */
import type { Draw, SpeciesKey } from './species';

export type StateCode = 'ID' | 'CO' | 'WY' | 'MT';

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
  /** Listed in the state picker. An unlisted state still works by link (/api/state?code=co) for previews. */
  enabled: boolean;
  agency: { short: string; name: string; url: string };
  /** Hunting-on-private-land access program, if any ("Access Yes!"). */
  accessProgram: string | null;
  /**
   * Required for every state: which licenses count as private-land-only (landowner permission needed), in plain words
   * and with the agency source. The shared "Private-Land-Only Hunts" filter hides them by default in every state; a new
   * state must set HuntSummary.privateOnly (or a documented read-time rule, see src/lib/privateLand.ts) before launch.
   */
  privateLandOnly: string;
  /** How draws reward past applications: Idaho has none (a fresh random draw every year). */
  points: 'none' | 'preference' | 'bonus' | 'hybrid' | 'preference-random';
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
    privateLandOnly: 'controlled hunts IDFG lists as "Private land only" in the 2026 Seasons & Rules (deer, elk, pronghorn)',
    points: 'none',
    draws: [
      { key: 'DEP', label: 'Deer · Elk · Pronghorn', species: ['DEER', 'ELK', 'PRONGHORN'] },
      { key: 'MSG', label: 'Moose · Sheep · Goat', species: ['MOOSE', 'BIGHORN', 'GOAT'] },
    ],
    species: ['DEER', 'ELK', 'PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'],
    bounds: [[-117.3, 41.95], [-111.0, 49.05]],
    features: { elkZones: true, nrGeneralTagDraw: true, elkObjectives: true, migration: true, leftovers: true, areaSpecies: ['PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'] },
  },
  CO: {
    code: 'CO',
    name: 'Colorado',
    slug: 'colorado',
    enabled: true,
    agency: { short: 'CPW', name: 'Colorado Parks and Wildlife', url: 'https://cpw.state.co.us/activities/hunting/big-game' },
    accessProgram: null,
    privateLandOnly: 'private-land-only and Ranching for Wildlife licenses (CPW hunt codes with P, W or J)',
    points: 'preference',
    draws: [
      { key: 'DEP', label: 'Deer · Elk · Pronghorn', species: ['DEER', 'ELK', 'PRONGHORN'] },
      { key: 'MSG', label: 'Moose · Sheep · Goat', species: ['MOOSE', 'BIGHORN', 'GOAT'] },
    ],
    species: ['DEER', 'ELK', 'PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'],
    bounds: [[-109.06, 36.99], [-102.04, 41.0]],
    features: { elkZones: false, nrGeneralTagDraw: false, elkObjectives: false, migration: false, leftovers: false, areaSpecies: [] },
  },
  WY: {
    code: 'WY',
    name: 'Wyoming',
    slug: 'wyoming',
    enabled: true,
    agency: { short: 'WGFD', name: 'Wyoming Game and Fish Department', url: 'https://wgfd.wyo.gov/hunting-trapping' },
    // WGFD's Access Yes program funds Walk-In Hunting Areas and Hunter Management Areas (mostly private land)
    accessProgram: 'Access Yes',
    privateLandOnly: 'licenses WGFD limits to private land for the whole season (2026 regulations)',
    // nonresidents: preference draw (75%) then random draw (25%), regular and special pools; residents: random only
    points: 'preference-random',
    draws: [{ key: 'DEP', label: 'Deer · Elk · Pronghorn', species: ['DEER', 'ELK', 'PRONGHORN'] }],
    species: ['DEER', 'ELK', 'PRONGHORN'],
    bounds: [[-111.06, 40.99], [-104.05, 45.01]],
    // hunt areas differ by species: units are stored per species ("A1" antelope, "D1" deer, "E1" elk)
    features: { elkZones: false, nrGeneralTagDraw: true, elkObjectives: false, migration: false, leftovers: false, areaSpecies: [] },
  },
  MT: {
    code: 'MT',
    name: 'Montana',
    slug: 'montana',
    // In the state picker, but it contributes no rows to Find Hunts: only the statewide nonresident combination
    // draw is modelled so far (/montana). The home panel and a Find Hunts notice say so rather than leaving a
    // hunter at an empty result set. See src/components/MtHome.tsx.
    enabled: true,
    agency: { short: 'FWP', name: 'Montana Fish, Wildlife & Parks', url: 'https://fwp.mt.gov/hunt' },
    // FWP's Block Management opens private land to public hunting; not modelled yet, so not claimed here.
    accessProgram: null,
    privateLandOnly: 'not yet determined — the 2025 regulations district tables have not been parsed (docs/states/mt-onboarding.md §6)',
    // Nonresident combination licenses: 75% by preference points (capped at 3), 25% random among ZERO-point
    // applicants only, so anyone above zero and below the cutoff draws at 0%. Permits and B licenses use a
    // separate uncapped squared bonus-point system that is not modelled. See src/lib/mtOdds.ts.
    points: 'preference-random',
    draws: [{ key: 'DEP', label: 'Deer · Elk', species: ['DEER', 'ELK'] }],
    species: ['DEER', 'ELK'],
    bounds: [[-116.05, 44.35], [-104.04, 49.01]],
    features: { elkZones: false, nrGeneralTagDraw: true, elkObjectives: false, migration: false, leftovers: false, areaSpecies: [] },
  },
};

export const DEFAULT_STATE: StateCode = 'ID';
export const STATE_COOKIE = 'state';
export const enabledStates = () => Object.values(STATES).filter((s) => s.enabled);
/** Any known state (unlisted ones too: they're reached by link); unknown codes fall back to Idaho. */
export const stateConfig = (code?: string | null): StateConfig => {
  const c = (code ?? '').toUpperCase() as StateCode;
  return STATES[c] ?? STATES[DEFAULT_STATE];
};
/** Species that use preference points in a state's draw (point tracker rows). */
export const POINT_SPECIES: Partial<Record<StateCode, ('DEER' | 'ELK' | 'PRONGHORN')[]>> = { CO: ['DEER', 'ELK', 'PRONGHORN'], WY: ['DEER', 'ELK', 'PRONGHORN'] };
export const SPECIAL_POINT_SPECIES = ['MOOSE', 'BIGHORN', 'GOAT'] as const;
export type SpecialPointSpecies = typeof SPECIAL_POINT_SPECIES[number];

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
