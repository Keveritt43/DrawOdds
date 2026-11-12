import { coSpecial } from '@/lib/coSpecial';
import { specialPersonalOdds } from '@/lib/coSpecialPoints';
import { getPoints } from "@/lib/points";
import { poolFor, tableOdds, type OddsTable } from "@/lib/coHunt";
import { db } from '@/lib/db';
import { sortUnitHunts, unitHuntLabel } from '@/lib/unitHunts';
import { getResidency } from '@/lib/residency';
import { parseUnitKey } from '@/lib/states';
import { getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { mtPersonal } from '@/lib/mtHunt';

export const dynamic = 'force-dynamic';

/** A unit's hunts for the map card: general seasons first, then controlled. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> },
) {
  const ref = parseUnitKey(decodeURIComponent((await params).name));
  const state = ref.state;
  const name = ref.name.toUpperCase().slice(0, 8);
  if (state === 'MT') {
    // Montana: every licence touching the district (general, permits, antelope and B licences), odds at the
    // hunter's saved Montana points; a nonresident permit's odds are its own draw, as the cards show
    const pts = readMtPoints((await getPointsStore()).store as Record<string, unknown>);
    const rows = await db.huntSummary.findMany({ where: { state: 'MT', units: { has: name } }, orderBy: [{ type: 'asc' }, { species: 'asc' }, { tagCode: 'asc' }] });
    const odds = (h: (typeof rows)[number], nr: boolean) => { const p = mtPersonal(h, { ...pts, res: nr ? 'NONRESIDENT' : 'RESIDENT' }, nr); return p.parts ? p.parts.permit : p.odds; };
    return Response.json(rows.map((h) => ({
      id: h.id, tagCode: h.tagCode, slug: h.slug, type: h.type, label: h.name, species: h.species, antler: h.antlerClass,
      open: h.openDate, close: h.closeDate, resOdds5: odds(h, false), nrOdds5: odds(h, true), success5: h.success5,
    })), { headers: { 'Cache-Control': 'private, no-store' } });
  }
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
      resOdds5: special && pts ? specialPersonalOdds(special, false, pts) : pts
        ? tableOdds(
            h.oddsByPts as unknown as OddsTable,
            "proj",
            poolFor(false, pts.youth),
            pts[h.species === 'PRONGHORN' ? 'PRONGHORN' : h.species === 'ELK' ? 'ELK' : 'DEER'],
          )
        : h.resOdds5,
      nrOdds5: special && pts ? specialPersonalOdds(special, true, pts) : pts
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
