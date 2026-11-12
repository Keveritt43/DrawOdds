import harvestData from '../../data/mt/harvest.json';
import type { YearPoint } from './history';
import type { MtPointOdds } from './mtHunt';

/**
 * Chart series for Montana pages, in the shape Idaho's charts take (src/components/Charts.tsx YearPoint), so a
 * Montana hunt or district reads like an Idaho one.
 *
 * Harvest rows come from the hunt's own `pointOdds.harvest` (the seasons the hunt uses: surveyed, unchanged
 * district). For deer, the mule/whitetail split of those same seasons and districts is read from FWP's species
 * estimates in data/mt/harvest.json; a season either species is missing for gets no split rather than a guess.
 */
type Row = { year: number; hunters: number; harvest: number; antlered?: number; big?: number };
type HRow = { year: number; hunters: number; harvest: number; antlered: number; big?: number };
const H = harvestData as unknown as { species: Record<string, { districts: Record<string, HRow[]> }> };

/** "A701N" -> "701"; deer/elk district names pass through. Elk portions ("391N") are FWP's own rows. */
const district = (u: string) => u.replace(/^A/, '').replace(/^(\d{3})[NS]$/, '$1');

function speciesTotal(sp: string, units: string[], year: number): number | null {
  let t = 0;
  for (const u of new Set(units.map(district))) {
    const r = H.species[sp]?.districts[u]?.find((x) => x.year === year && x.hunters);
    if (!r) return null;
    t += r.harvest;
  }
  return t;
}

export function mtHarvestSeries(po: MtPointOdds | null | undefined, species: string, units: string[]): YearPoint[] {
  const rows = ((po?.harvest ?? []) as Row[]).slice().sort((a, b) => a.year - b.year);
  return rows.map((r) => {
    const mule = species === 'DEER' && !po?.mulePermit ? speciesTotal('DEER_MULE', units, r.year) : null;
    const whitetail = species === 'DEER' && !po?.mulePermit ? speciesTotal('DEER_WHITETAIL', units, r.year) : null;
    return {
      year: r.year, hunters: r.hunters, harvest: r.harvest,
      success: r.hunters > 0 && r.harvest <= r.hunters ? r.harvest / r.hunters : null,
      antlered: r.antlered ?? null, antlerless: r.antlered != null ? Math.max(0, r.harvest - r.antlered) : null,
      big: r.big ?? null, mule: mule !== null && whitetail !== null ? mule : null, whitetail: mule !== null && whitetail !== null ? whitetail : null,
    };
  });
}

/** Draw history as Idaho's odds and applicants charts read it: first-choice applicants and drew, by pool. */
export function mtDrawSeries(po: MtPointOdds | null | undefined): YearPoint[] {
  return (po?.history ?? []).slice().sort((a, b) => a.year - b.year).map((h) => ({
    year: h.year,
    permits: typeof h.quota === 'number' ? h.quota : null,
    resApps: h.res[0], nrApps: h.nr[0],
    resPermits: h.res[1], nrPermits: h.nr[1],
    resOdds: h.res[0] ? Math.min(1, h.res[1] / h.res[0]) : null,
    nrOdds: h.nr[0] ? Math.min(1, h.nr[1] / h.nr[0]) : null,
  }));
}
