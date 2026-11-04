import { db } from '@/lib/db';
import { lineage, odds, type OddsRow } from '@/sync/core/math';
import type { HuntSummary } from '@prisma/client';

const METHOD: Record<string, string> = { ANY: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };

export interface YearPoint {
  year: number;
  huntNumber?: number | null;
  permits?: number | null;
  resPermits?: number | null;
  nrPermits?: number | null;
  resApps?: number | null;
  nrApps?: number | null;
  resOdds?: number | null;
  nrOdds?: number | null;
  hunters?: number | null;
  harvest?: number | null;
  success?: number | null;
  antlered?: number | null;
  antlerless?: number | null;
  mule?: number | null;
  whitetail?: number | null;
  big?: number | null;
  areaName?: string | null;
}

// success over 100% (more harvest than hunters) is an IDFG data error in tiny samples: show it as missing
const r = (a?: number | null, b?: number | null) => (a == null || !b || a > b ? null : a / b);

/** Year-by-year history for one summary row (controlled: followed through renumbering; general: the unit). */
export async function historyFor(s: HuntSummary, years = 10): Promise<YearPoint[]> {
  const byYear = new Map<number, YearPoint>();
  const at = (y: number) => byYear.get(y) ?? byYear.set(y, { year: y }).get(y)!;

  if (s.type === 'CONTROLLED' && s.huntNumber && s.areaName) {
    const hist = await db.drawOdds.findMany({ where: { species: s.species, areaName: s.areaName, draw: 1 } });
    const cur = hist.filter((o) => o.huntNumber === s.huntNumber).sort((a, b) => b.year - a.year)[0];
    if (cur) {
      const lin = lineage(cur as OddsRow, hist as OddsRow[]);
      for (const o of hist) {
        if (lin.get(o.year) !== o.huntNumber) continue;
        Object.assign(at(o.year), {
          huntNumber: o.huntNumber, permits: o.permits, resPermits: o.resPermits, nrPermits: o.nrPermits,
          resApps: o.resApps, nrApps: o.nrApps, resOdds: odds(o.resPermits, o.resApps), nrOdds: odds(o.nrPermits, o.nrApps), areaName: o.areaName,
        });
      }
      const harv = await db.controlledHarvest.findMany({
        where: { species: s.species, OR: [...lin.entries()].map(([year, huntNumber]) => ({ year, huntNumber })) },
      });
      for (const h of harv)
        Object.assign(at(h.year), {
          hunters: h.hunters, harvest: h.harvest, success: r(h.harvest, h.hunters), antlered: h.antlered, antlerless: h.antlerless,
          mule: h.estMule, whitetail: h.estWt, big: s.species === 'ELK' ? h.est6 : h.est4,
        });
    }
  } else if (s.nrTag) {
    // nonresident general tag: general seasons across the tag's units, summed per year. Elk A/B tags count only
    // the weapons their seasons allow (the same basis as the tag's 5-yr success); deer tags, all weapons.
    const TM: Record<string, string> = { ANY: 'Any Weapon', SHORT_RANGE: 'Any Weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' };
    const tagMethods = s.species === 'ELK' ? [...new Set((s.weapons as string[]).map((w) => TM[w]).filter(Boolean))] : [];
    const methods = tagMethods.length ? tagMethods : ['All Weapons Combined'];
    const harv = await db.generalHarvest.findMany({ where: { species: s.species, unit: { in: s.units }, takeMethod: { in: methods } } });
    for (const h of harv) {
      const p = at(h.year);
      const add = (k: keyof YearPoint, v: number | null) => {
        if (v !== null) (p as unknown as Record<string, number>)[k] = ((p[k] as number | undefined) ?? 0) + v;
      };
      add('hunters', h.hunters);
      add('harvest', h.harvest);
      add('antlered', h.antlered);
      add('antlerless', h.antlerless);
      add('mule', h.estMule);
      add('whitetail', h.estWt);
      add('big', s.species === 'ELK' ? h.est6 : h.est4);
    }
    for (const p of byYear.values()) p.success = r(p.harvest, p.hunters);
  } else if (s.unit) {
    const method = METHOD[s.weapon] ?? 'All Weapons Combined';
    const harv = await db.generalHarvest.findMany({ where: { species: s.species, unit: s.unit, takeMethod: method } });
    for (const h of harv)
      Object.assign(at(h.year), {
        hunters: h.hunters, harvest: h.harvest, success: r(h.harvest, h.hunters), antlered: h.antlered, antlerless: h.antlerless,
        mule: h.estMule, whitetail: h.estWt, big: s.species === 'ELK' ? h.est6 : h.est4,
      });
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year).slice(-years);
}
