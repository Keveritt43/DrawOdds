import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getResidency } from '@/lib/residency';
import { ResidencySwitch } from '@/components/ResidencySwitch';

export const metadata: Metadata = {
  title: 'Idaho Hunt Planner - draw odds, harvest and land access for deer and elk',
  description: 'Find Idaho deer and elk hunts by draw odds, success rate, season, weapon, mule deer vs whitetail, and public land.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { residency, signedIn } = await getResidency();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">Idaho Hunt Planner</Link>
            <nav>
              <Link href="/">Find hunts</Link>
              <Link href="/map">Map</Link>
              <Link href="/about">Data</Link>
            </nav>
            <ResidencySwitch value={residency} />
            <Link href={signedIn ? '/account' : '/login'} className="btn">{signedIn ? 'Account' : 'Sign in'}</Link>
          </div>
        </header>
        {children}
        <footer className="foot">
          <div className="wrap">
            Data from Idaho Department of Fish and Game (Hunt Planner, drawing odds, harvest statistics, GIS). Not affiliated
            with or endorsed by IDFG. Always confirm seasons and rules in the current IDFG regulations before you apply or hunt.
          </div>
        </footer>
      </body>
    </html>
  );
}
