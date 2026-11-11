/**
 * Montana Block Management (BMA): FWP's program that opens enrolled private land to public hunting.
 * Built offline by scripts/mt_build_bma.py into data/mt/bma.json; see docs/states/mt-onboarding.md.
 *
 * Two kinds, and they are not equal:
 *  - Type 1: "hunters administer their own permission" (FWP): a sign-in box, a roster, or no sign-in at all. Treated
 *    like public land with the BMA's own rules (usually motorized travel limited to marked roads, or walk-in only).
 *    Type 1 is in the "public + Block Management" share, the score's access input and the map shading.
 *  - Type 2: "someone other than the hunter issues permission" (landowner or FWP): often a reservation, a pasture
 *    assignment and a hunter limit, so it is not a sure way in. Never added to public land; shown on its own, and
 *    filters count it only when the hunter asks to.
 *
 * Acres are BMA land that is NOT already public (BMAs enroll state and federal parcels inside a ranch too, and those
 * are already in the public share), and only from BMAs whose 2026 guide row lists the species. A BMA crossing two
 * districts counts once in each district's BMA count.
 */
import data from '../../data/mt/bma.json';

type SpRec = { t1: number; n1: number; t2: number; n2: number };
type DistrictRec = { acres: number; all: SpRec & { t1All: number; t2All: number }; deer?: SpRec; elk?: SpRec; antelope?: SpRec };

const DISTRICTS: Record<string, DistrictRec> = { ...(data.districts as Record<string, DistrictRec>), ...(data.antelope as Record<string, DistrictRec>) };
const KEY: Record<string, 'deer' | 'elk' | 'antelope'> = { DEER: 'deer', ELK: 'elk', PRONGHORN: 'antelope' };

export const MT_BMA_SOURCE = data.source;
export const MT_BMA_YEAR = '2026–27';
export const MT_BMA_CHECKED = data.source.checked;

export interface MtBma {
  acres: number;
  /** Type 1 acres not already public, and as % of the hunt's districts */
  t1: number; t1Pct: number; n1: number;
  t2: number; t2Pct: number; n2: number;
}

/** Block Management in a hunt's districts for one species, or null when a district or species isn't covered. */
export function mtBma(units: string[], species: string): MtBma | null {
  const k = KEY[species];
  if (!k || !units.length) return null;
  let acres = 0, t1 = 0, t2 = 0, n1 = 0, n2 = 0;
  for (const u of units) {
    const d = DISTRICTS[u], s = d?.[k];
    if (!d || !s) return null;
    acres += d.acres; t1 += s.t1; t2 += s.t2; n1 += s.n1; n2 += s.n2;
  }
  const pct = (x: number) => Math.round((1000 * x) / acres) / 10;
  return { acres, t1, t1Pct: pct(t1), n1, t2, t2Pct: pct(t2), n2 };
}

/** One district, every species it has ("261" → deer and elk; "A320" → antelope). */
export function mtBmaDistrict(unit: string): { species: 'DEER' | 'ELK' | 'PRONGHORN'; bma: MtBma }[] {
  const d = DISTRICTS[unit];
  if (!d) return [];
  return (['DEER', 'ELK', 'PRONGHORN'] as const).flatMap((sp) => {
    const b = d[KEY[sp]] ? mtBma([unit], sp) : null;
    return b ? [{ species: sp, bma: b }] : [];
  });
}

/** Share counted as access in Montana filters: Type 1, plus Type 2 only when the hunter chose to include it. */
export const mtAccessPct = (b: MtBma | null, withType2: boolean) => (b ? b.t1Pct + (withType2 ? b.t2Pct : 0) : null);

/** "<1%" for a sliver, whole percent otherwise. */
export const bmaPct = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`);
export const bmaAcres = (a: number) => `${Math.round(a).toLocaleString('en-US')} ac`;

export const BMA_TYPE1 = 'Type 1: you sign yourself in (sign-in box, roster, or none). Open like public land, under the BMA’s own rules, which often limit vehicles to marked roads or make it walk-in only.';
export const BMA_TYPE2 = 'Type 2: the landowner or FWP gives permission, often by reservation, with hunter limits. Not a sure way in.';
export const BMA_FWP_URL = 'https://fwp.mt.gov/hunt/access/blockmanagement';
