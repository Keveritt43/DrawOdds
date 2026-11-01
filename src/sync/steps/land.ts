import { db, HP_BASE, STATS_BASE, thisYear, type StepOptions, type StepResult } from '../core/context';
import { get } from '../core/http';
import { parseLandPage, parseUnitLinks } from '../core/parse';

const STALE_DAYS = 30; // land ownership barely changes; don't re-scrape ~500 pages every night

const stale = (d: Date | null, full: boolean) => full || !d || Date.now() - d.getTime() > STALE_DAYS * 864e5;

/** Land ownership for every unit (unit.aspx) and every current controlled hunt area (area.aspx). */
export async function syncLand(opts: StepOptions): Promise<StepResult> {
  const details: string[] = [];
  let rows = 0;

  // Hunt Planner unit IDs come from the links on a stats page (the GIS layer's IDs differ)
  const ids = parseUnitLinks(await get(`${STATS_BASE}?season=general&game=deer&yr=${thisYear() - 1}`));
  if (ids.size < 90) details.push(`Only ${ids.size} unit links found on the stats page`);
  for (const [name, idfgId] of ids) {
    await db.unit.upsert({ where: { name }, create: { name, idfgId }, update: { idfgId } });
  }

  const units = await db.unit.findMany({ select: { name: true, idfgId: true, landUpdatedAt: true } });
  for (const u of units) {
    if (!u.idfgId || !stale(u.landUpdatedAt, opts.full)) continue;
    try {
      const p = parseLandPage(await get(`${HP_BASE}unit.aspx?ID=${u.idfgId}`));
      if (!p.shares.length) {
        details.push(`Unit ${u.name}: no Surface Management section found`);
        continue;
      }
      await db.unit.update({
        where: { name: u.name },
        data: {
          landOwnership: p.shares as object,
          publicPct: p.publicPct,
          privatePct: p.privatePct,
          wildernessPct: p.wildernessPct,
          landUpdatedAt: new Date(),
          ...(p.accessYesNone ? { accessYesCount: 0, accessYesAcres: 0 } : {}),
        },
      });
      rows++;
    } catch (e) {
      details.push(`Unit ${u.name}: ${(e as Error).message}`);
    }
  }

  // controlled hunt areas in use the last two years (AreaID from the odds API = area.aspx ID)
  const areaIds = (
    await db.drawOdds.findMany({
      where: { year: { gte: thisYear() - 1 }, areaId: { not: null } },
      select: { areaId: true, areaName: true },
      distinct: ['areaId'],
    })
  ).filter((a) => a.areaId !== null) as { areaId: number; areaName: string }[];
  const known = new Map((await db.huntArea.findMany({ select: { areaId: true, landUpdatedAt: true } })).map((a) => [a.areaId, a.landUpdatedAt]));
  for (const a of areaIds) {
    if (!stale(known.get(a.areaId) ?? null, opts.full)) continue;
    try {
      const p = parseLandPage(await get(`${HP_BASE}area.aspx?ID=${a.areaId}`));
      if (!p.shares.length) {
        details.push(`Area ${a.areaName} (${a.areaId}): no Surface Management section found`);
        continue;
      }
      const data = {
        landOwnership: p.shares as object,
        publicPct: p.publicPct,
        privatePct: p.privatePct,
        landUpdatedAt: new Date(),
      };
      await db.huntArea.upsert({ where: { areaId: a.areaId }, create: { areaId: a.areaId, name: a.areaName, ...data }, update: data });
      rows++;
    } catch (e) {
      details.push(`Area ${a.areaName} (${a.areaId}): ${(e as Error).message}`);
    }
  }
  return { rows, details };
}
