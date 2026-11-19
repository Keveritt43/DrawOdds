import type {HuntSummary} from '@prisma/client';
import {scoreHunts} from './score';
import {withoutUnvalidatedWyDeerMetrics} from './wyDeerMetrics';
import {withWaVerifiedDates} from './waHuntCorrections';
import {withIdahoVerifiedArea} from './idahoHuntCorrections';
import {withWyElkBoundaryHistory} from './wyElkBoundaryHistory';
import {withoutUnvalidatedWyLicenseMetrics} from './wyLicenseMetrics';
import {trophyForHunt} from './trophyHunt';
import {withWyElkRegion} from './wyElkRegions';
import {mtHarvestProxy,withoutMtProxySuccess} from './mtHarvestProxy';
import {withUtSeasonCorrections} from './utSeasonCorrections';

/** Recompute the shared trophy modifier on read for non-Idaho states whose persisted
 * imports predate unit tiers. No database writes or agency synchronization occur. */
export function withStateTrophyScores<T extends HuntSummary>(raw:T):T {
  if(raw.state==='ID')return withIdahoVerifiedArea(raw);
  if(!['WA','MT','UT','WY'].includes(raw.state))return raw;
  const r=withUtSeasonCorrections(withWyElkRegion(withWyElkBoundaryHistory(withWaVerifiedDates(withoutUnvalidatedWyDeerMetrics(raw)))));
  if(r.state==='MT' && mtHarvestProxy(r.pointOdds)) {const safe=withoutMtProxySuccess(r);return {...safe,scoreTrophy:trophyForHunt(safe)};}
  // Wyoming deer were rescored from their dominant species above, or withheld; region sums stay withheld
  if(r.state==='WY' && r.species==='DEER')return r;
  if(r.state==='WY') { const safe=withoutUnvalidatedWyLicenseMetrics(r); if(safe.success5===null) return {...safe,scoreTrophy:trophyForHunt(safe)}; }
  const publicPct=r.privateOnly ? (r.publicPct===null ? null : 0) : r.publicPct;
  const huntablePct=r.state==='MT' ? (r.privateOnly?r.accessYesPct:r.huntablePct)
    : r.state==='WY' ? null : (r.privateOnly ? 0 : r.publicPct);
  const out=scoreHunts([{...r,publicPct,huntablePct,nrTag:false}]).get(r.id);
  if(out && r.state==='UT' && (r.tagSeasons as {seasons?:{uncertain?:boolean}[]}|null)?.seasons?.some(s=>s.uncertain))
    return {...r,...out,scoreQuality:null,scoreOppRes:null,scoreOppNr:null};
  return out ? {...r,...out} : r;
}
