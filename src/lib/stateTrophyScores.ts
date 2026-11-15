import type {HuntSummary} from '@prisma/client';
import {scoreHunts} from './score';
import {withoutUnvalidatedWyDeerMetrics} from './wyDeerMetrics';
import {withWaVerifiedDates} from './waHuntCorrections';
import {withIdahoVerifiedArea} from './idahoHuntCorrections';
import {withWyElkBoundaryHistory} from './wyElkBoundaryHistory';

/** Recompute the shared trophy modifier on read for non-Idaho states whose persisted
 * imports predate unit tiers. No database writes or agency synchronization occur. */
export function withStateTrophyScores<T extends HuntSummary>(raw:T):T {
  if(raw.state==='ID')return withIdahoVerifiedArea(raw);
  if(!['WA','MT','UT','WY'].includes(raw.state))return raw;
  const r=withWyElkBoundaryHistory(withWaVerifiedDates(withoutUnvalidatedWyDeerMetrics(raw)));
  if(r.state==='WY' && r.species==='DEER')return r;
  const publicPct=r.privateOnly ? (r.publicPct===null ? null : 0) : r.publicPct;
  const huntablePct=r.state==='MT' ? (r.privateOnly?r.accessYesPct:r.huntablePct)
    : r.state==='WY' ? null : (r.privateOnly ? 0 : r.publicPct);
  const out=scoreHunts([{...r,publicPct,huntablePct,nrTag:false}]).get(r.id);
  return out ? {...r,...out} : r;
}
