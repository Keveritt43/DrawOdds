import { HuntLink } from '@/components/HuntNavigation';
import Link from 'next/link';
import { huntHref } from '@/lib/huntSlug';
import type { HuntSummary } from '@prisma/client';
import { pct, pctOdds, int, range, WEAPON, antlerLabel, density, SPECIES_LABEL } from '@/lib/format';
import { seasonsSummary } from '@/lib/tagSeasons';
import { tagLabel, scoreColor, type CardCtx } from './HuntCards';
import { CompareToggle } from './Compare';

/** Name for a row: "Elk 2034", "Unit 40 general deer", "Selway A tag". */
export function huntName(r: HuntSummary): string {
  if(r.state==='CO')return r.name;
  if (r.nrTag) return r.species === 'ELK' ? tagLabel(r) : `Unit ${r.unit ?? r.units[0]} ${tagLabel(r)}`;
  if (r.type === 'CONTROLLED') return `${SPECIES_LABEL[r.species]} ${r.huntNumber ?? ''}`;
  return `Unit ${r.unit ?? r.units[0]} general ${SPECIES_LABEL[r.species].toLowerCase()}`;
}

const Score = ({ v }: { v: number | null }) =>
  v === null ? <span className="muted">-</span> : <b className="tscore" style={{ background: scoreColor(v), color: v < 100 / 7 || v >= 600 / 7 ? '#fff' : '#1d1d1d' }}>{v}</b>;

/** Dense, scannable list: one hunt per row, every number side by side. Headers re-sort. */
export function HuntTable({ rows, c, sortHref }: { rows: HuntSummary[]; c: CardCtx; sortHref: (sort: string) => string }) {
  const odds = (r: HuntSummary) => (r.type === 'CONTROLLED' ? r[c.rf.odds5] : c.nr ? r.nrOdds5 : null);
  const last = (r: HuntSummary) => (r.type === 'CONTROLLED' ? r[c.rf.oddsLast] : c.nr ? r.nrOddsLast : null);
  const opp = (r: HuntSummary) => (c.nr ? r.scoreOppNr : r.scoreOppRes);
  const H = ({ s, children, title }: { s?: string; children: React.ReactNode; title?: string }) => (
    <th title={title} aria-sort={s && c.sort === s ? 'descending' : undefined}>{s ? <Link href={sortHref(s)} scroll={false}>{children}{c.sort === s ? ' ▾' : ''}</Link> : children}</th>
  );
  return (
    <div className="htable-wrap">
      <table className="htable">
        <thead>
          <tr>
            <th aria-label="Compare" />
            <H>Hunt</H>
            <H>Where</H>
            <H>Weapon · sex</H>
            <H s="open">Dates</H>
            <H title="Tags (nonresident tags)">Tags</H>
            <H s="odds" title={`${c.nr ? 'Nonresident' : 'Resident'} 1st-choice odds, 5-yr`}>Odds 5-yr</H>
            <H title="Latest drawing">Latest</H>
            <H s="success">Success</H>
            <H s="best" title="Draw odds × success: chance one application ends with an animal">Draw+fill</H>
            <H s="densityLow">Hunters/mi²</H>
            <H s="public">Public</H>
            <H s="big">Trophy</H>
            <H s="score">Quality</H>
            <H s="opp">Opp.</H>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const name = huntName(r);
            const when = r.nrTag || (r.type === 'GENERAL' && seasonsSummary(r.tagSeasons)) ? seasonsSummary(r.tagSeasons, 2) : range(r.openDate, r.closeDate);
            const o = odds(r);
            return (
              <tr key={r.id}>
                <td><CompareToggle id={r.id} label={name} compact /></td>
                <td className="tname"><HuntLink href={huntHref(r)}>{name}</HuntLink>{r.type === 'CONTROLLED' ? '' : r.nrTag ? <span className="muted"> · tag</span> : <span className="muted"> · general</span>}</td>
                <td>{r.type === 'CONTROLLED' ? `${r.areaName ?? ''}${r.units.length ? ` (${r.units.join(', ')})` : ''}` : r.units.join(', ')}</td>
                <td>{r.nrTag ? 'Tag seasons' : WEAPON[r.weapon]} · {antlerLabel(r.species, r.antlerClass)}</td>
                <td className="nowrap">{when || '-'}</td>
                <td className="num">{r.type === 'CONTROLLED' ? <>{int(r.tags)}{c.nr && r.nrPermitsLast !== null ? <span className="muted"> ({int(r.nrPermitsLast)} NR)</span> : ''}</> : r.nrTag && r.quota !== null ? `${int(r.quota)} NR` : c.nr ? 'NR draw' : 'OTC'}</td>
                <td className="num">{o === null ? (c.nr || r.type === 'CONTROLLED' ? '-' : 'OTC') : pctOdds(o)}</td>
                <td className="num muted">{last(r) === null ? '-' : pctOdds(last(r))}</td>
                <td className={`num${r.smallSample ? ' faint' : ''}`}>{pct(r.success5)}</td>
                <td className="num">{pct(r[c.rf.tagAndFill], 1)}</td>
                <td className="num">{density(r.huntersSqMi)}</td>
                <td className="num">{r.publicPct === null ? '-' : `${Math.round(r.publicPct)}%`}</td>
                <td className="num">{pct(r.bigPct5)}</td>
                <td className="num"><Score v={r.scoreQuality} /></td>
                <td className="num"><Score v={opp(r)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
