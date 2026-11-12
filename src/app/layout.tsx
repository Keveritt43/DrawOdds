import { FindHuntsLink } from '@/components/HuntNavigation';
import { CompareTray } from '@/components/Compare';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import { getDraw, getState } from '@/lib/residency';
import { StateProvider } from '@/components/StateContext';
import { SiteHeader } from '@/components/SiteHeader';
import { LogoMark } from '@/components/Logo';

const body = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-barlow', display: 'swap' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-barlow-condensed', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'DrawOdds Idaho: Draw Odds For Deer, Elk, Pronghorn, Moose, Sheep And Goat', template: '%s · DrawOdds' },
  description: 'Find Idaho deer, elk, pronghorn, moose, bighorn sheep and mountain goat hunts by draw odds for your residency, hunter success, crowding, season, weapon, public land and Access Yes!',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1d2023' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [draw, state] = await Promise.all([getDraw(), getState()]);
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <StateProvider code={state.code}>
        <a href="#content" className="skip">Skip to content</a>
        <SiteHeader draw={draw} />
        <div id="content">{children}</div>
        <CompareTray />
        <footer className="site-footer">
          <div className="inner">
            <div className="foot-brand">
              <LogoMark size={40} />
              <p>
                Public {state.agency.name} data. Automatic refresh is paused. Not affiliated with or endorsed by {state.agency.short}.
                Always confirm seasons and rules in the current {state.agency.short} regulations before you apply or hunt.
              </p>
            </div>
            <nav aria-label="Research">
              <b>Research</b>
              <FindHuntsLink>Find Hunts</FindHuntsLink>
              <Link href="/map">Unit Map</Link>
              {state.code === 'MT' ? <>
                {/* Montana's drawn deer and elk hunts are permits (the multi-state finder has no hunt-type filter) */}
                <Link href="/hunts?states=MT&species=ELK&mtLic=permit">Elk Permits</Link>
                <Link href="/hunts?states=MT&species=DEER&mtLic=permit">Deer Permits</Link>
                <Link href="/hunts?states=MT&species=PRONGHORN">Antelope Draws</Link>
              </> : state.code === 'UT' ? <>
                <Link href="/hunts?states=UT&species=ELK&utLic=le">Limited-Entry Elk</Link>
                <Link href="/hunts?states=UT&species=DEER&utLic=le">Limited-Entry Deer</Link>
                <Link href="/hunts?states=UT&species=DEER&utLic=general">General Deer Draw</Link>
                <Link href="/hunts?states=UT&species=PRONGHORN">Pronghorn Draws</Link>
                <Link href="/hunts?states=UT&species=BISON">Bison</Link>
              </> : state.code === 'WY' ? <>
                <Link href="/hunts?states=WY&species=ELK">Elk Draws</Link>
                <Link href="/hunts?states=WY&species=DEER">Deer Draws</Link>
                <Link href="/hunts?states=WY&species=PRONGHORN">Antelope Draws</Link>
              </> : <>
                <Link href="/hunts?species=ELK&type=CONTROLLED">Elk Draws</Link>
                <Link href="/hunts?species=DEER&type=CONTROLLED">Deer Draws</Link>
                {state.code==='ID'&&<Link href="/hunts?species=PRONGHORN">Pronghorn Draws</Link>}
              </>}
              {state.code === 'CO' && <Link href="/hunts?states=CO&draw=msg">Moose, Sheep &amp; Goat</Link>}
            </nav>
            <nav aria-label="About">
              <b>About</b>
              <Link href="/about">Data & Methods</Link>
              <Link href="/account">Account</Link>
              <a href={state.agency.url} target="_blank" rel="noreferrer">{state.agency.short} Hunting</a>
            </nav>
          </div>
        </footer>
        </StateProvider>
      </body>
    </html>
  );
}
