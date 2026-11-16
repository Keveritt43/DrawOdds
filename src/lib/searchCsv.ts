import type { SearchResult } from './multiStateSearch';
import { WEAPON, SPECIES_LABEL, range } from './format';
import { huntHref } from './huntSlug';
import { seasonsSummary } from './tagSeasons';
import { wyPresetHarvest } from './wyPresetHarvest';
import { mtHarvestProxy, mtProxyRate } from './mtHarvestProxy';
import { huntWeaponLabel } from './huntWeaponLabel';

// Also prevent agency-supplied names from being interpreted as spreadsheet formulas.
const cell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function searchCsv(results: SearchResult[], origin: string) {
  const percent = (value: number | null) => value === null ? null : Math.round(value * 10000) / 100;
  const rows: unknown[][] = [['State', 'Hunt', 'Code', 'Species', 'Units', 'Weapon', 'Season dates', 'Residency', 'Points', 'Your odds %', 'Odds basis', 'Draw report year', 'Harvest report year', 'Harvest success %', 'Hunter-seasons', 'Harvest small sample', 'WY harvest per active license (not hunter success)', 'MT estimated mule bucks per issued permit % (not hunter success)', 'Public land %', 'Quality', 'Opportunity', 'Trophy score', 'Link']];
  for (const x of results) {
    const wy = x.r.state === 'WY' ? wyPresetHarvest(x.r.pointOdds, x.r.species).map(r => `${r.label}: ${percent(r.rate)}% (${r.first === r.last ? r.first : `${r.first}-${r.last}`}; ${r.years} season${r.years === 1 ? '' : 's'})`).join('; ') : null;
    const mt = x.r.state === 'MT' && x.r.species === 'DEER' && mtHarvestProxy(x.r.pointOdds) === 'permit' ? percent(mtProxyRate(x.r.pointOdds)) : null;
    rows.push([x.r.state, x.r.name, x.r.tagCode ?? x.r.huntNumber, SPECIES_LABEL[x.r.species], x.r.units.join(' '), x.r.state==='UT'?huntWeaponLabel(x.r):WEAPON[x.r.weapon], seasonsSummary(x.r.tagSeasons) || range(x.r.openDate, x.r.closeDate), x.nr ? 'Nonresident' : 'Resident', x.points, percent(x.odds), x.basis, x.r.oddsLastYear, x.r.harvestLastYear, percent(x.r.success5), x.r.hunters5, x.r.success5 === null ? null : x.r.smallSample ? 'Yes' : 'No', wy, mt, x.r.publicPct, x.r.scoreQuality, x.opportunity, x.r.scoreTrophy, origin + huntHref(x.r)]);
  }
  return rows.map(row => row.map(cell).join(',')).join('\n') + '\n';
}
