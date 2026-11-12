'use client';

import { startTransition, useActionState, useState } from 'react';
import { saveHuntingPreferences } from '@/app/actions';
import type { Residency } from '@prisma/client';
import type { StatePoints } from '@/lib/points';
import { POINT_SPECIES, SPECIAL_POINT_SPECIES } from '@/lib/states';
import { SPECIES_LABEL } from '@/lib/format';
import Link from 'next/link';
import { MT_BONUS_MAX, MT_BONUS_TYPES, MT_COMBO_CAP, MT_COMBO_TYPES, type MtComboType, type MtPoints } from '@/lib/mtPoints';
import { UT_POINTS_MAX, UT_POINT_TYPES, type UtPoints } from '@/lib/utPoints';

export function HuntingPreferences({ idaho, colorado, wyoming, montana, utah }: { idaho: Residency; colorado: StatePoints; wyoming?: StatePoints; montana?: MtPoints; utah?: UtPoints }) {
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
  const [weighted, setWeighted] = useState(Object.fromEntries(SPECIAL_POINT_SPECIES.map(s => [s, String(colorado.weighted?.[s] ?? 0)])));
  return (
    <form className="card account-preferences" action={save} id="hunting-preferences" onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      // Dispatch directly so React does not reset the residency menus after saving.
      startTransition(() => save(values));
    }}>
      <h2>Hunting Preferences</h2>
      <p className="small muted">Draw odds and rankings use the residency and points you save here.</p>
      <fieldset>
        <legend>Idaho</legend>
        <label>Residency
          <select name="idahoResidency" value={idahoResidency} onChange={e => setIdahoResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Colorado</legend>
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
      </fieldset>
      <fieldset>
        <legend>Wyoming</legend>
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
      </fieldset>
      {montana && <fieldset>
        <legend>Montana</legend>
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
      </fieldset>}
      {utah && <fieldset>
        <legend>Utah</legend>
        <label>Residency
          <select name="utResidency" value={utResidency} onChange={e => setUtResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <p className="small muted">
          Limited-entry deer and elk use <b>bonus points</b>: half the permits go to the most points, the rest are drawn with
          one chance plus one per point, so zero points can still draw. General buck deer uses <b>preference points</b>, a
          strict line. Points are lost only when you draw; drawing limited-entry buck deer or bull elk starts a 5-year wait.
        </p>
        <div className="account-points">
          {UT_POINT_TYPES.map(({ key, label, kind }) => <label key={key}>{label} ({kind} points)
            <input type="number" name={'utPts_' + key} min={0} max={UT_POINTS_MAX} step={1} required value={utPts[key]}
              onChange={e => setUtPts({ ...utPts, [key]: e.target.value })} />
          </label>)}
        </div>
      </fieldset>}
      <div className="account-save">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Preferences'}</button>
        <span role={result.message && !result.saved ? 'alert' : 'status'}>{result.message}</span>
      </div>
    </form>
  );
}
