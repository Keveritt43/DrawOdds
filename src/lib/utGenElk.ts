/**
 * General-season bull elk success and crowding for a Utah hunt boundary. DWR reports general elk harvest by elk
 * unit / subunit, not by hunt boundary; scripts/ut_build_gen_elk.py gives each boundary the numbers of the smallest
 * reported unit covering at least 80% of it, 2021-2024 (youth and extended-archery tables left out). Unit hunter
 * counts overlap (a hunter counts in every unit hunted), so these are rates for the ground, not additive totals.
 */
import data from '../../data/ut/general-elk-boundaries.json';

export interface UtGenElk { years: number[]; hunters: number; harvest: number; success: number; huntersPerYear: number; huntersSqMi: number; units: string[] }

export const utGenElk = (boundary: string): UtGenElk | null => (data.boundaries as Record<string, UtGenElk>)[boundary] ?? null;
