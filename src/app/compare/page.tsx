import { getCoScoringContext } from '@/lib/coScoringContext';
import type { CoScored } from '@/lib/coScores';
import { getPoints } from '@/lib/points';
import { poolFor,tableOdds,type OddsTable } from '@/lib/coHunt';
import { withCoScores, withCoOpportunity } from '@/lib/coScores';
import Link from 'next/link';
import { huntHref } from '@/lib/huntSlug';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { residencyFields } from '@/lib/finder';
import { pct, pctOdds, int, range, WEAPON, antlerLabel, density, SPECIES_LABEL, TROPHY_LABEL } from '@/lib/format';
import { seasonsSummary, seasonRules } from '@/lib/tagSeasons';
import { objectiveSummary, OBJ_LABEL } from '@/lib/elkObjectives';
import { huntName } from '@/components/HuntTable';
import { ScoreBadge } from '@/components/HuntCards';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compare Hunts' };

type Row = { label: string; v: (r: HuntSummary) => number | null; show: (r: HuntSummary) => React.ReactNode; better?: 'high' | 'low' };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string; as?: string }> }) {
  const sp = await searchParams;
  const ids = (sp.ids ?? '').split(',').map((x) => decodeURIComponent(x)).filter(Boolean).slice(0, 4);
  const { residency } = await getResidency(sp.as);
  const nr = residency === 'NONRESIDENT';
  const rf = residencyFields(residency);
  const raw=await db.huntSummary.findMany({ where: { id: { in: ids } } });
  const context=raw.some(r=>r.state==='CO') ? await getCoScoringContext() : undefined;
  const found=raw.map(r=>r.state==='CO'?withCoScores(r,context):r);
  const coPoints=await getPoints('CO');
  const coOdds=(r:HuntSummary,mode:'proj'|'last')=>tableOdds(r.oddsByPts as unknown as OddsTable,mode,poolFor(coPoints.res==='NONRESIDENT',coPoints.youth),coPoints[r.species==='ELK'?'ELK':'DEER']);
  const hunts = ids.map((id) => found.find((h) => h.id === id)).filter((h): h is HuntSummary => !!h).map(r=>r.state==='CO'?withCoOpportunity(r,coOdds(r,'proj'),nr):r);

  const odds = (r: HuntSummary) => r.state==='CO'?coOdds(r,'proj'):(r.type === 'CONTROLLED' ? r[rf.odds5] : nr ? r.nrOdds5 : r.nrTag && r.capped ? null : 1);
  const rows: Row[] = [
    { label: 'Quality', v: (r) => r.scoreQuality, show: (r) => (r.scoreQuality === null ? '-' : <ScoreBadge v={r.scoreQuality} label="" />), better: 'high' },
    { label: 'Opportunity', v: (r) => (nr ? r.scoreOppNr : r.scoreOppRes), show: (r) => { const o = nr ? r.scoreOppNr : r.scoreOppRes; return o === null ? '-' : <ScoreBadge v={o} label="" />; }, better: 'high' },
    { label: hunts.some(r=>r.state==='CO')?'Your draw odds (CO: projected at saved points)':`${nr ? 'Nonresident' : 'Resident'} odds, 5-yr`, v: odds, show: (r) => (odds(r) === 1 && r.type !== 'CONTROLLED' ? 'Over the counter' : pctOdds(odds(r))), better: 'high' },
    { label: 'Latest drawing', v: (r) => (r.type === 'CONTROLLED' ? r[rf.oddsLast] : nr ? r.nrOddsLast : null), show: (r) => { const v = r.state==='CO'?coOdds(r,'last'):r.type === 'CONTROLLED' ? r[rf.oddsLast] : nr ? r.nrOddsLast : null; return v === null ? '-' : `${pctOdds(v)}${r.oddsLastYear ? ` (${r.oddsLastYear})` : ''}`; }, better: 'high' },
    { label: 'Draw and fill, per year', v: (r) => r.state==='CO' ? coOdds(r,'proj')===null||r.success5===null?null:coOdds(r,'proj')!*r.success5 : r[rf.tagAndFill], show: (r) => pct(r.state==='CO' ? coOdds(r,'proj')===null||r.success5===null?null:coOdds(r,'proj')!*r.success5 : r[rf.tagAndFill], 1), better: 'high' },
    { label: 'Hunter success, 5-yr', v: (r) => (r.smallSample ? null : r.success5), show: (r) => `${pct(r.success5)}${r.smallSample ? ' (small sample)' : ''}`, better: 'high' },
    { label: 'Latest season success', v: (r) => r.successLast, show: (r) => (r.successLast === null ? '-' : `${pct(r.successLast)}${r.harvestLastYear ? ` (${r.harvestLastYear})` : ''}`) },
    { label: 'Days hunted per animal', v: (r) => (r.smallSample ? null : r.daysPerHarvest5), show: (r) => (r.daysPerHarvest5 === null ? '-' : `${Math.round(r.daysPerHarvest5)} days`), better: 'low' },
    { label: 'Hunters per sq mi', v: (r) => r.huntersSqMi, show: (r) => density(r.huntersSqMi), better: 'low' },
    { label: 'Hunters per year', v: (r) => ((r as CoScored).coPressure?.status==='missing' ? null : (r as CoScored).coPressure?.totalHuntersPerYear ?? (r.hunters5 && r.harvestYears ? r.hunters5 / r.harvestYears : null)), show: (r) => ((r as CoScored).coPressure?.status==='missing' ? 'Unknown elk pressure' : (r as CoScored).coPressure?.status==='complete' ? `${int((r as CoScored).coPressure!.totalHuntersPerYear)} deer + elk` : r.hunters5 && r.harvestYears ? int(r.hunters5 / r.harvestYears) : '-') },
    { label: 'Tags', v: (r) => r.tags ?? r.quota, show: (r) => (r.type === 'CONTROLLED' ? `${int(r.tags)}${nr && r.nrPermitsLast !== null ? ` (${int(r.nrPermitsLast)} NR drew)` : ''}` : r.nrTag && r.quota !== null ? `${int(r.quota)} NR quota` : 'Unlimited') },
    { label: `${nr ? 'NR' : 'Resident'} 1st-choice applicants`, v: (r) => r[rf.appsLast], show: (r) => int(r[rf.appsLast]) },
    { label: 'Tags to 2nd choices', v: (r) => r.secondDrewLast, show: (r) => (r.secondDrewLast ? int(r.secondDrewLast) : '-') },
    { label: 'Public land', v: (r) => r.publicPct, show: (r) => (r.publicPct === null ? '-' : `${Math.round(r.publicPct)}%`), better: 'high' },
    { label: 'Public + Access Yes!', v: (r) => r.huntablePct, show: (r) => (r.huntablePct === null ? '-' : `${Math.round(r.huntablePct)}%`), better: 'high' },
    { label: 'Trophy share', v: (r) => r.bigPct5, show: (r) => (TROPHY_LABEL[r.species] ? `${pct(r.bigPct5)} ${TROPHY_LABEL[r.species]}` : '-'), better: 'high' },
  ];
  const best = (row: Row) => {
    if (!row.better) return null;
    const vals = hunts.map(row.v).filter((x): x is number => x !== null);
    if (vals.length < 2) return null;
    return row.better === 'high' ? Math.max(...vals) : Math.min(...vals);
  };

  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <p className="small"><Link href="/hunts">← Find A Hunt</Link></p>
      <h1>Compare Hunts</h1>
      {hunts.length < 2 ? (
        <p>Pick at least two hunts with the <b>Compare</b> box on any hunt card or table row, then come back here.</p>
      ) : (
        <>
        <p className="small muted">Odds for {nr ? 'nonresidents' : 'residents'}. Green = best of these {hunts.length}.</p>
        <div className="cmp-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <th />
                {hunts.map((h) => <th key={h.id}><Link href={huntHref(h)}>{huntName(h)}</Link></th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th>What</th>{hunts.map((h) => <td key={h.id}>{SPECIES_LABEL[h.species]} · {h.nrTag ? 'general tag' : h.type === 'CONTROLLED' ? 'controlled' : 'general season'} · {h.nrTag ? 'tag seasons' : WEAPON[h.weapon]} · {antlerLabel(h.species, h.antlerClass)}</td>)}</tr>
              <tr><th>Where</th>{hunts.map((h) => <td key={h.id}>{h.type === 'CONTROLLED' ? `Area ${h.areaName} · ` : ''}Units {h.units.join(', ')}</td>)}</tr>
              <tr><th>Seasons</th>{hunts.map((h) => <td key={h.id}>{seasonsSummary(h.tagSeasons, 4) || range(h.openDate, h.closeDate)}</td>)}</tr>
              <tr><th>Rules</th>{hunts.map((h) => <td key={h.id}>{seasonRules(h.tagSeasons, h.species).join(' · ') || '-'}</td>)}</tr>
              {rows.map((row) => {
                const b = best(row);
                return (
                  <tr key={row.label}>
                    <th>{row.label}</th>
                    {hunts.map((h) => <td key={h.id} className={b !== null && row.v(h) === b ? 'best' : ''}>{row.show(h)}</td>)}
                  </tr>
                );
              })}
              {hunts.some((h) => h.species === 'ELK') && (
                <tr><th>Elk vs objective</th>{hunts.map((h) => { const o = objectiveSummary(h.units); return <td key={h.id}>{h.species !== 'ELK' ? '-' : `Bulls ${o.bull.map((x) => OBJ_LABEL[x].split(' ')[0].toLowerCase()).join('/') || 'n/a'} · Cows ${o.cow.map((x) => OBJ_LABEL[x].split(' ')[0].toLowerCase()).join('/') || 'n/a'}`}</td>; })}</tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </main>
  );
}
