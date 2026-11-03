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
        <p>Four parts, each on a fixed 0-100 scale that means the same thing for every hunt of a species, general or controlled, so a controlled bull hunt and a general A tag can be compared head to head. The scales line up with the chips on each card: 75 or more is where &ldquo;High for deer&rdquo; or &ldquo;Uncrowded&rdquo; starts; under 40 is &ldquo;Low&rdquo; or &ldquo;Crowded&rdquo;.</p>
        <ul>
          <li><b>Success ({SCORE_WEIGHTS.success}%):</b> 5-year harvest ÷ hunters, against bands for the species (deer: 35% scores 40, 55% scores 75, 75% scores 100), scaled for weapon: archery deer runs about 45% of rifle success, archery elk about 90%. Hunts with few hunters are pulled toward the average for their tag type, so 3 kills by 3 hunters doesn&apos;t read as a sure thing.</li>
          <li><b>Access ({SCORE_WEIGHTS.access}%):</b> public land plus Access Yes! land. 50% scores 80; above that it climbs slowly to 100, below it drops fast (25% scores 40). Most Idaho units are mostly public, so this mostly marks down the private-land units.</li>
          <li><b>Elbow room ({SCORE_WEIGHTS.crowd}%):</b> hunters per square mile: 0.25 scores 85, 0.5 scores 70, 1 scores 50, 1.5 scores 38, 3 scores 18.</li>
          <li><b>Trophy ({SCORE_WEIGHTS.trophy}%):</b> share of bucks / bulls taken that were 4+ point mule deer or 6+ point bulls: 25% scores 45, 50% scores 75, 75% scores 100. Not counted for antlerless hunts, whitetail units, 2-point-only seasons or moose, sheep and goat; its weight is shared among the other three.</li>
        </ul>
        <p>Hunts with fewer than 30 hunters over 5 years (10 for moose, sheep and goat) aren&apos;t scored: there isn&apos;t enough to go on.</p>

        <h2>Opportunity</h2>
        <p>Quality × the square root of your 5-year first-choice draw odds, for your residency, then ranked among the same kind of hunt (same species, general or controlled, sex and weapon). The square root keeps a 25% draw at half its quality and drops a 1% draw to a tenth. Ranking it means a green Opportunity on a bull elk hunt says &ldquo;one of the best bets among bull elk hunts&rdquo;, not &ldquo;likely to draw&rdquo;: the draw odds sit right next to it on every card. Over-the-counter tags count as a sure draw.</p>

        <h2>Reading It</h2>
        <ul>
          <li>Quality is a grade, not a rank: two hunts with the same numbers get the same score, whatever else is out there. Opportunity is a rank among hunts like it.</li>
          <li>The weights are our judgment of what most hunters want. Moving them around changes the top 50 hunts by about 5-15, so the ranking holds up well.</li>
          <li>Tap a score on any hunt to see its four parts. Filter and sort by score in <Link href="/hunts?sort=score">Find A Hunt</Link>, or shade the map by it.</li>
        </ul>
        <p className="small muted">All inputs are public IDFG data. See <Link href="/about">Data &amp; Methods</Link>.</p>
      </div>
    </main>
  );
}
