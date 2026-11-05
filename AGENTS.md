# DrawOdds working constraints

Repository: https://github.com/Keveritt43/DrawOdds
Production: https://web-production-39e54.up.railway.app/
Railway: idaho-hunt-planner, project 3b787b52-68db-4733-850a-aa0e2685586e
Environment: production, 839f3c6e-14ff-43b5-a6ad-b23b5b6c0698
Services: web 250d9cb4-cbc7-45a2-ad97-1584e78014b3; sync 3d60c3e4-e872-4be6-b5c1-cf585c67e843; Postgres 099c9c2a-f489-4058-8d3d-dd168afcb9f6.

- Preserve Idaho's existing layout, navigation and functionality; no unrelated redesign. Colorado is under development.
- Preserve historical data. Do not run agency data sync, destructive Prisma commands, or schema startup scripts against production.
- Work on codex/ feature branches and prepare PRs. Do not merge, deploy or modify production without explicit approval.
- Automatic sync should remain disabled. Any later approved restoration must run at most weekly.
- `npm start` currently invokes `db:push`; do not use it against production for testing. `npm run build`, tests, typecheck and `prisma generate` do not push schemas.
- Use `docs/idaho-scoring-rollout.md` for scores-only recalculation. A dry run is read-only; apply requires reviewed exact inputs and approval for the target database.
- Production configuration inspected 2026-11-05 still had a daily sync cron and a schema-push sync start command. Branch config changes do not disable that live service. See rollout instructions.
