/**
 * Utah Walk-in Access (WIA): DWR leases hunting access on private land; hunters need a free annual WIA
 * authorization number. Built offline by scripts/ut_build_walkin.py into data/ut/walkin.json from DWR's public
 * property layer (2026 enrolment). Only leases whose purpose names big game; land already public is subtracted.
 * Like Montana's Block Management Type 1, it fills the slot Idaho uses for Access Yes!.
 */
import data from '../../data/ut/walkin.json';

export interface UtWalkinProperty { id: string; name: string; acres: number; muzzleloaderOnly?: boolean; noElk?: boolean; closure?: string }
export interface UtWalkin { acres: number; pct: number; n: number; species: Record<string, { acres: number; n: number }>; properties: UtWalkinProperty[] }

export const UT_WALKIN_SOURCE = data.source;
export const UT_WALKIN_URL = 'https://wildlife.utah.gov/hunting/walk-in-access.html';
export const UT_WALKIN_AUTH_URL = 'https://wildlife.utah.gov/walkinaccess/authorization';

/** Walk-in Access big-game land in a DWR hunt boundary, or null when there is none. */
export const utWalkin = (boundary: string): UtWalkin | null => (data.boundaries as Record<string, UtWalkin>)[boundary] ?? null;
