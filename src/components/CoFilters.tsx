'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { pointRange } from '@/lib/pointRange';
import { DAY_MIN, DAY_MAX, parseMonthDay, toMonthDay } from "@/lib/seasonDays";
import { DateRange as DateSlider, Section } from './FilterRail';

type Opt = [value: string, label: string];
const SPECIES: Opt[] = [
  ['DEER', 'Deer'],
  ['ELK', 'Elk'],
];
const METHOD: Opt[] = [
  ['R', 'Rifle'],
  ['A', 'Archery'],
  ['M', 'Muzzleloader'],
];
const SEX: Opt[] = [
  ["ANTLERED", "Antlered"],
  ["ANTLERLESS", "Antlerless"],
];
const SEASON: Opt[] = [
  ['1', '1st rifle'],
  ['2', '2nd rifle'],
  ['3', '3rd rifle'],
  ['4', '4th rifle'],
  ['E', 'Early'],
  ['L', 'Late'],
  ['K', 'Youth only'],
];
export const CHANCES: Opt[] = [
  ['sure', 'Sure'],
  ['likely', 'Likely (60%+)'],
  ['possible', 'Possible (30-60%)'],
  ['longshot', 'Long shot'],
  ['none', 'No chance'],
];

/** Colorado's filter rail: the draw at your points first, then the hunt itself. Every change updates the URL. */
export function CoFilters({ nr, points, speciesLabel }: { nr: boolean; points: number; speciesLabel: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
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
  const list = (k: string) =>
    (get(k) || (k === "antler" ? "ANTLERED" : "")).split(',').filter((x) => !!x && x !== "ALL");
  const toggle = (k: string, v: string) => {
    const next = list(k).includes(v) ? list(k).filter((x) => x !== v) : [...list(k), v];
    push({ [k]: k === "antler" && !next.length ? "ALL" : next });
  };
  const many = (opts: Opt[], k: string, none: string) =>
    list(k).length
      ? list(k)
          .map((v) => opts.find((o) => o[0] === v)?.[1] ?? v)
          .join(', ')
      : none;
  const checks = (k: string, opts: Opt[]) => (
    <div className="checks2">
      {opts.map(([v, l]) => (
        <label key={v}>
          <input type="checkbox" checked={list(k).includes(v)} onChange={() => toggle(k, v)} /> {l}
        </label>
      ))}
    </div>
  );
  const flag = (k: string, label: string, on = '1') => (
    <label>
      <input type="checkbox" checked={get(k) === on} onChange={() => push({ [k]: get(k) === on ? null : on })} /> {label}
    </label>
  );
  const range = pointRange(get('minPts'), get('maxPts'));
  const sp_ = get('species') || 'DEER';
  return (
    <aside className={`f-rail ${open ? 'open' : ''}`} aria-label="Filters">
      <div className="mobile-switch">
        <button className="btn" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>
      {[...sp.keys()].some((k) => !['sort', 'page', 'odds'].includes(k)) && (
        <div className="rail-reset">
          <a href="/hunts?reset=1">Reset all filters</a>
        </div>
      )}
      <div className="rsec-wrap">
        <Section title="Species" value={SPECIES.find((s) => s[0] === sp_)?.[1] ?? 'Deer'} set={!!get('species')} defaultOpen>
          <div className="checks2">
            {SPECIES.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="co-species" checked={sp_ === v} onChange={() => push({ species: v === 'DEER' ? null : v })} /> {l}
              </label>
            ))}
          </div>
        </Section>
        <Section title="License Type" value={get('type') || 'All'} set={!!get('type')}>
          <div className="checks2">
            {[
              ["", "All"],
              ["CONTROLLED", "Controlled Draw"],
              ["GENERAL", "General / OTC"],
            ].map(([value, label]) => (
              <label key={value}>
                <input type="radio" name="co-license-type" checked={get('type') === value} onChange={() => push({ type: value || null })} />
                {label}
              </label>
            ))}
          </div>
        </Section>
        {sp_ === 'DEER' && <Section title="Overlapping Elk" value={get('otcElk') === '1' ? 'OTC elk' : 'Any'} set={get('otcElk') === '1'}>{flag('otcElk', 'Only deer hunts overlapping OTC elk in the same unit')}</Section>}
        <Section title="Method" value={many(METHOD, 'method', 'All')} set={list('method').length > 0}>
          {checks('method', METHOD)}
        </Section>
        <Section
          title={`Draw At My Points (${points} ${speciesLabel})`}
          value={many(CHANCES, 'chance', 'Any')}
          set={list('chance').length > 0}
          defaultOpen
        >
          {checks('chance', CHANCES)}
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            {nr ? 'Nonresident' : 'Resident'}, first choice, {get('odds') === 'last' ? 'last draw' : 'next draw (projected)'}. Change your
            points in the header.
          </p>
        </Section>
        <Section
          title={`Points Needed (${nr ? 'Nonres' : 'Res'}, last draw)`}
          value={get('minPts') || get('maxPts') ? `${get('minPts') || 0}–${get('maxPts') || 40}` : 'Any'}
          set={!!(get('minPts') || get('maxPts'))}
        >
          <PointRangeSlider
            min={range.min ?? 0}
            max={range.max ?? 40}
            onCommit={(min, max) => push({ minPts: min === 0 ? null : String(min), maxPts: max === 40 ? null : String(max) })}
          />
        </Section>
        <Section
          title="Season Dates"
          value={
            get("from") && get("to")
              ? get("from") + " – " + get("to")
              : "Any Time"
          }
          set={!!get("from")}
        >
          <DateSlider
            from={parseMonthDay(get("from")) ?? DAY_MIN}
            to={parseMonthDay(get("to")) ?? DAY_MAX}
            mode={get("dmode") === "end" ? "end" : "open"}
            onCommit={(a, b, mode) =>
              push(
                a === DAY_MIN && b === DAY_MAX
                  ? { from: null, to: null, dmode: null }
                  : {
                      from: toMonthDay(a),
                      to: toMonthDay(b),
                      dmode: mode === "end" ? "end" : null,
                    },
              )
            }
          />
        </Section>
        <Section
          title="Land Access"
          value={get("minPublic") ? get("minPublic") + "%+ public" : "Any"}
          set={!!get("minPublic")}
        >
          <label>
            Public land %
            <input
              aria-label="Minimum public land percent"
              type="range"
              min="0"
              max="100"
              step="5"
              defaultValue={get("minPublic") || "0"}
              key={get("minPublic")}
              onPointerUp={(e) =>
                push({
                  minPublic:
                    e.currentTarget.value === "0"
                      ? null
                      : e.currentTarget.value,
                })
              }
              onKeyUp={(e) =>
                push({
                  minPublic:
                    e.currentTarget.value === "0"
                      ? null
                      : e.currentTarget.value,
                })
              }
            />
          </label>
          <p className="small muted">
            Public ownership, not guaranteed legal access. Colorado has no
            Access Yes! component.
          </p>
        </Section>
        <Section
          title="Youth Hunts"
          value={get("youth") || "Hidden"}
          set={!!get("youth")}
        >
          <div className="checks2">
            {[
              ["", "Hide"],
              ["include", "Include"],
              ["only", "Youth Only"],
            ].map(([v, l]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="co-youth"
                  checked={get("youth") === v}
                  onChange={() => push({ youth: v || null })}
                />
                {l}
              </label>
            ))}
          </div>
        </Section>
        <Section
          title="Harvest Success"
          value={get("minSucc") ? `${get('minSucc')}%+` : "Any"}
          set={!!get("minSucc")}
        >
          <div className="checks2">
            {['', '30', '50', '70'].map((v) => (
              <label key={v || 'any'}>
                <input type="radio" name="co-succ" checked={get('minSucc') === v} onChange={() => push({ minSucc: v || null })} />{' '}
                {v ? `${v}%+` : 'Any'}
              </label>
            ))}
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Up to 5 seasons of CPW harvest estimates for the hunt code (or its units and season before 2025).
          </p>
        </Section>
        <Section
          title="Choice & Draw"
          value={
            [get('second') && '2nd choice', get('hybrid') && 'Hybrid', get('priv') && 'Private land shown'].filter(Boolean).join(', ') ||
            'Any'
          }
          set={!!(get('second') || get('hybrid') || get('priv'))}
        >
          <div className="checks2">
            {flag('second', 'Drew as a 2nd choice (keeps your points)')}
            {flag('hybrid', 'Has a hybrid draw (random draw for 5+ points)')}
            {flag('priv', 'Include private-land-only and Ranching for Wildlife')}
          </div>
        </Section>

        <Section
          title="Antler Class"
          value={many(SEX, "antler", "Any")}
          set={list("antler").length > 0}
        >
          {checks("antler", SEX)}
          <p className="small muted">Either-sex hunts match both selections.</p>
        </Section>
        <Section title="Season" value={many(SEASON, 'season', 'Any')} set={list('season').length > 0}>
          {checks('season', SEASON)}
        </Section>
        <Section title="Unit" value={get('unit') ? `Unit ${get('unit')}` : 'Any'} set={!!get('unit')}>
          <UnitField value={get('unit')} onCommit={(v) => push({ unit: v })} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Or tap a unit on the map.
          </p>
        </Section>
      </div>
      {open && (
        <div className="rail-done">
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setOpen(false);
              document.querySelector('.f-list')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Show Results
          </button>
        </div>
      )}
    </aside>
  );
}

function PointRangeSlider({ min, max, onCommit }: { min: number; max: number; onCommit: (min: number, max: number) => void }) {
  const [low, setLow] = useState(min),
    [high, setHigh] = useState(max);
  useEffect(() => {
    setLow(min);
    setHigh(max);
  }, [min, max]);
  const commit = () => onCommit(low, high);
  return (
    <div>
      <div className="slider-val">
        {low}–{high} points
      </div>
      <label className="small">
        Minimum points needed
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={low}
          onChange={(e) => setLow(Math.min(high, Number(e.target.value)))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          aria-label="Minimum points needed"
        />
      </label>
      <label className="small">
        Maximum points needed
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={high}
          onChange={(e) => setHigh(Math.max(low, Number(e.target.value)))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          aria-label="Maximum points needed"
        />
      </label>
      <div className="slider-ends">
        <span>0</span>
        <span>40</span>
      </div>
    </div>
  );
}

function UnitField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(v.trim());
      }}
      style={{ display: 'flex', gap: 6 }}
    >
      <input
        type="text"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="70"
        aria-label="Unit number"
        style={{ width: 90 }}
      />
      <button className="btn" type="submit">
        Go
      </button>
      {value && (
        <button className="btn" type="button" onClick={() => onCommit('')}>
          Clear
        </button>
      )}
    </form>
  );
}
