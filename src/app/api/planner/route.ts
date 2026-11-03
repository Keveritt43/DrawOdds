import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * Hunts for the application planner. ?kind=tag (nonresident general deer / elk tags) or controlled&species=X.
 * Only the numbers the planner needs: per-choice draw history for tags, 1st and 2nd choice odds for hunts.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get('kind');
  const species = u.searchParams.get('species') ?? '';
  const where: Prisma.HuntSummaryWhereInput = kind === 'tag'
    ? { nrTag: true, species: species === 'DEER' ? 'DEER' : 'ELK' }
    : { type: 'CONTROLLED', species: (['DEER', 'ELK', 'PRONGHORN', 'MOOSE', 'BIGHORN', 'GOAT'].includes(species) ? species : 'DEER') as never, youthOnly: false };
  const rows = await db.huntSummary.findMany({
    where,
    select: {
      id: true, name: true, species: true, huntNumber: true, areaName: true, units: true, weapon: true, antlerClass: true, tagCode: true,
      resOdds5: true, nrOdds5: true, resOddsLast: true, nrOddsLast: true, secondDrewLast: true, secondAppsLast: true, nrDraw: true, quota: true,
      tags: true, success5: true, resTagAndFill: true, nrTagAndFill: true, scoreQuality: true, openDate: true, closeDate: true, tagSeasons: true,
    },
    orderBy: [{ huntNumber: 'asc' }, { name: 'asc' }],
  });
  return Response.json(rows, { headers: { 'Cache-Control': 'public, max-age=600' } });
}
