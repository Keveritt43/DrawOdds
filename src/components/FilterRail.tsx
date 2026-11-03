'use client';

import { useEffect, useRef, useState } from 'react';
import { ELK_ZONES, ELK_ZONE_NAMES } from '@/lib/elkZones';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Residency } from '@prisma/client';
import type { Draw } from '@/lib/species';

type Opt = [value: string, label: string];

const SPECIES: Opt[] = [['', 'All Species'], ['ELK', 'Elk'], ['DEER', 'Deer'], ['PRONGHORN', 'Pronghorn (controlled only)']];
const SPECIES_MSG: Opt[] = [['', 'All Three'], ['MOOSE', 'Moose'], ['BIGHORN', 'Bighorn Sheep'], ['GOAT', 'Mountain Goat']];
const SEX_MSG: Opt[] = [['ANTLERED', 'Bulls & rams (male)'], ['ANTLERLESS', 'Cows & ewes (female)'], ['EITHER', 'Either sex']];
const TYPES: Opt[] = [['', 'All Hunts'], ['CONTROLLED', 'Controlled Draw'], ['GENERAL', 'General Seasons']];
const TYPES_NR: Opt[] = [['', 'All Hunts'], ['CONTROLLED', 'Controlled Draw'], ['GENERAL', 'General Seasons (tag draw)']];
const NRTAG: Opt = ['NRTAG', 'General Tag Draw (Nonresident)'];
const WEAPONS: Opt[] = [['ANY', 'Any Weapon'], ['ARCHERY', 'Archery'], ['MUZZLELOADER', 'Muzzleloader'], ['SHORT_RANGE', 'Short Range']];
const ANTLER: Opt[] = [['ANTLERED', 'Bucks & bulls'], ['ANTLERLESS', 'Does & cows'], ['EITHER', 'Either-sex hunts only']];
const MONTHS: Opt[] = [['8', 'Aug'], ['9', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'], ['1', 'Jan']];
const DENSITY = [0, 8, 5, 3, 2, 1.5, 1, 0.5, 0.25]; // 0 = any; dragging right = fewer hunters, like the other sliders
const DEER: Opt[] = [['MULE', 'Mule Deer'], ['WHITETAIL', 'Whitetail'], ['MIXED', 'Mixed']];

/** goHunt-style rail: each section shows its current value and opens to edit. Every change updates the URL. */
export function FilterRail({ residency, draw = 'DEP' }: { residency: Residency; draw?: Draw }) {
  const msg = draw === 'MSG';
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const nr = residency === 'NONRESIDENT';

  const push = (patch: Record<string, string | string[] | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      const val = Array.isArray(v) ? v.join(',') : v;
      if (val === null || val === '') p.delete(k);
      else p.set(k, val);
    }
    p.delete('page');
    router.push(`/hunts${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const get = (k: string) => sp.get(k) ?? '';
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const toggle = (k: string, v: string) => {
    const cur = list(k);
    push({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const labelOf = (opts: Opt[], v: string) => opts.find((o) => o[0] === v)?.[1] ?? v;
  const sp_ = get('species');
  const moreSet = ['minBig', 'month', 'deerType', 'minPublic', 'minAccessYes', 'minHuntable', 'accessYes', 'minTags', 'youth', 'zone', 'unit', 'q'].some((k) => !!get(k));
  const many = (opts: Opt[], k: string, none: string) => (list(k).length ? list(k).map((v) => labelOf(opts, v)).join(', ') : none);

  const radio = (k: string, opts: Opt[]) => (
    <div className="checks2">
      {opts.map(([v, l]) => (
        <label key={v || 'all'}>
          <input type="radio" name={k} checked={get(k) === v} onChange={() => push({ [k]: v })} /> {l}
        </label>
      ))}
    </div>
  );
  const checks = (k: string, opts: Opt[]) => (
    <div className="checks2">
      {opts.map(([v, l]) => (
        <label key={v}>
          <input type="checkbox" checked={list(k).includes(v)} onChange={() => toggle(k, v)} /> {l}
        </label>
      ))}
    </div>
  );

  return (
    <aside className={`f-rail ${open ? 'open' : ''}`} aria-label="Filters">
      <div className="mobile-switch">
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>
      <div className="rsec-wrap">
        <Section title="Species" value={labelOf(msg ? SPECIES_MSG : SPECIES, sp_)} set={!!sp_} defaultOpen={!sp_}>
          {radio('species', msg ? SPECIES_MSG : SPECIES)}
          {msg && <p className="small muted" style={{ margin: '6px 0 0' }}>You can apply for only one of moose, bighorn sheep or mountain goat a year, and doing so keeps you out of the deer, elk and pronghorn controlled drawings that year (leftover tags aside).</p>}
        </Section>
        {!msg && <Section title="Hunt Type" value={labelOf(nr ? [...TYPES_NR, NRTAG] : TYPES, get('type'))} set={!!get('type')}>
          {radio('type', nr ? [...TYPES_NR, NRTAG] : TYPES)}
          {nr && <p className="small muted" style={{ margin: '6px 0 0' }}>Since 2026, nonresident general deer and elk tags are drawn: elk by zone (an A or a B tag), deer by unit. Both general options show those draw odds; &ldquo;General Tag Draw&rdquo; lists only the tags.</p>}
          {sp_ === 'PRONGHORN' && <p className="small muted" style={{ margin: '6px 0 0' }}>Pronghorn are controlled hunts only.</p>}
        </Section>}
        <Section title="Weapon" value={many(WEAPONS, 'weapon', 'All Weapons')} set={list('weapon').length > 0}>{checks('weapon', WEAPONS)}</Section>
        <Section title={msg ? 'Male Or Female' : sp_ === 'PRONGHORN' ? 'Bucks Or Does' : 'Bucks/Bulls Or Antlerless'} value={many(msg ? SEX_MSG : ANTLER, 'antler', 'Any')} set={list('antler').length > 0}>{checks('antler', msg ? SEX_MSG : ANTLER)}<p className="small muted" style={{ margin: '6px 0 0' }}>Either-sex hunts show under both, since you can take a male or a female on them.</p></Section>
        <Section title={`Draw Odds (${nr ? 'Nonresident' : 'Resident'})`} value={get('minOdds') ? `${get('minOdds')}% to 100%` : 'Any'} set={!!get('minOdds')}>
          <Slider value={Number(get('minOdds') || 0)} max={100} step={1} suffix="%" onCommit={(v) => push({ minOdds: v ? String(v) : null })} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>First choice, 5-year total. Hunts with no draw (resident general seasons) always show.</p>
        </Section>
        <Section title="Harvest Success" value={get('minSuccess') ? `${get('minSuccess')}%+` : 'Any'} set={!!get('minSuccess')}>
          <Slider value={Number(get('minSuccess') || 0)} max={100} step={5} suffix="%" onCommit={(v) => push({ minSuccess: v ? String(v) : null })} />
        </Section>
        <Section title="Crowding (Hunters Per Sq Mi)" value={get('maxDensity') ? `${get('maxDensity')} or fewer` : 'Any'} set={!!get('maxDensity')}>
          <StopSlider stops={DENSITY} value={Number(get('maxDensity') || 0)} onCommit={(v) => push({ maxDensity: v ? String(v) : null })} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>Average hunters per year for the hunt or season, per square mile. Under 0.5 is uncrowded. Controlled hunts count only their own hunters.</p>
        </Section>
        <details className="rmore" open={moreSet}>
          <summary>More Filters{moreSet ? ' (in use)' : ''}</summary>
          {!msg && sp_ !== 'PRONGHORN' && (
            <Section title="Trophy Potential" value={get('minBig') ? `${get('minBig')}%+` : 'Any'} set={!!get('minBig')}>
              <Slider value={Number(get('minBig') || 0)} max={100} step={5} suffix="%" onCommit={(v) => push({ minBig: v ? String(v) : null })} />
              <p className="small muted" style={{ margin: '6px 0 0' }}>Share of the antlered harvest that was 4+ point mule deer (deer) or 6+ point bulls (elk).</p>
            </Section>
          )}
          <Section title="Season Dates" value={many(MONTHS, 'month', 'Any Time')} set={list('month').length > 0}>
            {checks('month', MONTHS)}
            <p className="small muted" style={{ margin: '6px 0 0' }}>Hunts open at some point in the months you pick.</p>
          </Section>
          {!msg && (sp_ === '' || sp_ === 'DEER') && (
            <Section title="Deer: Mule Or Whitetail" value={many(DEER, 'deerType', 'Any')} set={list('deerType').length > 0}>
              {checks('deerType', DEER)}
              <p className="small muted" style={{ margin: '6px 0 0' }}>From 5 years of harvest: 60%+ whitetail = Whitetail, 40% or less = Mule Deer.</p>
            </Section>
          )}
          <Section title="Land Access" value={[get('minPublic') && `${get('minPublic')}%+ public`, get('minAccessYes') && `${get('minAccessYes')}%+ Access Yes!`, get('minHuntable') && `${get('minHuntable')}%+ huntable`].filter(Boolean).join(', ') || 'Any'} set={!!(get('minPublic') || get('minAccessYes') || get('minHuntable') || get('accessYes'))}>
            <label>Public Land</label>
            <Slider value={Number(get('minPublic') || 0)} max={100} step={5} suffix="%" onCommit={(v) => push({ minPublic: v ? String(v) : null })} />
            <label>Access Yes! (Private Land Open To Hunting)</label>
            <Slider value={Number(get('minAccessYes') || 0)} max={25} step={1} suffix="%" onCommit={(v) => push({ minAccessYes: v ? String(v) : null })} />
            <label>Huntable (Public + Access Yes!)</label>
            <Slider value={Number(get('minHuntable') || 0)} max={100} step={5} suffix="%" onCommit={(v) => push({ minHuntable: v ? String(v) : null })} />
            <div className="checks2" style={{ marginTop: 10 }}>
              <label><input type="checkbox" checked={get('accessYes') === '1'} onChange={() => push({ accessYes: get('accessYes') === '1' ? null : '1' })} /> Has Access Yes! land</label>
            </div>
          </Section>
          <Section title="Tags" value={get('minTags') ? `${get('minTags')}+ tags` : 'Any'} set={!!get('minTags')}>
            <Slider value={Number(get('minTags') || 0)} max={100} step={5} suffix="" onCommit={(v) => push({ minTags: v ? String(v) : null })} />
            <p className="small muted" style={{ margin: '6px 0 0' }}>Hide tiny hunts: 2-3 tag hunts swing hard on one applicant.</p>
          </Section>
          <Section title="Youth Hunts" value={{ exclude: 'Hidden', include: 'Included', only: 'Youth Only' }[(get('youth') || 'exclude') as 'exclude']} set={!!get('youth')}>
            {radio('youth', [['', 'Hide'], ['include', 'Include'], ['only', 'Youth Only']])}
          </Section>
          {!msg && (sp_ === '' || sp_ === 'ELK' || sp_ === 'DEER') && (
            <Section title="Elk Zones" value={list('zone').length ? list('zone').join(', ') : 'Any'} set={list('zone').length > 0}>
              <div className="checks2 zone-checks">
                {ELK_ZONE_NAMES.slice().sort().map((z) => (
                  <label key={z} title={`Units ${ELK_ZONES[z].join(', ')}`}>
                    <input type="checkbox" checked={list('zone').includes(z)} onChange={() => toggle('zone', z)} /> {z} <span className="small muted">({ELK_ZONES[z].join(', ')})</span>
                  </label>
                ))}
              </div>
              <p className="small muted" style={{ margin: '6px 0 0' }}>Shows the zones&apos; units with every hunt in them: pick the elk zone you&apos;re applying for and see the deer units that overlap.</p>
            </Section>
          )}
          <Section title="Unit / Search" value={[get('unit') && `Unit ${get('unit')}`, get('q')].filter(Boolean).join(' · ') || 'Any'} set={!!(get('unit') || get('q'))}>
            <TextField label="Unit" value={get('unit')} placeholder="e.g. 49 or 36A" onCommit={(v) => push({ unit: v.toUpperCase() || null })} />
            <TextField label="Hunt # Or Name" value={get('q')} placeholder="e.g. 2029" onCommit={(v) => push({ q: v || null })} />
          </Section>
        </details>
        <div style={{ padding: 16 }}>
          <a className="btn" href="/hunts" style={{ width: '100%', textAlign: 'center' }}>Clear All Filters</a>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, value, set, defaultOpen, children }: { title: string; value: string; set?: boolean; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="rsec" open={defaultOpen}>
      <summary>
        <span className="t">{title}</span>
        <span className={`v ${set ? 'set' : ''}`}>{value}<span className="edit" aria-hidden="true" /></span>
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}

/** Range slider that only updates the URL when you let go (not on every pixel of drag). */
function Slider({ value, max, step, suffix, onCommit }: { value: number; max: number; step: number; suffix: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    setV(value);
    committed.current = value;
  }, [value]);
  const commit = () => {
    if (v !== committed.current) {
      committed.current = v;
      onCommit(v);
    }
  };
  return (
    <div>
      <div style={{ textAlign: 'right', marginBottom: 4 }}><span className="slider-val">{v ? `${v}${suffix}+` : 'Any'}</span></div>
      <input type="range" min={0} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-valuetext={`${v}${suffix}`} />
      <div className="slider-ends"><span>Any</span><span>{max}{suffix}</span></div>
    </div>
  );
}

/** Maximum slider over fixed stops (skewed data), loosest to strictest: left end = Any. Commits on release. */
function StopSlider({ stops, value, onCommit }: { stops: number[]; value: number; onCommit: (v: number) => void }) {
  const idx = (v: number) => Math.max(0, stops.findIndex((s) => s > 0 && Math.abs(s - v) < 1e-9));
  const [i, setI] = useState(value ? idx(value) : 0);
  const committed = useRef(i);
  useEffect(() => {
    const n = value ? idx(value) : 0;
    setI(n);
    committed.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    if (i !== committed.current) {
      committed.current = i;
      onCommit(stops[i]);
    }
  };
  return (
    <div>
      <div style={{ textAlign: 'right', marginBottom: 4 }}><span className="slider-val">{stops[i] ? `${stops[i]} or fewer` : 'Any'}</span></div>
      <input type="range" min={0} max={stops.length - 1} step={1} value={i} onChange={(e) => setI(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-valuetext={stops[i] ? `${stops[i]} hunters per square mile or fewer` : 'Any'} />
      <div className="slider-ends"><span>Any</span><span>{stops[stops.length - 1]}</span></div>
    </div>
  );
}

function TextField({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onCommit(v.trim()); }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="search" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} aria-label={label} />
        <button className="btn" type="submit">Go</button>
      </div>
    </form>
  );
}
