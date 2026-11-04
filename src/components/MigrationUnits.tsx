import Link from 'next/link';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { historyFor } from '@/lib/history';
import { residencyFields } from '@/lib/finder';
import { pct, pctOdds, density, WEAPON, antlerLabel, SPECIES_LABEL, int } from '@/lib/format';
import { SuccessChart } from './Charts';
import { ScoreBadge } from './HuntCards';
import { ANIMAL, type StudyInfo } from '@/lib/migrations';

/**
 * One card per unit a study crosses: the study species' general seasons and controlled hunts there, with the
 * general-season success trend, so a hunter can see which unit to dig into.
 */
export async function MigrationUnits({ s, nr }: { s: StudyInfo; nr: boolean }) {
  const rf = residencyFields(nr ? 'NONRESIDENT' : 'RESIDENT');
  const rows = await db.huntSummary.findMany({ where: { species: s.species, units: { hasSome: s.units }, youthOnly: false } });
  const unitInfo = new Map((await db.unit.findMany({ where: { name: { in: s.units } }, select: { name: true, publicPct: true, acres: true } })).map((u) => [u.name, u]));
  const ua = s.unitAcres as Record<string, Record<string, number>>;
  const cards = await Promise.all(
    s.units.map(async (u) => {
      const general = rows.filter((r) => r.type === 'GENERAL' && !r.nrTag && (r.unit ?? r.units[0]) === u).sort((a, b) => a.weapon.localeCompare(b.weapon));
      const tags = nr ? rows.filter((r) => r.nrTag && r.units.includes(u)) : [];
      const controlled = rows.filter((r) => r.type === 'CONTROLLED' && r.units.includes(u)).sort((a, b) => (b.scoreQuality ?? 0) - (a.scoreQuality ?? 0));
      const main = general.find((r) => r.weapon === 'ANY') ?? general[0];
      const hist = main ? await historyFor(main) : [];
      return { u, general, tags, controlled, hist };
    }),
  );
  const routeAcres = (u: string) => Object.entries(ua[u] ?? {}).filter(([k]) => k !== 'ONE').reduce((a, [, v]) => a + v, 0);
  const odds = (r: HuntSummary) => r[rf.odds5];
  return (
    <section aria-label="Units this migration crosses">
      <h2>Units It Crosses</h2>
      <div className="mig-units">
        {cards.map(({ u, general, tags, controlled, hist }) => (
          <article key={u} className="card mig-unit">
            <h3 style={{ marginTop: 0 }}><Link href={`/units/${encodeURIComponent(u)}`}>Unit {u}</Link></h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              {unitInfo.get(u)?.publicPct !== null && unitInfo.get(u)?.publicPct !== undefined ? `${Math.round(unitInfo.get(u)!.publicPct!)}% public · ` : ''}
              {routeAcres(u) > 0 ? `about ${int(routeAcres(u))} acres of routes used by 2+ ${ANIMAL[s.species] ?? 'animals'} and stopovers` : 'unit named in the report (no route map yet)'}
            </p>
            <h4>General {SPECIES_LABEL[s.species].toLowerCase()}</h4>
            {!general.length ? <p className="small muted">No general season.</p> : (
              <ul className="mig-list">
                {general.map((r) => (
                  <li key={r.id}><Link href={`/hunts/${encodeURIComponent(r.id)}`}>{WEAPON[r.weapon]}</Link> · {pct(r.success5)} success · {density(r.huntersSqMi)} hunters/mi²{r.scoreQuality !== null ? <> · <ScoreBadge v={r.scoreQuality} label="" /></> : null}</li>
                ))}
                {tags.map((r) => <li key={r.id}><Link href={`/hunts/${encodeURIComponent(r.id)}`}>{r.tagCode} tag</Link> · {pctOdds(r.nrOdds5)} NR odds{r.quota !== null ? ` · ${int(r.quota)} NR tags` : ''}</li>)}
              </ul>
            )}
            <h4>Controlled ({controlled.length})</h4>
            {!controlled.length ? <p className="small muted">None.</p> : (
              <ul className="mig-list">
                {controlled.slice(0, 6).map((r) => (
                  <li key={r.id}><Link href={`/hunts/${encodeURIComponent(r.id)}`}>Hunt {r.huntNumber}</Link> · {antlerLabel(r.species, r.antlerClass)} · {WEAPON[r.weapon]} · {pctOdds(odds(r))} odds · {pct(r.success5)} success{r.scoreQuality !== null ? <> · <ScoreBadge v={r.scoreQuality} label="" /></> : null}</li>
                ))}
                {controlled.length > 6 && <li><Link href={`/hunts?unit=${encodeURIComponent(u)}&species=${s.species}&type=CONTROLLED`}>All {controlled.length} →</Link></li>}
              </ul>
            )}
            {hist.length > 1 && <SuccessChart data={hist} />}
          </article>
        ))}
      </div>
    </section>
  );
}
