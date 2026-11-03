import Link from 'next/link';
import { SCORE_WEIGHTS } from '@/lib/score';
import { ScoreBadge } from '@/components/HuntCards';

export const metadata = { title: 'How The DrawOdds Score Works', description: 'How DrawOdds Idaho scores every hunt 0-100 on success, land access, crowding and trophy potential.' };

export default function ScorePage() {
  return (
    <main className="wrap" style={{ maxWidth: 820, margin: '24px auto 48px' }}>
      <div className="card">
        <h1>The DrawOdds Score</h1>
        <p>Every hunt gets two numbers from 0 to 100, colored red to green so you can scan a list fast.</p>
        <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <ScoreBadge v={88} label="Quality: how good the hunt is once you hold the tag" />
          <ScoreBadge v={41} label="Opportunity: quality × your chance of drawing" />
        </p>

        <h2>Quality</h2>
        <p>Four parts, each ranked 0-100 against the same kind of tag: same species, general season or controlled hunt, buck/bull or antlerless, and weapon. A general archery deer season is compared with other general archery deer seasons, not with bull elk.</p>
        <ul>
          <li><b>Success ({SCORE_WEIGHTS.success}%):</b> 5-year harvest ÷ hunters. Hunts with few hunters are pulled toward the average for their tag type, so 3 kills by 3 hunters doesn&apos;t read as a sure thing.</li>
          <li><b>Access ({SCORE_WEIGHTS.access}%):</b> public land plus Access Yes! land. 50% scores 80; above that it climbs slowly to 100, below it drops fast (25% scores 40). Most Idaho units are mostly public, so this mostly marks down the private-land units.</li>
          <li><b>Elbow room ({SCORE_WEIGHTS.crowd}%):</b> fewer hunters per square mile ranks higher.</li>
          <li><b>Trophy ({SCORE_WEIGHTS.trophy}%):</b> share of the antlered harvest that was 4+ point mule deer or 6+ point bulls. Not counted for antlerless hunts, whitetail units, 2-point-only seasons or moose, sheep and goat; its weight is shared among the other three.</li>
        </ul>
        <p>Hunts with fewer than 30 hunters over 5 years (10 for moose, sheep and goat) aren&apos;t scored: there isn&apos;t enough to go on.</p>

        <h2>Opportunity</h2>
        <p>Quality × the square root of your 5-year first-choice draw odds, for your residency, then ranked against the same kind of tag, like Quality. The square root keeps a 25% draw at half its quality and drops a 1% draw to a tenth. Ranking it means a green Opportunity on a bull elk hunt says &ldquo;one of the best bets among bull elk hunts&rdquo;, not &ldquo;likely to draw&rdquo;: the draw odds sit right next to it on every card. Over-the-counter tags count as a sure draw.</p>

        <h2>Reading It</h2>
        <ul>
          <li>A score is a rank, not a promise: 80 means better than about 80% of hunts like it on those measures.</li>
          <li>The weights are our judgment of what most hunters want. Moving them around changes the top 50 hunts by about 5-15, so the ranking holds up well.</li>
          <li>Tap a score on any hunt to see its four parts. Filter and sort by score in <Link href="/hunts?sort=score">Find A Hunt</Link>, or shade the map by it.</li>
        </ul>
        <p className="small muted">All inputs are public IDFG data. See <Link href="/about">Data &amp; Methods</Link>.</p>
      </div>
    </main>
  );
}
