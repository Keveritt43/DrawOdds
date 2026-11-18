import { WEAPON } from './format';

type HuntWeapon = { state: string; weapon: string; nrTag?: boolean; id?: string; species?: string; tagSeasons?: unknown; pointOdds?: unknown };

/** Describe the hunt's actual seasons; a multi-season tag is not a single-weapon hunt. */
export function huntWeaponLabel(r: HuntWeapon): string {
  const po = r.pointOdds as { tag?: string; multiSeason?: boolean; regs?: { segments?: { archery?: unknown; regular?: unknown }[] } } | null;
  if (r.state === 'WA') {
    // moose, sheep and goat permits: any legal weapon (WDFW "All Methods"; pamphlet pp. 62-66)
    if (['MOOSE', 'BIGHORN', 'GOAT'].includes(r.species ?? '')) return 'Any legal weapon';
    if (po?.multiSeason) return 'Multiple weapons · general seasons';
    if (po?.tag) {
      const t = po.tag;
      const labels: string[] = [];
      if (/modern/i.test(t) || /(?:^|[,\s])(?:EF|WF)(?=$|[,\s])/.test(t)) labels.push('Modern firearm');
      if (/archery/i.test(t) || /(?:^|[,\s])(?:EA|WA)(?=$|[,\s])/.test(t)) labels.push('Archery');
      if (/muzzle/i.test(t) || /(?:^|[,\s])(?:EM|WM)(?=$|[,\s])/.test(t)) labels.push('Muzzleloader');
      if (labels.length) return labels.join(' / ');
      if (/^any(?: elk tag| yes)?$/i.test(t)) return 'Any eligible tag · see regulations';
      return 'Weapon: see regulations';
    }
    return WEAPON[r.weapon] ? ({ ANY: 'Modern firearm', ARCHERY: 'Archery', MUZZLELOADER: 'Muzzleloader' } as Record<string, string>)[r.weapon] ?? 'Weapon: see regulations' : 'Weapon: see regulations';
  }
  // New Mexico hunt codes: 1 = any legal sporting arm, 2 = bow only, 3 = muzzleloader, crossbow or bow (2026-27 booklet p. 49)
  if (r.state === 'NM') return ({ ANY: 'Any legal weapon', ARCHERY: 'Bow only', MUZZLELOADER: 'Muzzleloader, crossbow or bow' } as Record<string, string>)[r.weapon] ?? 'Weapon: see regulations';
  if (r.state === 'WY') {
    const segments = po?.regs?.segments ?? [];
    const archery = segments.some(s => !!s.archery);
    const regular = segments.some(s => !!s.regular);
    if (r.weapon === 'ARCHERY' || r.weapon === 'MUZZLELOADER') return WEAPON[r.weapon];
    if (archery && regular) return 'Archery / regular seasons · see restrictions';
    if (archery) return 'Archery season · see restrictions';
    if (regular) return 'Regular season · see weapon restrictions';
    return 'Weapon: see regulations';
  }
  const tag = r.state === 'ID' && r.nrTag && r.species === 'ELK' ? r.id?.split(':')[3]?.toUpperCase() : '';
  const bucket = tag === 'A' ? 'A tag · archery group' : tag === 'B' ? 'B tag · rifle group' : '';
  const seasons = (r.tagSeasons as { seasons?: { weapon?: string; weaponLabel?: string }[] } | null)?.seasons ?? [];
  const weapons = [...new Set(seasons.map(s => s.weaponLabel ?? (s.weapon ? WEAPON[s.weapon] : null)).filter((w): w is string => !!w))];
  if (weapons.length) return [bucket, weapons.join(' / ')].filter(Boolean).join(' · ');
  if (r.nrTag) return [bucket, 'Weapon: see tag seasons'].filter(Boolean).join(' · ');
  return WEAPON[r.weapon] ?? 'Weapon: see regulations';
}
