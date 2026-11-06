import type { SearchResult } from './multiStateSearch';
import { WEAPON, SPECIES_LABEL, range } from './format';
import { huntHref } from './huntSlug';
import { seasonsSummary } from './tagSeasons';

// Also prevent agency-supplied names from being interpreted as spreadsheet formulas.
const cell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function searchCsv(results: SearchResult[], origin: string) {
  const percent = (value: number | null) => value === null ? null : Math.round(value * 10000) / 100;
  const rows: unknown[][] = [['State', 'Hunt', 'Code', 'Species', 'Units', 'Weapon', 'Season dates', 'Residency', 'Points', 'Your odds %', 'Odds basis', 'Draw report year', 'Harvest report year', 'Harvest success %', 'Public land %', 'Quality', 'Opportunity', 'Link']];
  for (const x of results) rows.push([x.r.state, x.r.name, x.r.tagCode ?? x.r.huntNumber, SPECIES_LABEL[x.r.species], x.r.units.join(' '), WEAPON[x.r.weapon], seasonsSummary(x.r.tagSeasons) || range(x.r.openDate, x.r.closeDate), x.nr ? 'Nonresident' : 'Resident', x.points, percent(x.odds), x.basis, x.r.oddsLastYear, x.r.harvestLastYear, percent(x.r.success5), x.r.publicPct, x.r.scoreQuality, x.opportunity, origin + huntHref(x.r)]);
  return rows.map(row => row.map(cell).join(',')).join('\n') + '\n';
}
