/**
 * Federally designated wilderness inside Wyoming hunt areas (data/wy/wilderness.json, built by
 * scripts/wy_build_wilderness.mjs). Used for the nonresident guide rule, W.S. 23-2-401(a): a nonresident may not
 * hunt big or trophy game on a designated wilderness area in Wyoming unless a licensed professional guide or a
 * resident guide goes along (at least one guide per two nonresident hunters). The rule follows the wilderness
 * boundary, not the hunt area: the share tells a hunter how much of the area it touches, nothing more.
 *
 * Read at render time so production Wyoming rows are not rewritten. Overlaps under SLIVER_ACRES per wilderness are
 * boundary slivers from generalized map boundaries and are not listed (see the build script).
 */
import data from '../../data/wy/wilderness.json';

export interface WyWildernessArea { pct: number; wildAcres: number; acres: number; wilderness: { name: string; acres: number }[] }

const AREAS = data.areas as Record<string, WyWildernessArea>;

/** Wilderness inside one Wyoming hunt area ("E60"), or null when the area has none. */
export function wyWilderness(unit: string): WyWildernessArea | null {
  return AREAS[unit] ?? null;
}

/** "Teton" from "Teton Wilderness". */
export const wildernessShort = (name: string) => name.replace(/ Wilderness$/, '');

/** Hunt areas of a license that contain wilderness, largest share first. */
export function wyHuntWilderness(units: string[]): { unit: string; area: WyWildernessArea }[] {
  return units.flatMap((unit) => {
    const area = wyWilderness(unit);
    return area ? [{ unit, area }] : [];
  }).sort((a, b) => b.area.pct - a.area.pct);
}

/** Share shown to hunters: whole percent, "<1%" for a real but small overlap. */
export function wildernessPctLabel(pct: number): string {
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

export const WY_WILDERNESS_SOURCE = { retrieved: data.retrieved, source: data.source };
