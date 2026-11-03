import { ELK_ZONES } from './elkZones';

/**
 * Elk population status against IDFG's objectives, by elk zone: "2026 Elk Population Status by Elk Zone",
 * Idaho Big Game 2026 Seasons & Rules, p. 34 (bull and cow maps). Read from the maps by hand: update each year.
 * Owyhee, South Hills, Big Desert, Snake River and Bannock have no numeric objective; in the Panhandle only
 * units 1 and 6 do.
 */
export type ObjStatus = 'BELOW' | 'WITHIN' | 'ABOVE';
export const OBJ_YEAR = 2026;
export const OBJ_SOURCE = 'IDFG Idaho Big Game 2026 Seasons & Rules, p. 34';

const ZONE_OBJ: Record<string, { bull: ObjStatus; cow: ObjStatus }> = {
  'Palouse': { bull: 'WITHIN', cow: 'BELOW' },
  'Lolo': { bull: 'BELOW', cow: 'BELOW' },
  'Dworshak': { bull: 'BELOW', cow: 'BELOW' },
  'Hells Canyon': { bull: 'ABOVE', cow: 'WITHIN' },
  'Elk City': { bull: 'BELOW', cow: 'BELOW' },
  'Selway': { bull: 'BELOW', cow: 'BELOW' },
  'Middle Fork': { bull: 'WITHIN', cow: 'BELOW' },
  'Salmon': { bull: 'WITHIN', cow: 'WITHIN' },
  'Weiser River': { bull: 'ABOVE', cow: 'ABOVE' },
  'McCall': { bull: 'ABOVE', cow: 'WITHIN' },
  'Lemhi': { bull: 'ABOVE', cow: 'ABOVE' },
  'Beaverhead': { bull: 'ABOVE', cow: 'ABOVE' },
  'Brownlee': { bull: 'ABOVE', cow: 'ABOVE' },
  'Sawtooth': { bull: 'BELOW', cow: 'BELOW' },
  'Pioneer': { bull: 'ABOVE', cow: 'WITHIN' },
  'Boise River': { bull: 'ABOVE', cow: 'ABOVE' },
  'Smoky-Bennett': { bull: 'ABOVE', cow: 'BELOW' },
  'Island Park': { bull: 'ABOVE', cow: 'ABOVE' },
  'Palisades': { bull: 'ABOVE', cow: 'ABOVE' },
  'Tex Creek': { bull: 'ABOVE', cow: 'WITHIN' },
  'Bear River': { bull: 'ABOVE', cow: 'WITHIN' },
  'Diamond Creek': { bull: 'WITHIN', cow: 'WITHIN' },
};
/** Panhandle: objectives set in 2 of its 9 units */
const UNIT_OBJ: Record<string, { bull: ObjStatus; cow: ObjStatus }> = {
  '1': { bull: 'WITHIN', cow: 'WITHIN' },
  '6': { bull: 'WITHIN', cow: 'WITHIN' },
};

const ZONE_OF = new Map(Object.entries(ELK_ZONES).flatMap(([z, us]) => us.map((u) => [u, z] as const)));

export interface UnitObjective { zone: string | null; bull: ObjStatus | null; cow: ObjStatus | null }

export function unitObjective(unit: string): UnitObjective {
  const u = unit.toUpperCase();
  const zone = ZONE_OF.get(u) ?? null;
  const o = UNIT_OBJ[u] ?? (zone ? ZONE_OBJ[zone] : undefined);
  return { zone, bull: o?.bull ?? null, cow: o?.cow ?? null };
}

/** Units whose bull (or cow) status is one of `statuses`. */
export function unitsWithObjective(kind: 'bull' | 'cow', statuses: ObjStatus[]): string[] {
  return [...ZONE_OF.keys()].filter((u) => {
    const s = unitObjective(u)[kind];
    return s !== null && statuses.includes(s);
  });
}

export const OBJ_LABEL: Record<ObjStatus, string> = { BELOW: 'Below objective', WITHIN: 'Within objective', ABOVE: 'Above objective' };
export const OBJ_NUM: Record<ObjStatus, number> = { BELOW: 0, WITHIN: 1, ABOVE: 2 };
/** For a hunter: above objective = more elk than IDFG's target (often more tags, extra cow hunts); below = fewer. */
export const OBJ_COLOR: Record<ObjStatus, string> = { BELOW: '#e0603f', WITHIN: '#b9dd80', ABOVE: '#1a9850' };

/** One line for an elk hunt over several units: the statuses its units carry ("Below" or "Below / Within"). */
export function objectiveSummary(units: string[]): { bull: ObjStatus[]; cow: ObjStatus[]; zones: string[] } {
  const os = units.map(unitObjective);
  const uniq = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
  const order = (xs: ObjStatus[]) => xs.sort((a, b) => OBJ_NUM[a] - OBJ_NUM[b]);
  return { bull: order(uniq(os.map((o) => o.bull))), cow: order(uniq(os.map((o) => o.cow))), zones: uniq(os.map((o) => o.zone)) };
}
