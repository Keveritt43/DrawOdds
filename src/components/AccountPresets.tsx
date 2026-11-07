'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { browserPresets, BROWSER_PRESET_KEY, changeBrowserPreset } from '@/lib/browserPresets';
import { presetStates, type FilterPreset } from '@/lib/filterPresets';
import type { StateCode } from '@/lib/states';
import { useRouter } from 'next/navigation';

export function AccountPresets({state,owner,initial=[]}:{state:StateCode;owner:string|null;initial?:FilterPreset[]}) {
  const router = useRouter();
  const [presets,setPresets] = useState(initial), [message,setMessage] = useState(''), [removing,setRemoving] = useState<string|null>(null);
  useEffect(()=>{if(owner)setPresets(initial);},[owner,initial]);
  useEffect(() => {
    if(owner) return;
    const load = () => setPresets(browserPresets());
    const storage = (e:StorageEvent) => {if(e.key===BROWSER_PRESET_KEY)load();};
    load(); window.addEventListener('storage',storage); window.addEventListener('drawodds:presets',load);
    return ()=>{window.removeEventListener('storage',storage);window.removeEventListener('drawodds:presets',load);};
  },[owner]);
  const shown = presets.filter(p=>presetStates(p).includes(state));
  async function remove(name:string) {
    setMessage(''); setRemoving(name);
    try {
      if(!owner) {
        const result=changeBrowserPreset({name,href:null});
        if(result.error)throw Error(result.error);
        setPresets(result.presets??[]);
      } else {
        const res=await fetch('/api/filter-presets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,name,remove:true})});
        const data=await res.json();
        if(!res.ok)throw Error(data.error);
        setPresets(data.presets);
        router.refresh();
      }
    } catch {setMessage('Could not delete this saved filter. Please try again.');}
    finally{setRemoving(null);}
  }
  return <div>
    {!shown.length?<p className="small muted">No saved filters for this state yet. Name and save a search from Find Hunts.</p>:
      <ul className="preset-list">{shown.map(p=><li key={p.name}><Link href={p.href} prefetch={false}>{p.name}</Link><button type="button" className="btn small" disabled={removing!==null} onClick={()=>void remove(p.name)} aria-label={'Delete saved filter '+p.name}>Delete</button></li>)}</ul>}
    {message&&<p className="small" role="alert">{message}</p>}
  </div>;
}
