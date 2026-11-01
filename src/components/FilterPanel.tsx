import type { Residency } from '@prisma/client';
import type { Filters } from '@/lib/finder';
import { AutoSubmit } from './AutoSubmit';

const Chip = ({ name, value, checked, label, type = 'checkbox' }: { name: string; value: string; checked: boolean; label: string; type?: string }) => (
  <label>
    <input type={type} name={name} value={value} defaultChecked={checked} /> {label}
  </label>
);

export function FilterPanel({ f, residency }: { f: Filters; residency: Residency }) {
  const nr = residency === 'NONRESIDENT';
  return (
    <aside className="card filters">
      <AutoSubmit action="/">
        <fieldset>
          <legend>Search</legend>
          <input type="text" name="q" defaultValue={f.q} placeholder="Hunt #, area, or name" aria-label="Search hunts" />
        </fieldset>
        <fieldset>
          <legend>Species</legend>
          <div className="chips">
            <Chip type="radio" name="species" value="" checked={!f.species} label="Both" />
            <Chip type="radio" name="species" value="DEER" checked={f.species === 'DEER'} label="Deer" />
            <Chip type="radio" name="species" value="ELK" checked={f.species === 'ELK'} label="Elk" />
          </div>
        </fieldset>
        <fieldset>
          <legend>Hunt type</legend>
          <div className="chips">
            <Chip type="radio" name="type" value="" checked={!f.type} label="All" />
            <Chip type="radio" name="type" value="CONTROLLED" checked={f.type === 'CONTROLLED'} label="Controlled (draw)" />
            <Chip type="radio" name="type" value="GENERAL" checked={f.type === 'GENERAL'} label="General (OTC)" />
          </div>
        </fieldset>
        <fieldset>
          <legend>Weapon</legend>
          <div className="chips">
            {(['ANY', 'ARCHERY', 'MUZZLELOADER', 'SHORT_RANGE'] as const).map((w) => (
              <Chip key={w} name="weapon" value={w} checked={f.weapon.includes(w)} label={{ ANY: 'Any weapon', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader', SHORT_RANGE: 'Short range' }[w]} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Antlered / antlerless</legend>
          <div className="chips">
            <Chip name="antler" value="ANTLERED" checked={f.antler.includes('ANTLERED')} label="Antlered" />
            <Chip name="antler" value="ANTLERLESS" checked={f.antler.includes('ANTLERLESS')} label="Antlerless" />
            <Chip name="antler" value="EITHER" checked={f.antler.includes('EITHER')} label="Either sex" />
          </div>
        </fieldset>
        <fieldset>
          <legend>Season (open during)</legend>
          <div className="chips">
            {[[8, 'Aug'], [9, 'Sep'], [10, 'Oct'], [11, 'Nov'], [12, 'Dec'], [1, 'Jan']].map(([m, l]) => (
              <Chip key={m} name="month" value={String(m)} checked={f.months.includes(Number(m))} label={String(l)} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Deer: mule deer or whitetail</legend>
          <div className="chips">
            <Chip name="deerType" value="MULE" checked={f.deerType.includes('MULE')} label="Mule deer" />
            <Chip name="deerType" value="WHITETAIL" checked={f.deerType.includes('WHITETAIL')} label="Whitetail" />
            <Chip name="deerType" value="MIXED" checked={f.deerType.includes('MIXED')} label="Mixed" />
          </div>
          <div className="small muted">From 5 years of harvest: 60%+ whitetail = Whitetail, 40% or less = Mule deer.</div>
        </fieldset>
        <fieldset>
          <legend>Minimum {nr ? 'nonresident' : 'resident'} draw odds (5-yr)</legend>
          <select name="minOdds" defaultValue={f.minOdds ?? ''}>
            <option value="">Any</option>
            {[2, 5, 10, 20, 35, 50, 75].map((v) => <option key={v} value={v}>{v}%+</option>)}
          </select>
        </fieldset>
        <fieldset>
          <legend>Minimum hunter success (5-yr)</legend>
          <select name="minSuccess" defaultValue={f.minSuccess ?? ''}>
            <option value="">Any</option>
            {[10, 20, 30, 40, 50, 60, 75].map((v) => <option key={v} value={v}>{v}%+</option>)}
          </select>
        </fieldset>
        <fieldset>
          <legend>Public land</legend>
          <select name="minPublic" defaultValue={f.minPublic ?? ''}>
            <option value="">Any</option>
            {[25, 50, 75, 90].map((v) => <option key={v} value={v}>{v}%+ public</option>)}
          </select>
          <div className="chips" style={{ marginTop: 6 }}>
            <Chip name="accessYes" value="1" checked={f.accessYes} label="Has Access Yes! land" />
          </div>
        </fieldset>
        <fieldset>
          <legend>Youth hunts</legend>
          <select name="youth" defaultValue={f.youth}>
            <option value="exclude">Hide youth-only</option>
            <option value="include">Include</option>
            <option value="only">Youth-only hunts</option>
          </select>
        </fieldset>
        <fieldset>
          <legend>Unit</legend>
          <input type="text" name="unit" defaultValue={f.unit} placeholder="e.g. 49 or 36A" aria-label="Unit" />
        </fieldset>
        <fieldset>
          <legend>Sort by</legend>
          <select name="sort" defaultValue={f.sort}>
            <option value="best">Best bet (odds x success)</option>
            <option value="odds">Draw odds</option>
            <option value="success">Hunter success</option>
            <option value="big">Trophy share (4+ / 6+)</option>
            <option value="public">Public land</option>
            <option value="open">Season opens</option>
          </select>
        </fieldset>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" type="submit">Apply</button>
          <a className="btn" href="/">Reset</a>
        </div>
      </AutoSubmit>
    </aside>
  );
}
