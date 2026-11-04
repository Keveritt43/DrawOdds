/**
 * CPW post-hunt population and sex ratio estimates: one page, one row per herd (data analysis unit, DAU) with the
 * game management units it covered that year, the estimate and males per 100 females.
 * Columns found by the header's positions; the herd name column only exists in some years.
 */
import type { Item } from './recap';
import { rowsOf } from './recap';

export interface HerdEstimate { dau: string; name: string | null; units: string[]; estimate: number; ratio: number | null }

export function parsePopulation(pages: Item[][]): { year: number | null; species: string | null; herds: HerdEstimate[]; total: number | null } {
  const herds: HerdEstimate[] = [];
  let year: number | null = null, species: string | null = null, total: number | null = null;
  for (const items of pages) {
    const rows = rowsOf(items);
    const all = rows.map((r) => r.map((i) => i.s.trim()).join(' ')).join(' ');
    const ym = /(20\d\d)\s+POST\s+HUNT\s+POPULATION/i.exec(all);
    if (ym) year = Number(ym[1]);
    const sm = /\b(DEER|ELK|PRONGHORN|MOOSE)\b/i.exec(all);
    if (sm && !species) species = sm[1].toUpperCase();
    const unitsHead = items.find((i) => /GAME MANAGEMENT UNITS/i.test(i.s));
    const estHead = items.find((i) => /^Estimate$/i.test(i.s.trim()));
    if (!unitsHead || !estHead) continue;
    for (const r of rows) {
      const first = r[0]?.s.trim() ?? '';
      const text = r.map((i) => i.s.trim()).join(' ');
      const tot = /Total Statewide Estimate\s+([\d,]+)/i.exec(text);
      if (tot) { total = Number(tot[1].replace(/,/g, '')); continue; }
      const dm = /^(\d{1,3})\**$/.exec(first);
      if (!dm || r[0].x > unitsHead.x - 20) continue;
      // estimate: the number under "Estimate"; ratio: the last number after it
      const nums = r.filter((i) => i.x >= estHead.x - 30 && /^[\d,]+$/.test(i.s.trim()));
      if (!nums.length) continue;
      const est = Number(nums[0].s.trim().replace(/,/g, ''));
      const ratio = nums.length > 1 ? Number(nums[nums.length - 1].s.trim().replace(/,/g, '')) : null;
      const unitText = r.filter((i) => i.x >= unitsHead.x - 6 && i.x < estHead.x - 30).map((i) => i.s.trim()).join(' ');
      const name = r.filter((i) => i !== r[0] && i.x < unitsHead.x - 6).map((i) => i.s.trim()).join(' ').trim() || null;
      const units = [...unitText.matchAll(/\b(\d{1,3})\b/g)].map((m) => String(Number(m[1])));
      if (!units.length || !Number.isFinite(est)) continue;
      herds.push({ dau: String(Number(dm[1])), name, units: [...new Set(units)], estimate: est, ratio });
    }
  }
  return { year, species, herds, total };
}

