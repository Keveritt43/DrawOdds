import { enabledStates, STATES, type StateCode } from './states';

export const ID_RESTRICTIONS = ['zone', 'bullObj', 'cowObj', 'migration', 'leftover', 'accessYes', 'minAccessYes', 'minHuntable'];
export const CO_RESTRICTIONS = ['season', 'chance', 'minPts', 'maxPts', 'second', 'hybrid', 'otcElk'];

/** Explicit URL selection wins; the header state supplies the initial selection. */
export function searchStates(value: string | string[] | undefined, fallback: StateCode): StateCode[] {
  const allowed = new Set(enabledStates().map(s => s.code));
  const values = (Array.isArray(value) ? value.join(',') : value ?? '').toUpperCase().split(',');
  const selected = [...new Set(values.filter((s): s is StateCode => allowed.has(s as StateCode)))];
  return selected.length ? selected.sort() : [fallback];
}

export const searchUnitKey = (state: string, unit: string) => `${state}:${unit}`;

export function searchBounds(states: StateCode[]): [[number, number], [number, number]] {
  const boxes = states.map(s => STATES[s].bounds);
  return [[Math.min(...boxes.map(b => b[0][0])), Math.min(...boxes.map(b => b[0][1]))],
    [Math.max(...boxes.map(b => b[1][0])), Math.max(...boxes.map(b => b[1][1]))]];
}
