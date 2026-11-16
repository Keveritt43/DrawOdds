import { wyLicenseSeries } from './wyLicenseMetrics';

/** Pooled harvest per active license, kept separate from hunter success. */
export function wyPresetHarvest(pointOdds: unknown, species: string): { label: string; rate: number; years: number; first: number; last: number }[] {
  const po = pointOdds as { harvest?: unknown; harvestBasis?: string } | null;
  // Region aggregates can count the same license in multiple areas.
  if (!po || po.harvestBasis || !Array.isArray(po.harvest)) return [];
  const observations: unknown[] = po.harvest;
  const pool = (rows: { year: number; hunters: number; harvest: number }[], label: string) => {
    const selected = rows.sort((a, b) => a.year - b.year).slice(-5);
    const licenses = selected.reduce((n, r) => n + r.hunters, 0);
    return licenses > 0 ? [{ label, rate: selected.reduce((n, r) => n + r.harvest, 0) / licenses, years: selected.length, first: selected[0].year, last: selected[selected.length - 1].year }] : [];
  };
  if (species === 'ELK' || species === 'PRONGHORN') return pool(wyLicenseSeries(po), species === 'ELK' ? 'Elk' : 'Pronghorn');
  if (species !== 'DEER') return [];
  return (['Mule deer', 'Whitetail'] as const).flatMap(label => {
    const rows = observations.flatMap((value: unknown) => {
      const r = value as Record<string, unknown> | null;
      if (!r || r.basis !== 'mule+whitetail') return [];
      const hunters = r[label === 'Mule deer' ? 'huntersMule' : 'huntersWhitetail'];
      const harvest = r[label === 'Mule deer' ? 'mule' : 'whitetail'];
      return typeof r.year === 'number' && Number.isInteger(r.year) && typeof hunters === 'number' && Number.isFinite(hunters) && hunters >= 0 && typeof harvest === 'number' && Number.isFinite(harvest) && harvest >= 0 && harvest <= hunters
        ? [{ year: r.year, hunters, harvest }] : [];
    });
    return pool(rows, label);
  });
}
