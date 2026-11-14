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
        <p>Quality combines harvest success (65%), access (20%) and elbow room (15%). Recognized trophy tiers can add up to 5 points; Standard hunts receive no penalty. The Quality components use fixed benchmarks; the trophy evidence screen also compares draw rates with compatible peers.</p>
        <ul>
          <li><b>Success ({SCORE_WEIGHTS.success}%):</b> harvest divided by hunters across the available five-year window. For general elk, 10% scores 30, 20% scores 75 and 50% scores 100. For controlled elk, those benchmarks are 20%, 50% and 80%. All weapons use the same species benchmarks. For pronghorn, 35% scores 30, 60% scores 75 and 85% scores 100. For deer, those benchmarks are 35%, 55% and 75%; for moose, sheep and goat, 50%, 70% and 90%. These are Success index values before sample adjustment, not harvest probabilities. Small samples are pulled toward the low benchmark using 50 prior hunter-seasons (10 for moose, sheep and goat).</li>
          <li><b>Access ({SCORE_WEIGHTS.access}%):</b> public land plus Access Yes! land. 50% scores 80; above that it climbs slowly to 100, below it drops fast (25% scores 40). Most Idaho units are mostly public, so this mostly marks down the private-land units.</li>
          <li><b>Elbow room ({SCORE_WEIGHTS.crowd}%):</b> hunters per square mile: 0.25 scores 85, 0.5 scores 70, 1 scores 50, 1.5 scores 38, 3 scores 18.</li>
          <li><b>Trophy (up to +5 points):</b> Elite (up to +5), Excellent (up to +3), Good (up to +1.5), Standard (neutral). Trophy includes units identified by exceptional controlled-draw applications or observed points; demand alone does not measure animal size. Eligible general hunts in demand-recognized units can receive Good, subject to the season and evidence screens below. The adjustment is reduced for smaller harvest samples. A multi-unit hunt uses its best eligible unit; that tier does not describe every unit. Geographic associations do not locate individual records to a unit. Standard does not mean poor trophy potential. Antlerless and maximum-antler-restricted hunts are excluded. Harvest antler share is used only for the Idaho November rule described below.</li>
          <li><b>Idaho deer seasons:</b> A controlled hunt open in November earns Excellent when its five-year estimated 4-point-or-better share exceeds 70% and both resident and nonresident five-year draw odds are below 5%. The early controlled Unit 55 hunt is also Excellent. The 4-point share is based on reported harvest estimates and a minimum sample, not a guarantee. Trophy is one part of Quality, so a higher trophy tier alone does not guarantee a higher overall Quality score.</li>
          <li><b>Seasons:</b> Hunts outside November for deer, or September through October 7 for elk, drop one trophy tier when their actual dates are known. Separate season windows are checked separately; early Idaho Unit 55 is an exception. Colorado deer third and fourth rifle hunts require an observed adult nonresident cutoff of at least 20 points for Elite. Observed past cutoffs do not guarantee a future draw.</li>
          <li><b>Harvest and draw evidence:</b> Where comparable same-year nonresident draw data is available, hunts with relatively high overall draw rates and harvest below 50% are capped at Good; stronger evidence of low harvest can make them Standard. The draw comparison uses the upper quarter of its peer group, not personal draw odds. Harvest screening requires at least three reporting years and 50 hunter-seasons. Its approximate uncertainty calculation is a screening aid, not proof of statistical significance; agency estimates and repeated hunters can affect it. Missing or incompatible evidence does not become zero.</li>
          <li><b>Washington Blue Mountains elk:</b> Early-season hunts in the identified units can receive Good. A controlled hunt with a very low overall draw rate and sufficient reported harvest evidence can receive Excellent before the seasonal adjustment. Neither draw demand nor harvest success establishes antler size.</li>
        </ul>
        <p>Hunts with fewer than 30 hunter-seasons (10 for moose, sheep and goat), invalid harvest counts, or missing access or density data receive no overall score. Quality cannot exceed the lower of observed and sample-adjusted Success plus 20 points. Below the low harvest benchmark, Quality is capped at 49. Thus, controlled elk below 20% success cannot reach Quality 50, even with perfect access and low density.</p>

        <h2>Opportunity</h2>
        <p>Quality × the square root of your first-choice draw odds, for your residency, rounded to a whole number. Quality 80 with 25% odds gives Opportunity 40; with 1% odds it gives 8. It is an absolute decision index, never a peer percentile or a probability of harvesting. Over-the-counter resident tags count as 100% odds. Unknown draw odds, including capped resident tags without draw data, remain unscored. General nonresident tags currently use their available tag-draw history, which may cover less than five years.</p>

        <h2>Reading It</h2>
        <ul>
          <li>Quality and Opportunity use fixed component benchmarks. Trophy tiers can also reflect a published peer-group draw benchmark; changing the hunts shown in your results does not recalculate that benchmark.</li>
          <li>The weights and benchmarks are explicit judgments, not validated predictions. Public acreage does not guarantee practical access; density averages conceal local crowding. General-hunt harvest can combine multiple sex classes and seasons. Inspect the underlying data before choosing a hunt.</li>
          <li>Tap a score on any hunt to see its four parts. Filter and sort by score in <Link href="/hunts?sort=score">Find A Hunt</Link>, or shade the map by it.</li>
        </ul>
        <p className="small muted">All inputs are public IDFG data. See <Link href="/about">Data &amp; Methods</Link>.</p>
      </div>
    </main>
  );
}
