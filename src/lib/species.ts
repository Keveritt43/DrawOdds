/**
 * Idaho runs two separate controlled-hunt drawings each year, and an applicant picks ONE:
 *  - Deer, elk, pronghorn (applications May 1 - June 5)
 *  - Moose, bighorn sheep, mountain goat (April 1 - 30; one of the three species only, and applying bars you from
 *    the deer / elk / pronghorn controlled drawings that year, apart from leftover / second-period tags)
 * The site shows one drawing at a time.
 */
export type Draw = 'DEP' | 'MSG';
export type SpeciesKey = 'DEER' | 'ELK' | 'PRONGHORN' | 'MOOSE' | 'BIGHORN' | 'GOAT';

export const DRAW_SPECIES: Record<Draw, SpeciesKey[]> = {
  DEP: ['DEER', 'ELK', 'PRONGHORN'],
  MSG: ['MOOSE', 'BIGHORN', 'GOAT'],
};
export const DRAW_LABEL: Record<Draw, string> = { DEP: 'Deer · Elk · Pronghorn', MSG: 'Moose · Sheep · Goat' };
export const DRAW_SHORT: Record<Draw, string> = { DEP: 'Deer/Elk/Pronghorn', MSG: 'Moose/Sheep/Goat' };
export const drawOf = (sp: string): Draw => (DRAW_SPECIES.MSG.includes(sp as SpeciesKey) ? 'MSG' : 'DEP');

/** Species hunted in their own controlled-hunt areas (not units): maps draw those areas. */
export const AREA_SPECIES: SpeciesKey[] = ['PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'];
/** Species with general (over-the-counter / nonresident general tag) seasons. */
export const GENERAL_SPECIES: SpeciesKey[] = ['DEER', 'ELK'];

/** The trophy number IDFG reports for moose, sheep and goat harvest. */
export const SIZE_LABEL: Partial<Record<SpeciesKey, string>> = { MOOSE: 'Avg antler spread', BIGHORN: 'Avg horn length', GOAT: 'Avg horn length' };
