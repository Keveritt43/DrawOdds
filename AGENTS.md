# DrawOdds working constraints

Repository: https://github.com/Keveritt43/DrawOdds
Production: https://web-production-39e54.up.railway.app/
Railway: idaho-hunt-planner, project 3b787b52-68db-4733-850a-aa0e2685586e
Environment: production, 839f3c6e-14ff-43b5-a6ad-b23b5b6c0698
Services: web 250d9cb4-cbc7-45a2-ad97-1584e78014b3; sync 3d60c3e4-e872-4be6-b5c1-cf585c67e843; Postgres 099c9c2a-f489-4058-8d3d-dd168afcb9f6.

- Preserve Idaho's existing layout, navigation and functionality; no unrelated redesign. Colorado is under development.
- Preserve historical data. Do not run agency data sync, destructive Prisma commands, or schema startup scripts against production.
- Work on codex/ feature branches and prepare PRs. Standing owner approval granted 2026-11-06: complete requested DrawOdds work, run appropriate checks, and merge/deploy the completed changes to production without asking for confirmation again. Carry through deployment and verify production health and the changed behavior; do not stop at a PR. This approval persists for future work in this project unless the owner revokes it.
- Standing deployment approval does not remove the historical-data protections below: destructive database/schema operations, Idaho agency synchronization, and restoration of automatic sync still require specific approval as described here.
- Automatic sync should remain disabled. Any later approved restoration must run at most weekly.
- `npm start` runs Next.js only; schema operations are separate and require review. `npm run build`, tests, typecheck and `prisma generate` do not push schemas.
- Standing owner approval includes requested scores-only corrections in the production database (clarified 2026-11-06). Use `docs/idaho-scoring-rollout.md`: take a fresh read-only snapshot, review exact inputs and proposed scores, apply only the seven score columns in a stale-plan-protected transaction, and verify historical data and all non-score fields remain unchanged. Do not ask for separate approval for this scores-only workflow. Agency synchronization, destructive database/schema operations, and restoration of automatic sync remain excluded.
- Idaho rollout approved 2026-11-05: PR #1 merged, 1,161 Idaho rows recalculated; all non-score summary fields verified unchanged. Live automatic sync cron is cleared, sync start is a no-op, web startup sync is disabled, and schema pushes were removed from web startup.
- The owner explicitly authorized this Colorado task to fetch CPW deer/elk reports and deploy Colorado after checks pass. This does not authorize Idaho agency synchronization. Related seasons must share a unit and an actual open date.
