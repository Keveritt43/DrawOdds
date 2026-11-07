import type { HuntSummary } from '@prisma/client';
import type { HarvestYear } from './coHunt';
import type { TagSeason } from './tagSeasons';
import catalog from '../../data/co-special-reports.json';

export type SpecialSpecies = 'MOOSE' | 'GOAT' | 'BIGHORN' | 'DESERT';
export type SpecialDraw = {
  year: number; quota: number | null; issued: number | null;
  apps: number[]; drew: number[]; shared?: string[]; page: number;
};
export type SpecialPopulation = { unit: string; name: string | null; year: number; estimate: number; ratio?: number };
export type SpecialHunt = {
  code: string; species: SpecialSpecies; units: string[]; seasons: TagSeason[];
  draws: SpecialDraw[]; harvest: HarvestYear[]; population: SpecialPopulation[];
  brochurePage: number | null; notes: string | null;
};
export const SPECIAL_LABEL: Record<SpecialSpecies, string> = {
  MOOSE: 'Moose', GOAT: 'Mountain Goat', BIGHORN: 'Rocky Mountain Bighorn Sheep', DESERT: 'Desert Bighorn Sheep',
};
export const SPECIAL_REPORTS = catalog as { species: SpecialSpecies; year: number; kind: string; url: string }[];
export const SPECIAL_REPORT_LABELS: Record<string, string> = {
  draw: 'Draw Recap', 'drawn-out': 'Drawn Out At', harvest: 'Harvest', population: 'Population Estimates', regs: 'Hunting Brochure',
};
export function coSpecial(row: Pick<HuntSummary, 'state' | 'pointOdds'>): SpecialHunt | null {
  if (row.state !== 'CO') return null;
  return (row.pointOdds as { special?: SpecialHunt } | null)?.special ?? null;
}
export function specialCounts(draw: SpecialDraw, nr: boolean, youth: boolean) {
  const i = (nr ? 1 : 0) + (youth ? 2 : 0);
  return { apps: draw.apps[i], drew: draw.drew[i] };
}
/** The published cohort's actual rate, including applicants with any number of points. */
export function specialOdds(hunt: SpecialHunt, nr: boolean, youth: boolean): number | null {
  if (hunt.code[5] === 'G') return null; // reserved license, not available in the public draw
  const { apps, drew } = specialCounts(hunt.draws[0], nr, youth);
  return apps ? drew / apps : null;
}
export function specialBrochure(species: SpecialSpecies) {
  return SPECIAL_REPORTS.find(r => r.kind === 'regs' && r.species === (species === 'MOOSE' ? 'MOOSE' : 'BIGHORN'))!.url;
}
export const CO_SPECIAL_GIS = 'https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/ArcGIS/rest/services/CPWAdminData/FeatureServer';
