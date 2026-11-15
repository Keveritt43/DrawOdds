/** Hunter-supplied seasonal timing rubric. Dates use the midpoint of an actual season segment. */
export function timingScore(species: string, weapon: string, open: Date | string | null, close: Date | string | null): number | null {
  if (!open || !close || !['DEER','ELK'].includes(species) || !['ANY','ARCHERY','MUZZLELOADER'].includes(weapon)) return null;
  const a = new Date(open).getTime(), b = new Date(close).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const d = new Date((a + b) / 2), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const bow = weapon === 'ARCHERY';
  if (species === 'DEER') {
    if (bow) {
      if (md >= 1115 || md <= 115) return 14.5;
      if (md >= 1101 && md <= 1114) return 12.5;
      if (md >= 815 && md <= 910) return 10;
      if (md >= 911 && md <= 930) return 8;
    } else {
      if ((md >= 1105 && md <= 1125) || md >= 1201 || md <= 115) return 15;
      if (md >= 1028 && md <= 1104) return 13;
      if (md >= 815 && md <= 905) return 11.5;
    }
    return md >= 1001 && md <= 1027 ? 7 : null;
  }
  if (bow) {
    if (md >= 912 && md <= 925) return 13.5;
    if (md >= 901 && md <= 911) return 12;
    if (md >= 926 && md <= 1010) return 10.5;
    if (md >= 815 && md <= 831) return 10;
  } else {
    if (md >= 901 && md <= 925) return 15;
    if (md >= 926 && md <= 1012) return 14;
    if (md >= 1013 && md <= 1031) return 9;
  }
  return md >= 1101 && md <= 1231 ? 8 : null;
}
