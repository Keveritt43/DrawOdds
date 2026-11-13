'use client';

import { startTransition, useActionState, useState } from 'react';
import type React from 'react';
import { saveHuntingPreferences } from '@/app/actions';
import type { Residency } from '@prisma/client';
import type { StatePoints } from '@/lib/points';
import { POINT_SPECIES, SPECIAL_POINT_SPECIES } from '@/lib/states';
import { SPECIES_LABEL } from '@/lib/format';
import Link from 'next/link';
import { MT_BONUS_MAX, MT_BONUS_TYPES, MT_COMBO_CAP, MT_COMBO_TYPES, type MtComboType, type MtPoints } from '@/lib/mtPoints';
import { UT_POINTS_MAX, UT_POINT_TYPES, type UtPoints } from '@/lib/utPoints';
import { WA_POINTS_MAX, WA_POINT_TYPES, WA_DEER_TAGS, WA_ELK_TAGS, type WaPoints } from '@/lib/waPoints';

const resLabel = (r: Residency) => (r === 'RESIDENT' ? 'Resident' : 'Nonresident');

/** One state's settings, collapsed to a line saying what's saved; `open` starts it expanded. */
function StateBox({ name, line, open, children }: { name: string; line: string; open: boolean; children: React.ReactNode }) {
  return (
    <details className="acct-state" open={open}>
      <summary><b>{name}</b><span className="small muted">{line}</span></summary>
      <fieldset aria-label={name}>{children}</fieldset>
    </details>
  );
}

/** `openState`: the state the site is set to starts expanded; the others are one line each. */
export function HuntingPreferences({ idaho, colorado, wyoming, montana, utah, washington, openState }: { idaho: Residency; colorado: StatePoints; wyoming?: StatePoints; montana?: MtPoints; utah?: UtPoints; washington?: WaPoints; openState?: string }) {
  const [result, save, pending] = useActionState(saveHuntingPreferences, { message: '', saved: false });
  const [idahoResidency, setIdahoResidency] = useState(idaho);
  const [coloradoResidency, setColoradoResidency] = useState(colorado.res);
  const [points, setPoints] = useState({ DEER: String(colorado.DEER), ELK: String(colorado.ELK), PRONGHORN: String(colorado.PRONGHORN) });
  const [youth, setYouth] = useState(colorado.youth);
  const [special, setSpecial] = useState(Object.fromEntries(SPECIAL_POINT_SPECIES.map(s => [s, String(colorado[s] ?? 0)])));
  const [wyResidency, setWyResidency] = useState(wyoming?.res ?? 'NONRESIDENT');
  const [wyPoints, setWyPoints] = useState({ DEER: String(wyoming?.DEER ?? 0), ELK: String(wyoming?.ELK ?? 0), PRONGHORN: String(wyoming?.PRONGHORN ?? 0) });
  const [wySpecial, setWySpecial] = useState(wyoming?.wySpecial === true);
  const [mtResidency, setMtResidency] = useState<Residency>(montana?.res ?? 'NONRESIDENT');
  const [mtCombo, setMtCombo] = useState(String(montana?.combo ?? 0));
  const [mtComboType, setMtComboType] = useState<MtComboType>(montana?.comboType ?? 'BIG_GAME');
  const [mtBonus, setMtBonus] = useState(Object.fromEntries(MT_BONUS_TYPES.map(t => [t.key, String(montana?.bonus[t.key] ?? 0)])));
  const [mtBuying, setMtBuying] = useState(Object.fromEntries(MT_BONUS_TYPES.map(t => [t.key, montana?.buying[t.key] ?? true])));
  const [utResidency, setUtResidency] = useState<Residency>(utah?.res ?? 'NONRESIDENT');
  const [utPts, setUtPts] = useState(Object.fromEntries(UT_POINT_TYPES.map(t => [t.key, String(utah?.points[t.key] ?? 0)])));
  const [waResidency, setWaResidency] = useState<Residency>(washington?.res ?? 'NONRESIDENT');
  const [waPts, setWaPts] = useState(Object.fromEntries(WA_POINT_TYPES.map(t => [t.key, String(washington?.points[t.key] ?? 0)])));
  const [waDeerTag, setWaDeerTag] = useState<string>(washington?.deerTag ?? '');
  const [waElkTag, setWaElkTag] = useState<string>(washington?.elkTag ?? '');
  const [weighted, setWeighted] = useState(Object.fromEntries(SPECIAL_POINT_SPECIES.map(s => [s, String(colorado.weighted?.[s] ?? 0)])));
  const n = (v: string) => (v === '' ? '?' : v);
  const lines = {
    ID: resLabel(idahoResidency),
    CO: `${resLabel(coloradoResidency)} · deer ${n(points.DEER)}, elk ${n(points.ELK)}, pronghorn ${n(points.PRONGHORN)} pts`,
    WY: `${resLabel(wyResidency)}${wyResidency === 'NONRESIDENT' ? ` · deer ${n(wyPoints.DEER)}, elk ${n(wyPoints.ELK)}, antelope ${n(wyPoints.PRONGHORN)} pts${wySpecial ? ' · special pool' : ''}` : ''}`,
    MT: `${resLabel(mtResidency)}${mtResidency === 'NONRESIDENT' ? ` · combination ${n(mtCombo)} pts` : ''} · ${MT_BONUS_TYPES.filter((t) => Number(mtBonus[t.key]) > 0).length} bonus balances`,
    UT: `${resLabel(utResidency)} · ${UT_POINT_TYPES.filter((t) => Number(utPts[t.key]) > 0).map((t) => `${t.key === 'LE_DEER' ? 'LE deer' : t.key === 'LE_ELK' ? 'LE elk' : t.key === 'GEN_DEER' ? 'general deer' : t.key === 'LE_PRONGHORN' ? 'pronghorn' : 'bison'} ${utPts[t.key]}`).join(', ') || 'no points'}`,
    WA: `${resLabel(waResidency)} · ${WA_POINT_TYPES.filter((t) => Number(waPts[t.key]) > 0).map((t) => `${t.label.toLowerCase()} ${waPts[t.key]}`).join(', ') || 'no points'}`,
  };
  return (
    <form className="card account-preferences" action={save} id="hunting-preferences"
      // a field the browser rejects may sit in a collapsed state: open it so the browser can point at it
      onInvalidCapture={event => (event.target as HTMLElement).closest('details')?.setAttribute('open', '')}
      onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      // Dispatch directly so React does not reset the residency menus after saving.
      startTransition(() => save(values));
    }}>
      <h2>Hunting Preferences</h2>
      <p className="small muted">Draw odds and rankings use the residency and points you save here. Tap a state to change it.</p>
      <StateBox name="Idaho" line={lines.ID} open={openState === 'ID'}>
        <label>Residency
          <select name="idahoResidency" value={idahoResidency} onChange={e => setIdahoResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
      </StateBox>
      <StateBox name="Colorado" line={lines.CO} open={openState === 'CO'}>
        <label>Residency
          <select name="coloradoResidency" value={coloradoResidency} onChange={e => setColoradoResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <div className="account-points">
          {POINT_SPECIES.CO?.map(species => (
            <label key={species}>{SPECIES_LABEL[species]} points
              <input type="number" name={species} min={0} max={40} step={1} required value={points[species]}
                onChange={e => setPoints({ ...points, [species]: e.target.value })} />
            </label>
          ))}
        </div>
        <h3>Moose, Sheep &amp; Goat Points</h3>
        <p className="small muted">Track regular preference points (0–3) and weighted points separately. Saved values select the matching point-level draw results. Desert bighorn sheep does not use points.</p>
        <div className="account-special-points">
          {SPECIAL_POINT_SPECIES.map(species => <div key={species}>
            <b>{species === 'BIGHORN' ? 'Rocky Mountain Bighorn Sheep' : SPECIES_LABEL[species]}</b>
            <div className="account-points">
              <label>{SPECIES_LABEL[species]} preference points<input type="number" name={species} min={0} max={3} step={1} required value={special[species]} onChange={e => setSpecial({ ...special, [species]: e.target.value })} /></label>
              <label>{SPECIES_LABEL[species]} weighted points<input type="number" name={species + '_weighted'} min={0} max={40} step={1} required value={weighted[species]} onChange={e => setWeighted({ ...weighted, [species]: e.target.value })} /></label>
            </div>
          </div>)}
        </div>
        <label className="account-youth"><input type="checkbox" name="youth" checked={youth} onChange={e => setYouth(e.target.checked)} /> Youth draw results</label>
      </StateBox>
      <StateBox name="Wyoming" line={lines.WY} open={openState === 'WY'}>
        <label>Residency
          <select name="wyomingResidency" value={wyResidency} onChange={e => setWyResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <p className="small muted">Nonresident preference points (residents draw at random for these species).</p>
        <div className="account-points">
          {POINT_SPECIES.WY?.map(species => (
            <label key={species}>{species === 'PRONGHORN' ? 'Antelope' : SPECIES_LABEL[species]} points
              <input type="number" name={`wy${species}`} min={0} max={40} step={1} required value={wyPoints[species]}
                onChange={e => setWyPoints({ ...wyPoints, [species]: e.target.value })} />
            </label>
          ))}
        </div>
        <label className="account-youth"><input type="checkbox" name="wySpecial" checked={wySpecial} onChange={e => setWySpecial(e.target.checked)} /> Apply in the nonresident special pool (higher license fee, separate quota)</label>
      </StateBox>
      {montana && <StateBox name="Montana" line={lines.MT} open={openState === 'MT'}>
        <label>Residency
          <select name="mtResidency" value={mtResidency} onChange={e => setMtResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <h3>Combination License Preference Points</h3>
        <p className="small muted">
          The draw every nonresident needs before hunting deer or elk. One balance, {MT_COMBO_CAP} at most. You lose
          it when you draw, and also if you hold points and don&apos;t apply in the next drawing (buying a point-only
          doesn&apos;t save it). Applicants with <b>some</b> points but fewer than the cutoff have drawn <b>nothing</b> since 2022.{' '}
          <Link href="/montana">See why</Link>.
        </p>
        <div className="account-points">
          <label>Combination you apply for
            <select name="mtComboType" value={mtComboType} disabled={mtResidency === 'RESIDENT'} onChange={e => setMtComboType(e.target.value as MtComboType)}>
              {MT_COMBO_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label>Combination preference points
            <input type="number" name="mtCombo" min={0} max={MT_COMBO_CAP} step={1} required value={mtCombo}
              disabled={mtResidency === 'RESIDENT'} onChange={e => setMtCombo(e.target.value)} />
          </label>
        </div>
        {mtResidency === 'NONRESIDENT' && <p className="small muted">
          Big Game and Elk combinations are one drawing; the Deer combination is a separate one with its own odds. A deer
          permit needs Big Game or Deer, an elk permit Big Game or Elk. Your odds for a permit include this draw.
        </p>}
        {mtResidency === 'RESIDENT' && <>
          <input type="hidden" name="mtCombo" value={mtCombo} />
          <input type="hidden" name="mtComboType" value={mtComboType} />
          <p className="small muted">Residents buy general deer and elk licenses over the counter, so this balance isn&apos;t used.</p>
        </>}
        <h3>Bonus Points (Permits &amp; B Licenses)</h3>
        <p className="small muted">
          A separate balance for each license type. Your saved points <b>only count in a drawing if you buy a bonus point
          with that application</b>; otherwise you keep them, but enter with a single chance that year.
        </p>
        <div className="account-special-points">
          {MT_BONUS_TYPES.map(({ key, label }) => <div key={key}>
            <b>{label}</b>
            <div className="account-points">
              <label>Bonus points
                <input type="number" name={'mtBonus_' + key} min={0} max={MT_BONUS_MAX} step={1} required value={mtBonus[key]}
                  onChange={e => setMtBonus({ ...mtBonus, [key]: e.target.value })} />
              </label>
              <label className="account-youth"><input type="checkbox" name={'mtBuy_' + key} checked={mtBuying[key]}
                onChange={e => setMtBuying({ ...mtBuying, [key]: e.target.checked })} /> Buying a point this year</label>
            </div>
          </div>)}
        </div>
      </StateBox>}
      {utah && <StateBox name="Utah" line={lines.UT} open={openState === 'UT'}>
        <label>Residency
          <select name="utResidency" value={utResidency} onChange={e => setUtResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <p className="small muted">
          Limited-entry deer and elk use <b>bonus points</b>: half the permits go to the most points, the rest are drawn with
          one chance plus one per point, so zero points can still draw. General buck deer uses <b>preference points</b>, a
          strict line. Pronghorn and bison are bonus-point draws too, each with its own balance. Points are lost only when you draw;
          drawing limited-entry buck deer or bull elk starts a 5-year wait, buck pronghorn 2 years, and bison is once in a lifetime.
        </p>
        <div className="account-points">
          {UT_POINT_TYPES.map(({ key, label, kind }) => <label key={key}>{label} ({kind} points)
            <input type="number" name={'utPts_' + key} min={0} max={UT_POINTS_MAX} step={1} required value={utPts[key]}
              onChange={e => setUtPts({ ...utPts, [key]: e.target.value })} />
          </label>)}
        </div>
      </StateBox>}
      {washington && <StateBox name="Washington" line={lines.WA} open={openState === 'WA'}>
        <label>Residency
          <select name="waResidency" value={waResidency} onChange={e => setWaResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <p className="small muted">
          Special permits and multi-season tags are one <b>weighted drawing</b> per category: you get your points plus this
          year&apos;s, squared, in entries (2 points held = 9 entries), so zero points can still draw. Points are kept per
          category and reset when you draw. Residents and nonresidents are in the same drawing. Enter the points you hold now.
        </p>
        <div className="account-points">
          {WA_POINT_TYPES.map(({ key, label }) => <label key={key}>{label} points
            <input type="number" name={'waPts_' + key} min={0} max={WA_POINTS_MAX} step={1} required value={waPts[key]}
              onChange={e => setWaPts({ ...waPts, [key]: e.target.value })} />
          </label>)}
        </div>
        <p className="small muted">Your general tag decides which special permits you can apply for (weapon, and for elk the side of the state).</p>
        <div className="account-points">
          <label>Deer tag
            <select name="waDeerTag" value={waDeerTag} onChange={e => setWaDeerTag(e.target.value)}>
              <option value="">Not chosen</option>
              {WA_DEER_TAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label>Elk tag
            <select name="waElkTag" value={waElkTag} onChange={e => setWaElkTag(e.target.value)}>
              <option value="">Not chosen</option>
              {WA_ELK_TAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
      </StateBox>}
      <div className="account-save">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Preferences'}</button>
        <span role={result.message && !result.saved ? 'alert' : 'status'}>{result.message}</span>
      </div>
    </form>
  );
}
