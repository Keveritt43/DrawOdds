import type { Prisma } from '@prisma/client';

/** Every persisted input read by scoreHunts/trophyForHunt, plus rollback columns.
 * Keep this selection in step with the live scorer so a protected plan cannot
 * silently calculate a different hunt from the one shown on the site. */
export const idahoScoreSelect = {
  id:true, units:true, openDate:true, closeDate:true, species:true, type:true,
  nrTag:true, weapon:true, antlerClass:true, hunters5:true, harvest5:true,
  harvestYears:true, huntersSqMi:true, publicPct:true, huntablePct:true,
  bigPct5:true, deerType:true, tagSeasons:true, resOdds5:true, nrOdds5:true,
  resOddsLast:true, nrOddsLast:true, oddsLastYear:true, appsLast:true,
  resAppsLast:true, nrAppsLast:true, youthOnly:true, capped:true,
  huntNumber:true, tagCode:true, name:true, takeMethod:true, pointOdds:true,
  privateOnly:true, scoreQuality:true, scoreSuccess:true, scoreAccess:true,
  scoreCrowd:true, scoreTrophy:true, scoreOppRes:true, scoreOppNr:true,
} satisfies Prisma.HuntSummarySelect;
