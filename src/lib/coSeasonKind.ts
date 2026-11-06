import type { SeasonKind } from '@/sync/co/harvest';
import { decodeCode } from './coHunt';
/** CPW's broad unit/season report categories; unknown and special seasons are not guessed. */
export function coSeasonKind(code: string | null): SeasonKind | null {
  const d=decodeCode(code ?? ''); if(!d) return null;
  if(d.method==='A') return 'archery'; if(d.method==='M') return 'muzzle';
  if(d.method==='R' && ['O','U'].includes(d.type) && d.no>=1 && d.no<=4) return ('rifle'+d.no) as SeasonKind;
  return null;
}
