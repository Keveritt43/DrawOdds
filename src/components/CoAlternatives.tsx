import { HuntLink } from '@/components/HuntNavigation';
import type { HuntSummary } from '@prisma/client';
import { db } from '@/lib/db';
import { tableOdds, type OddsTable, type CoPool } from '@/lib/coHunt';
import { dateRange } from '@/lib/coDisplay';
import { pct, pctOdds } from '@/lib/format';
export async function CoAlternatives({hunt,pool,points,mode}:{hunt:HuntSummary;pool:CoPool;points:number;mode:'last'|'proj'}) {
 const base=tableOdds(hunt.oddsByPts as unknown as OddsTable,mode,pool,points);
 if(base===null||hunt.success5===null||hunt.smallSample) return <section className="card alts"><h3>Easier To Draw, Just As Good</h3><p className="small muted">Comparable alternatives need known draw odds and enough harvest evidence for this hunt. Its available data does not meet that threshold yet.</p></section>;
 const rows=await db.huntSummary.findMany({where:{state:'CO',species:hunt.species,type:'CONTROLLED',weapon:hunt.weapon,antlerClass:hunt.antlerClass,privateOnly:hunt.privateOnly,youthOnly:hunt.youthOnly,id:{not:hunt.id},smallSample:false,success5:{gte:hunt.success5*.8}}});
 const alts=rows.map(r=>({r,odds:tableOdds(r.oddsByPts as unknown as OddsTable,mode,pool,points)})).filter(x=>x.odds!==null&&x.odds>base).sort((a,b)=>b.odds!-a.odds!||(b.r.success5??0)-(a.r.success5??0)).slice(0,3);
 return <section className="card alts"><h3>Easier To Draw, Just As Good</h3><p className="small muted">Other {hunt.species.toLowerCase()} hunts with the same method, sex class, private-land and youth restrictions, better {mode==='proj'?'projected':'actual'} odds at your {points} points, and at least 80% of this hunt&apos;s success. Small harvest samples are excluded.</p>{alts.length?<ul>{alts.map(({r,odds})=><li key={r.id}><HuntLink href={`/hunts/${r.slug}`}>{r.name} · {r.tagCode}</HuntLink> <span className="small">{pctOdds(odds)} odds (vs {pctOdds(base)}) · {pct(r.success5)} success (vs {pct(hunt.success5)}) · {dateRange(r.openDate,r.closeDate)}</span></li>)}</ul>:<p className="small muted">No comparable hunt currently has both better odds and sufficient harvest evidence.</p>}</section>;
}
