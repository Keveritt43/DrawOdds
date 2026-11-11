'use client';
import { useState } from 'react';
import { MtComboPointsChart } from './MtCharts';
import { mtComboOdds, mtCutoff, mtDrawn, mtLatestYear, mtLicense, mtPointsToDraw, MT_POINTS_CAP } from '@/lib/mtOdds';

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;

function Verdict({ licenseKey, points }: { licenseKey: string; points: number }) {
  const o = mtComboOdds(licenseKey, points);
  const lic = mtLicense(licenseKey);
  if (!o || !lic) return null;
  const needed = mtPointsToDraw(licenseKey);
  const tone = o.basis === 'dead-zone' ? 'bad' : o.odds != null && o.odds >= 0.9 ? 'good' : 'mid';
  const bg = tone === 'bad' ? 'rgba(200,60,60,.10)' : tone === 'good' ? 'rgba(47,143,78,.12)' : 'rgba(235,104,52,.10)';
  return (
    <div className="card" style={{ background: bg }}>
      <h3 style={{ marginTop: 0 }}>{lic.shortName}</h3>
      {o.basis === 'dead-zone' ? (
        <>
          <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 6px' }}>No chance</p>
          <p className="small" style={{ margin: 0 }}>
            With {points} {points === 1 ? 'point' : 'points'} you missed the points phase in the {o.year} draw, and only applicants
            with <b>zero</b> points go into the random draw. {needed != null && <>It took <b>{needed}</b> points to draw in full.</>}{' '}
            Someone holding no points at all drew at {PCT(mtComboOdds(licenseKey, 0)?.odds ?? 0)}.
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 6px' }}>
            {o.odds == null ? 'Unavailable' : o.odds >= 1 ? 'Everyone drew' : PCT(o.odds)}
          </p>
          <p className="small" style={{ margin: 0 }}>
            {o.basis === 'random-zero' && <>Drawn at random from the quarter of licenses reserved for zero-point applicants, in the {o.year} draw.</>}
            {o.basis === 'at-cutoff' && <>This is the level the licenses ran out at in {o.year}: {o.level?.drawn.toLocaleString()} of {o.level?.apps.toLocaleString()} applicants drew.</>}
            {o.basis === 'above-cutoff' && <>Everyone holding {points} {points === 1 ? 'point' : 'points'} drew in {o.year}.</>}
          </p>
        </>
      )}
    </div>
  );
}

export function MtCombo() {
  const [points, setPoints] = useState(0);
  const licenses = ['biggame-elk', 'deer'];

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Your preference points</h3>
        <div role="group" aria-label="Your preference points" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Array.from({ length: MT_POINTS_CAP + 1 }, (_, p) => (
            <button
              key={p}
              type="button"
              className={points === p ? 'seg-btn active' : 'seg-btn'}
              aria-pressed={points === p}
              onClick={() => setPoints(p)}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                border: points === p ? '2px solid #2a78d6' : '1px solid rgba(128,128,128,.4)',
                fontWeight: points === p ? 700 : 400, background: points === p ? 'rgba(42,120,214,.12)' : 'transparent',
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Montana caps preference points at {MT_POINTS_CAP}. You lose them all if you draw, and also if you skip a year without
          buying a point. Party applications average their members&apos; points, so a party can sit between these numbers.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 20 }}>
        {licenses.map((k) => <Verdict key={k} licenseKey={k} points={points} />)}
      </div>

      {licenses.map((k) => {
        const lic = mtLicense(k);
        const year = mtLatestYear(k);
        const cut = mtCutoff(k);
        if (!lic || year == null) return null;
        return (
          <section key={k} style={{ marginBottom: 28 }}>
            <h2>{lic.name}</h2>
            {lic.note && <p className="small muted">{lic.note}</p>}
            <MtComboPointsChart licenseKey={k} title={`${year} draw — chance by preference points`} myPoints={points} />
            <table className="data" style={{ marginTop: 12, width: '100%' }}>
              <caption className="small muted" style={{ captionSide: 'bottom', textAlign: 'left', paddingTop: 6 }}>
                {year} draw. {mtDrawn(k, year)?.toLocaleString()} licenses issued to {lic.years[String(year)].totalApps.toLocaleString()} first-choice applicants
                {cut && <> · licenses ran out at <b>{cut.label}</b> points</>}.
              </caption>
              <thead>
                <tr><th scope="col">Preference points</th><th scope="col">Applicants</th><th scope="col">Drew</th><th scope="col">Chance</th></tr>
              </thead>
              <tbody>
                {lic.years[String(year)].levels.map((l) => (
                  <tr key={l.label}>
                    <th scope="row">{l.label}</th>
                    <td>{l.apps.toLocaleString()}</td>
                    <td>{l.apps === 0 ? '—' : l.drawn.toLocaleString()}</td>
                    <td>{l.pct == null ? 'No applicants' : l.pct === 0 ? <b>0% — nobody drew</b> : `${l.pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
