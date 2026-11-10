'use client';

import { FindHuntsLink } from '@/components/HuntNavigation';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from './Logo';
import { DrawSwitch } from './DrawSwitch';
import { SiteSearch } from './SiteSearch';
import { StateSwitch } from './StateSwitch';
import { useStateConfig } from './StateContext';
import type { Draw } from '@/lib/species';

const LINKS = [
  { href: '/hunts', label: 'Find Hunts' },
  { href: '/map', label: 'Unit Map' },
  { href: '/planner', label: 'Planner' },
  { href: '/changes', label: 'What Changed' },
  { href: '/migration', label: 'Migration' },
  { href: '/guide', label: 'How The Draw Works' },
  { href: '/about', label: 'Data & Methods' },
];

export function SiteHeader({ draw }: { draw: Draw }) {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const here = (href: string) => path === href || path.startsWith(href + '/');
  const st = useStateConfig();
  // links to pages a state doesn't have (no migration studies loaded) stay out of its menu
  const links = LINKS.filter((l) => l.href !== '/migration' || st.features.migration);
  return (
    <header className="site-header" data-state={st.code}>
      <div className="header-bar">
        <span className="brand-wrap">
          <Link href="/" className="brand" aria-label="DrawOdds home">
            <Wordmark />
          </Link>
          {/* The home page has its own state picker in the headline; two "Idaho ▾" menus that behave differently
              (this one switches state, that one selects states to search) is what confuses first-time visitors. */}
          {path !== '/' && <StateSwitch />}
        </span>
        <nav className={`nav-main ${open ? 'open' : ''}`} aria-label="Main">
          {links.map((l) => (
            l.href === '/hunts' ? <FindHuntsLink key={l.href} aria-current={here(l.href) ? 'page' : undefined}>{l.label}</FindHuntsLink> :
            <Link key={l.href} href={l.href} aria-current={here(l.href) ? 'page' : undefined}>{l.label}</Link>
          ))}
          <Link href="/account" aria-current={here('/account') ? 'page' : undefined}>Account</Link>
        </nav>
        <div className="header-right">
          <SiteSearch onDone={() => setOpen(false)} />
          <button className="menu-toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </div>
      {st.draws.length > 1 && <div className="draw-bar">
        <div className="db-item">
          <span>Drawing</span>
          {/* The fallback carries the real labels: an empty bordered box reads as a broken control while the
              client half of the switch is still arriving. */}
          <Suspense fallback={
            <div className="seg draw-seg" role="group" aria-label="Which drawing">
              {st.draws.map((d) => <button key={d.key} type="button" disabled aria-pressed={d.key === draw}>{d.label}</button>)}
            </div>
          }>
            <DrawSwitch value={draw} />
          </Suspense>
        </div>
      </div>}
    </header>
  );
}
