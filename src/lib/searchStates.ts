import { drawOf, type Draw } from './species';
import { enabledStates, STATES, type StateCode } from './states';

export const ID_RESTRICTIONS = ['zone', 'bullObj', 'cowObj', 'migration', 'leftover', 'accessYes', 'minAccessYes', 'minHuntable', 'deerType', 'minBig'];
export const CO_RESTRICTIONS = ['season', 'chance', 'minPts', 'maxPts', 'second', 'hybrid', 'otcElk'];
export const WY_RESTRICTIONS = ['wyMaxPts', 'wyPool', 'wyWild'];

/** Wyoming nonresident pool to show in search: `wyPool=nr|nrs` previews the other pool without changing the saved
 *  Account setting; anything else falls back to it. */
export function wySpecialView(value: string | undefined, saved: boolean): boolean {
  return value === 'nrs' ? true : value === 'nr' ? false : saved;
}

/** Explicit URL selection wins; the header state supplies the initial selection. */
export function searchStates(value: string | string[] | undefined, fallback: StateCode): StateCode[] {
  const allowed = new Set(enabledStates().map(s => s.code));
  const values = (Array.isArray(value) ? value.join(',') : value ?? '').toUpperCase().split(',');
  const selected = [...new Set(values.filter((s): s is StateCode => allowed.has(s as StateCode)))];
  return selected.length ? selected.sort() : [fallback];
}

export const searchUnitKey = (state: string, unit: string) => `${state}:${unit}`;
/** Keep state-qualified keys in filters; only the displayed unit label is bare. */
export const searchUnitLabel = (key: string) => key.replace(/^[A-Z]{2}:/, '');

export function searchBounds(states: StateCode[]): [[number, number], [number, number]] {
  const boxes = states.map(s => STATES[s].bounds);
  return [[Math.min(...boxes.map(b => b[0][0])), Math.min(...boxes.map(b => b[0][1]))],
    [Math.max(...boxes.map(b => b[1][0])), Math.max(...boxes.map(b => b[1][1]))]];
}

/** A linked species takes precedence over a stale group in a saved search. */
export function searchDraw(draw: string | null | undefined, species?: string | null): Draw {
  if (species && ['DEER','ELK','PRONGHORN','MOOSE','BIGHORN','GOAT'].includes(species.toUpperCase())) return drawOf(species.toUpperCase());
  return draw?.toUpperCase() === 'MSG' ? 'MSG' : 'DEP';
}
