import { CoScore } from "@/components/CoPages";
import { getState } from "@/lib/residency";
import Link from 'next/link';
import { SCORE_WEIGHTS } from '@/lib/score';
import { ScoreBadge } from '@/components/HuntCards';

export const metadata = { title: 'How The DrawOdds Score Works', description: 'How DrawOdds Idaho scores every hunt 0-100 on success, land access, crowding and trophy potential.' };

export default async function ScorePage() {
  if ((await getState()).code === "CO") return <CoScore />;
  return (
    <main className="wrap" style={{ maxWidth: 820, margin: '24px auto 48px' }}>
      <div className="card">
        <h1>The DrawOdds Score</h1>
        <p>Every hunt gets two numbers from 0 to 100, colored red to green so you can scan a list fast.</p>
        <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <ScoreBadge v={88} label="Quality: how good the hunt is once you hold the tag" />
          <ScoreBadge v={41} label="Opportunity: quality × √draw odds" />
        </p>

        <h2>Quality</h2>
        <p>Quality combines harvest success (65%), access (20%) and elbow room (15%). Trophy evidence can adjust that grade by up to 5 points in either direction. Scores use fixed benchmarks rather than peer ranks.</p>
        <ul>
          <li><b>Success ({SCORE_WEIGHTS.success}%):</b> harvest divided by hunters across the available five-year window. For general elk, 10% scores 30, 20% scores 75 and 50% scores 100. For controlled elk, those benchmarks are 20%, 50% and 80%. All weapons use the same species benchmarks. For pronghorn, 35% scores 30, 60% scores 75 and 85% scores 100. For deer, those benchmarks are 35%, 55% and 75%; for moose, sheep and goat, 50%, 70% and 90%. These are Success index values before sample adjustment, not harvest probabilities. Small samples are pulled toward the low benchmark using 50 prior hunter-seasons (10 for moose, sheep and goat).</li>
          <li><b>Access ({SCORE_WEIGHTS.access}%):</b> public land plus Access Yes! land. 50% scores 80; above that it climbs slowly to 100, below it drops fast (25% scores 40). Most Idaho units are mostly public, so this mostly marks down the private-land units.</li>
          <li><b>Elbow room ({SCORE_WEIGHTS.crowd}%):</b> hunters per square mile: 0.25 scores 85, 0.5 scores 70, 1 scores 50, 1.5 scores 38, 3 scores 18.</li>
          <li><b>Trophy (up to ±5 points):</b> share of harvested bucks or bulls that were 4+ point mule deer or 6+ point bulls. The bar maps 25% to 45, 50% to 75 and 75% to 100; 50 on the bar is neutral. The adjustment is reduced for small harvest samples. Antlerless hunts, whitetail units, 2-point-only seasons and species without a supported trophy metric receive no adjustment. No trophy weight is redistributed.</li>
        </ul>
        <p>Hunts with fewer than 30 hunter-seasons (10 for moose, sheep and goat), invalid harvest counts, or missing access or density data receive no overall score. Quality cannot exceed the lower of observed and sample-adjusted Success plus 20 points. Below the low harvest benchmark, Quality is capped at 49. Thus, controlled elk below 20% success cannot reach Quality 50, even with perfect access and low density.</p>

        <h2>Opportunity</h2>
        <p>Quality × the square root of your first-choice draw odds, for your residency, rounded to a whole number. Quality 80 with 25% odds gives Opportunity 40; with 1% odds it gives 8. It is an absolute decision index, never a peer percentile or a probability of harvesting. Over-the-counter resident tags count as 100% odds. Unknown draw odds, including capped resident tags without draw data, remain unscored. General nonresident tags currently use their available tag-draw history, which may cover less than five years.</p>

        <h2>Reading It</h2>
        <ul>
          <li>Quality and Opportunity are absolute grades: identical inputs give identical scores regardless of the other hunts listed.</li>
          <li>The weights and benchmarks are explicit judgments, not validated predictions. Public acreage does not guarantee practical access; density averages conceal local crowding. General-hunt harvest can combine multiple sex classes and seasons. Inspect the underlying data before choosing a hunt.</li>
          <li>Tap a score on any hunt to see its four parts. Filter and sort by score in <Link href="/hunts?sort=score">Find A Hunt</Link>, or shade the map by it.</li>
        </ul>
        <p className="small muted">All inputs are public IDFG data. See <Link href="/about">Data &amp; Methods</Link>.</p>
      </div>
    </main>
  );
}
