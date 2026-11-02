import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import { getResidency } from '@/lib/residency';
import { SiteHeader } from '@/components/SiteHeader';
import { LogoMark } from '@/components/Logo';

const body = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-barlow', display: 'swap' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-barlow-condensed', display: 'swap' });

export const metadata: Metadata = {
  title: 'DrawOdds Idaho: Draw Odds, Harvest And Land Access For Deer And Elk',
  description: 'Find Idaho deer and elk hunts by draw odds for your residency, hunter success, season, weapon, mule deer vs whitetail, public land and Access Yes!',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1d2023' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { residency, signedIn } = await getResidency();
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <a href="#content" className="skip">Skip to content</a>
        <SiteHeader residency={residency} signedIn={signedIn} />
        <div id="content">{children}</div>
        <footer className="site-footer">
          <div className="inner">
            <div className="foot-brand">
              <LogoMark size={40} />
              <p>
                Public Idaho Department of Fish and Game data, refreshed nightly. Not affiliated with or endorsed by IDFG.
                Always confirm seasons and rules in the current IDFG regulations before you apply or hunt.
              </p>
            </div>
            <nav aria-label="Research">
              <b>Research</b>
              <Link href="/hunts">Find Hunts</Link>
              <Link href="/map">Unit Map</Link>
              <Link href="/hunts?species=ELK&type=CONTROLLED">Elk Draws</Link>
              <Link href="/hunts?species=DEER&type=CONTROLLED">Deer Draws</Link>
            </nav>
            <nav aria-label="About">
              <b>About</b>
              <Link href="/about">Data & Methods</Link>
              <Link href="/account">My Hunts</Link>
              <a href="https://idfg.idaho.gov/hunt" target="_blank" rel="noreferrer">IDFG Hunting</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
