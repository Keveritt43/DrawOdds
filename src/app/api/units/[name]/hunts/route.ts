import { coSpecial, specialOdds } from '@/lib/coSpecial';
import { getPoints } from "@/lib/points";
import { poolFor, tableOdds, type OddsTable } from "@/lib/coHunt";
import { db } from '@/lib/db';
import { sortUnitHunts, unitHuntLabel } from '@/lib/unitHunts';
import { getResidency } from '@/lib/residency';
import { parseUnitKey } from '@/lib/states';

export const dynamic = 'force-dynamic';

/** A unit's hunts for the map card: general seasons first, then controlled. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> },
) {
  const ref = parseUnitKey(decodeURIComponent((await params).name));
  const state = ref.state;
  const name = ref.name.toUpperCase().slice(0, 8);
  const nr = (await getResidency(undefined, state)).residency === 'NONRESIDENT';
  const all = sortUnitHunts(await db.huntSummary.findMany({ where: { state, units: { has: name }, youthOnly: false, ...(nr ? {} : { OR: [{ nrTag: false }, { nrTag: true, species: 'ELK' as const }] }) } }));
  // same listing rules as Filtering: elk = zone A/B tags, deer = general seasons (+ White-tailed tag)
  const pts = state === "CO" ? await getPoints("CO") : null;
  const rows =
    state === "CO"
      ? all
      : all.filter((h) => (h.nrTag ? h.species === 'ELK' || !!h.tagCode?.startsWith('WD') : !(h.type === 'GENERAL' && h.species === 'ELK')));
  return Response.json(
    rows.map((h) => {
      const special = coSpecial(h);
      return {
      id: h.id,
      tagCode: h.tagCode,
      slug: h.slug,
      type: h.nrTag ? 'NRTAG' : h.type,
      label: state === "CO" ? h.name : unitHuntLabel(h),
      species: h.species,
      antler: h.antlerClass,
      open: h.openDate,
      close: h.closeDate,
      resOdds5: special ? specialOdds(special, false, pts?.youth ?? false) : pts
        ? tableOdds(
            h.oddsByPts as unknown as OddsTable,
            "proj",
            poolFor(false, pts.youth),
            pts[h.species === 'PRONGHORN' ? 'PRONGHORN' : h.species === 'ELK' ? 'ELK' : 'DEER'],
          )
        : h.resOdds5,
      nrOdds5: special ? specialOdds(special, true, pts?.youth ?? false) : pts
        ? tableOdds(
            h.oddsByPts as unknown as OddsTable,
            "proj",
            poolFor(true, pts.youth),
            pts[h.species === 'PRONGHORN' ? 'PRONGHORN' : h.species === 'ELK' ? 'ELK' : 'DEER'],
          )
        : h.nrOdds5,
      success5: h.success5,
      };
    }),
    { headers: { 'Cache-Control': 'private, no-store' } }, // eligibility depends on current per-state settings
  );
}
