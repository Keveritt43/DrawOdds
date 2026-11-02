import type { HuntSummary } from '@prisma/client';

const WEAPON_ORDER = ['ANY', 'ARCHERY', 'MUZZLELOADER', 'SHORT_RANGE', 'OTHER'];
const SPECIES_NAME = { DEER: 'Deer', ELK: 'Elk' } as const;
const WEAPON_SHORT: Record<string, string> = { ANY: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader', SHORT_RANGE: 'Short Range', OTHER: 'Other' };

type Row = Pick<HuntSummary, 'type' | 'species' | 'weapon' | 'huntNumber' | 'name' | 'openDate'>;

/** A unit's hunts: general seasons first (deer, elk; any weapon, archery, muzzleloader), then controlled by number. */
export function sortUnitHunts<T extends Row>(rows: T[]): T[] {
  return rows.slice().sort((a, b) =>
    (a.type === 'GENERAL' ? 0 : 1) - (b.type === 'GENERAL' ? 0 : 1) ||
    a.species.localeCompare(b.species) ||
    (a.type === 'GENERAL'
      ? WEAPON_ORDER.indexOf(a.weapon) - WEAPON_ORDER.indexOf(b.weapon) || a.name.localeCompare(b.name)
      : (a.huntNumber ?? 0) - (b.huntNumber ?? 0)),
  );
}

/** Short name inside a unit's context: "General Deer · Archery", "Elk 2011". */
export function unitHuntLabel(h: Row): string {
  if (h.type === 'CONTROLLED') return h.huntNumber ? `${SPECIES_NAME[h.species]} ${h.huntNumber}` : h.name;
  if (/general/i.test(h.name)) return `General ${SPECIES_NAME[h.species]} · ${WEAPON_SHORT[h.weapon] ?? h.weapon}`;
  return `General ${SPECIES_NAME[h.species]} · ${h.name}`; // e.g. a general antlerless tag named for its units
}
