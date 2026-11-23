import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ELK_ZONES } from '@/lib/elkZones';
import { validHuntReturn, idahoUnitResearchHref } from '@/lib/huntNavigation';
import { getResidency } from '@/lib/residency';
import { getFavorites } from '@/lib/favorites';
import { IdahoZoneExplorerMap } from '@/components/IdahoZoneExplorerMap';

export const dynamic = 'force-dynamic';

export default async function ElkZonePage({params,searchParams}:{params:Promise<{zone:string}>;searchParams:Promise<{returnHunt?:string;as?:string}>}) {
  const name = decodeURIComponent((await params).zone);
  if (!Object.hasOwn(ELK_ZONES, name)) notFound();
  const units = ELK_ZONES[name];
  const sp = await searchParams;
  const back = validHuntReturn(sp.returnHunt);
  const { residency } = await getResidency(sp.as, 'ID');
  const fav = await getFavorites();
  return <main className="wrap" style={{margin:'20px auto 40px'}}>
    <p><Link href={back ?? '/hunts?states=ID&species=ELK'}>← {back ? 'Back to this hunt' : 'Find elk hunts'}</Link></p>
    <h1>{name} Elk Zone</h1>
    <p>Units {units.join(', ')}. Tap a unit on the map for its details, or use the links below.</p>
    <p className="small muted">Orange outlines show the units in this zone. Open Explore terrain to see conditions across the zone.</p>
    <IdahoZoneExplorerMap zone={name} units={units} returnHunt={back} nr={residency==='NONRESIDENT'} savedUnits={[...fav.units]} signedIn={fav.signedIn} />
    <h2>Explore a unit</h2>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{units.map(unit=><Link className="btn" key={unit} href={idahoUnitResearchHref(unit,back)}>Unit {unit} →</Link>)}</div>
  </main>;
}
