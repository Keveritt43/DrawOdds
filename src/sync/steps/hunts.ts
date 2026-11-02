import { db, HP_BASE, SPECIES, thisYear, type StepResult } from '../core/context';
import { get } from '../core/http';
import { parseHuntList, type ListedHunt } from '../core/parse';

/**
 * This season's hunts, from IDFG's per-unit hunt lists (huntlist.aspx), for deer and elk.
 * A hunt appears on the list of every unit it touches; we accumulate the units.
 */
export async function syncHunts(): Promise<StepResult> {
  const details: string[] = [];
  const units = await db.unit.findMany({ where: { idfgId: { not: null } }, select: { name: true, idfgId: true } });
  if (units.length < 90) return { rows: 0, status: 'ERROR', details: [`Only ${units.length} units with Hunt Planner IDs - run the land step first`] };

  const found = new Map<number, ListedHunt & { species: 'DEER' | 'ELK'; units: Set<string> }>();
  for (const { code, species } of SPECIES) {
    for (const u of units) {
      try {
        const html = await get(`${HP_BASE}huntlist.aspx?Areas=Unit&AreasID=${u.idfgId}&BigGameID=${code}`);
        for (const h of parseHuntList(html)) {
          const prev = found.get(h.idfgId);
          if (prev) prev.units.add(u.name);
          else found.set(h.idfgId, { ...h, species, units: new Set([u.name]) });
        }
      } catch (e) {
        details.push(`${species} unit ${u.name}: ${(e as Error).message}`);
      }
    }
  }
  if (found.size < 200) return { rows: found.size, status: 'ERROR', details: [`Only ${found.size} hunts parsed - page layout may have changed`, ...details] };

  // the hunt lists also show past seasons, and IDFG reuses hunt numbers: keep only the newest season
  // the season = the most common opening year (not the max: a January opener would look like next year)
  const counts = new Map<number, number>();
  for (const h of found.values()) if (h.open) counts.set(Number(h.open.slice(0, 4)), (counts.get(Number(h.open.slice(0, 4))) ?? 0) + 1);
  const season = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? thisYear();
  let dropped = 0;
  for (const [id, h] of found) {
    // drop listings that ended before this season (a Dec-Jan hunt from last season closes in Jan of this year)
    if (h.close && Number(h.close.slice(0, 4)) < season || (h.open && Number(h.open.slice(0, 4)) < season - 1)) {
      found.delete(id);
      dropped++;
    }
  }
  if (dropped) details.push(`Dropped ${dropped} listings from earlier seasons (kept ${season})`);
  const year = season;
  const noDates = [...found.values()].filter((h) => !h.open).length;
  if (noDates > found.size * 0.2) details.push(`${noDates} of ${found.size} hunts have no parsed dates - check parseHuntList`);

  await db.$transaction(async (tx) => {
    for (const h of found.values()) {
      const data = {
        year: h.open ? Number(h.open.slice(0, 4)) : year,
        species: h.species,
        type: h.type,
        huntNumber: h.huntNumber,
        name: h.name,
        takeMethod: h.takeMethod,
        weapon: h.weapon,
        antlerClass: h.antlerClass,
        sexText: h.sexText,
        openDate: h.open ? new Date(`${h.open}T00:00:00Z`) : null,
        closeDate: h.close ? new Date(`${h.close}T00:00:00Z`) : null,
        tags: h.tags,
        youthOnly: h.youthOnly,
        units: [...h.units].sort(),
        rawText: h.text,
      };
      await tx.hunt.upsert({ where: { idfgId: h.idfgId }, create: { idfgId: h.idfgId, ...data }, update: data });
    }
    // hunts no longer listed are dropped - unless someone saved one; those stay (the UI marks them "not offered")
    await tx.hunt.deleteMany({ where: { idfgId: { notIn: [...found.keys()] }, saved: { none: {} } } });
  }, { timeout: 120_000 });

  return { rows: found.size, details };
}
