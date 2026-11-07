'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { searchDraw } from '@/lib/searchStates';
import { useStateConfig } from './StateContext';
import { setDraw } from '@/app/actions';
import type { Draw } from '@/lib/species';

/**
 * Which drawing to look at: deer / elk / pronghorn, or moose / sheep / goat (Idaho applicants pick one).
 * Switching drops filters that only make sense in the other drawing (species, hunt type, elk zones, deer type).
 */
export function DrawSwitch({ value, light = false }: { value: Draw; light?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const colorado = useStateConfig().code === 'CO';
  const finder = path === '/hunts';
  const explicit = finder && sp.has('states');
  const selected = colorado || explicit ? searchDraw(sp.get('draw'), sp.get('species')) : value;
  const pick = (d: Draw) =>
    start(async () => {
      if (colorado || explicit) {
        const states = explicit ? sp.get('states')! : 'CO';
        router.push(`/hunts?states=${encodeURIComponent(states)}&draw=${d.toLowerCase()}`);
        return;
      }
      await setDraw(d);
      if (path === '/hunts' || path.startsWith('/units/')) {
        const p = new URLSearchParams(sp.toString());
        for (const k of ['species', 'type', 'zone', 'deerType', 'minBig', 'page', 'q', 'draw']) p.delete(k);
        router.replace(`${path}${p.size ? `?${p}` : ''}`, { scroll: false });
      }
    });
  const opt = (d: Draw, label: string, title: string) => (
    <button type="button" aria-pressed={selected === d} disabled={pending} onClick={() => pick(d)} title={title}>
      {label}
    </button>
  );
  return (
    <div className={`seg draw-seg ${light ? 'light' : ''}`} role="group" aria-label="Which drawing">
      {opt('DEP', 'Deer · Elk · Pronghorn', colorado ? 'Deer, elk and pronghorn hunts' : 'Deer, elk and pronghorn controlled hunts and general seasons (applications May 1 - June 5)')}
      {opt('MSG', 'Moose · Sheep · Goat', colorado ? 'Moose, bighorn sheep and mountain goat limited licenses' : 'Moose, bighorn sheep and mountain goat controlled hunts (applications April 1 - 30; pick one species)')}
    </div>
  );
}
