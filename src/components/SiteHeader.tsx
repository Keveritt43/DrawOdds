'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Residency } from '@prisma/client';
import { Wordmark } from './Logo';
import { ResidencySwitch } from './ResidencySwitch';
import { DrawSwitch } from './DrawSwitch';
import type { Draw } from '@/lib/species';

const LINKS = [
  { href: '/hunts', label: 'Find Hunts' },
  { href: '/map', label: 'Unit Map' },
  { href: '/about', label: 'Data & Methods' },
];

export function SiteHeader({ residency, signedIn, draw }: { residency: Residency; signedIn: boolean; draw: Draw }) {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const here = (href: string) => path === href || path.startsWith(href + '/');
  return (
    <header className="site-header">
      <div className="header-bar">
        <Link href="/" className="brand" aria-label="DrawOdds home">
          <Wordmark />
        </Link>
        <nav className={`nav-main ${open ? 'open' : ''}`} aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={here(l.href) ? 'page' : undefined}>{l.label}</Link>
          ))}
          <Link href={signedIn ? '/account' : '/login'}>{signedIn ? 'My Hunts' : 'Sign In'}</Link>
          <div className="nav-res"><span>Draw Odds For</span><ResidencySwitch value={residency} /></div>
        </nav>
        <div className="header-right">
          <ResidencySwitch value={residency} />
          <button className="menu-toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="draw-bar">
        <span>Drawing</span>
        <Suspense fallback={<div className="seg draw-seg" />}>
          <DrawSwitch value={draw} />
        </Suspense>
      </div>
    </header>
  );
}
