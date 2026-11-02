import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * First-choice controlled-hunt applicants and permits per year, resident vs nonresident (1st drawing).
 * Public summary of IDFG's drawing odds - used to check trends (e.g. the 2026 nonresident license effect).
 */
export async function GET() {
  const rows = await db.drawOdds.groupBy({
    by: ['species', 'year'],
    where: { draw: 1, year: { gte: 2016 } },
    _sum: { resApps: true, nrApps: true, resPermits: true, nrPermits: true, permits: true },
    _count: { _all: true },
    orderBy: [{ species: 'asc' }, { year: 'asc' }],
  });
  return Response.json(
    rows.map((r) => ({
      species: r.species,
      year: r.year,
      hunts: r._count._all,
      resApps: r._sum.resApps,
      nrApps: r._sum.nrApps,
      resPermits: r._sum.resPermits,
      nrPermits: r._sum.nrPermits,
      permits: r._sum.permits,
    })),
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
