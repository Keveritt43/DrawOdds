import { decodeCode, matchesCoSeason } from './coHunt';
export const CO_METHODS = [['R', 'Rifle'], ['A', 'Archery'], ['M', 'Muzzleloader']] as const;
export const CO_SEASONS = [['1', '1st rifle'], ['2', '2nd rifle'], ['3', '3rd rifle'], ['4', '4th rifle'], ['E', 'Early'], ['L', 'Late'], ['K', 'Youth only']] as const;
export function matchesCoMapFilters(code: string | null, methods: string[], seasons: string[]) {
  const d = decodeCode(code ?? '');
  return !!d && (!methods.length || methods.includes(d.method)) && matchesCoSeason(code ?? '', seasons);
}
