import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { overlapsElk } from '@/lib/overlappingSeasons';
import { dateRange } from '@/lib/coDisplay';
/** Shared by Idaho and Colorado; dates must really overlap, not merely touch an enclosing season envelope. */
export async function OverlappingElk({ hunt }: { hunt: HuntSummary }) {
  if (hunt.type !== 'CONTROLLED' || !['DEER', 'ELK'].includes(hunt.species) || !hunt.units.length) return null;
  const candidates = await db.huntSummary.findMany({
    where: { state: hunt.state, species: 'ELK', units: { hasSome: hunt.units }, id: { not: hunt.id } },
    orderBy: [{ type: 'asc' }, { openDate: 'asc' }],
  });
  const rows = candidates.filter((h) => overlapsElk(hunt, h));
  return (
    <section style={{ marginTop: 28 }}>
      <h2>Elk Seasons Open At The Same Time</h2>
      <p className="small muted">
        Same unit and at least one overlapping date. Each season requires its own valid license and eligibility; listing it does not
        establish that tags are currently available.
      </p>
      {rows.length ? (
        <div className="htable-wrap">
          <table>
            <thead>
              <tr>
                <th>Elk hunt</th>
                <th>Type</th>
                <th>Shared units</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/hunts/${r.slug ?? encodeURIComponent(r.id)}`}>{r.name}</Link>
                  </td>
                  <td>
                    {r.type === 'GENERAL' ? 'General / OTC' : 'Limited / controlled'}
                    {r.privateOnly ? ' · Private land' : ''}
                    {(r.pointOdds as { general?: { nonresident: boolean } })?.general?.nonresident === false ? ' · Residents only' : ''}
                  </td>
                  <td>{r.units.filter((u) => hunt.units.includes(u)).join(', ')}</td>
                  <td>{dateRange(r.openDate, r.closeDate) || 'See season rules'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No elk seasons with confirmed overlapping dates are loaded for these units.</p>
      )}
    </section>
  );
}
