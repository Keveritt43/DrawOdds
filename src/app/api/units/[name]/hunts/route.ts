import { db } from '@/lib/db';
import { sortUnitHunts, unitHuntLabel } from '@/lib/unitHunts';
import { getResidency } from '@/lib/residency';

export const dynamic = 'force-dynamic';

/** A unit's hunts for the map card: general seasons first, then controlled. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name).toUpperCase().slice(0, 8);
  const nr = (await getResidency()).residency === 'NONRESIDENT';
  const rows = sortUnitHunts(await db.huntSummary.findMany({ where: { units: { has: name }, youthOnly: false, ...(nr ? {} : { nrTag: false }) } }));
  return Response.json(
    rows.map((h) => ({
      id: h.id,
      type: h.nrTag ? 'NRTAG' : h.type,
      label: unitHuntLabel(h),
      antler: h.antlerClass,
      open: h.openDate,
      close: h.closeDate,
      resOdds5: h.resOdds5,
      nrOdds5: h.nrOdds5,
      success5: h.success5,
    })),
    { headers: { 'Cache-Control': 'private, max-age=600' } }, // depends on the residency cookie
  );
}
