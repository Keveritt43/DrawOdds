# Idaho scores-only rollout

## Completed rollout — 2026-11-05

The owner approved rollout. PR #1 was merged and deployed successfully. A reviewed plan read 1,303 Idaho summaries and updated 1,161 rows, changing only the seven score columns. The apply transaction verified every non-score field remained identical, and a stale-plan retry was rejected. Hunt 2-1-2-9 now shows Quality 48 and Opportunity 48 at its observed 97/517 harvest (18.76%). Local exact before/plan/apply artifacts are retained under ignored out/.

Live automatic synchronization is disabled: the sync cron is cleared, its start command is a no-op, and web startup sync is disabled. Web starts Next.js directly with no schema push or pre-deploy schema commands. No Idaho agency synchronization or destructive schema operation was run. The application and scores require coordinated review for any future rollback.

The procedure below was prepared before approval. References to the former live hazards and unavailable initial credentials describe that earlier inspection, not the current configuration.

## Historical production hazards (resolved)

On 2026-11-05 Railway reported the sync service cron as `0 10 * * *` (daily at 10:00 UTC), with start command `npx prisma db push --skip-generate && npm run sync`, tracking an older pinned commit. Web defines SYNC_ON_START; its value is unavailable through OAuth. Do not assume the live service is disabled because this branch is safe. No live settings were changed, per the owner's approval requirement.

Review and approve a separate production configuration change to clear the sync cron, remove the schema-push start command, and disable startup sync (BOOTSTRAP_SYNC=0; remove SYNC_ON_START). Confirm no currently running sync job remains before taking a scoring snapshot. This branch removes the checked-in cron and schema push from the sync service, makes no-argument sync opt-in with AUTO_SYNC_ENABLED=1, and makes web bootstrap opt-in with BOOTSTRAP_SYNC=1. Explicit manual sync steps remain possible for separately approved maintenance. Existing Railway overrides and pinned old commits require separate attention; merging code alone is insufficient.

If synchronization is explicitly restored in a future review, choose a weekly schedule such as `0 10 * * 0`, never daily; document that approval. Leave bootstrap disabled so restarts do not add extra sync runs.

## Recalculate only stored scores

1. Review the model and comparison report; take a normal database backup. First exercise this procedure on a local/staging copy, using a database role restricted to reading HuntSummary and updating only its seven score columns. Obtain credentials through the owner's approved channel; never commit them.
2. Install dependencies and generate the Prisma client. Do not run `npm start`, `db:push`, migrations, `npm run sync` or summary rebuilds. Run tests/typecheck/build normally.
3. Point DATABASE_URL at the intended database, preferably with a read-only role for this step. Run `npm run scores:recalculate -- --dry-run out/idaho-score-plan.json`. It sets a read-only repeatable-read transaction, reads Idaho summary inputs plus old scores, and creates a new local plan file without overwriting an existing one. No network calls to agencies occur. Each row includes its before/after score values and the plan includes a digest of exact inputs and previous scores.
4. Review exact before/after values, null coverage, species/weapon/sex distributions and changed rankings. Exported CSV comparisons in this PR are rounded estimates and cannot replace this review. Verify hunt 2129 and capped tags against the full-precision plan. Archive the plan with the backup.
5. Only after approval for the specific target database, deploy the reviewed application and coordinate the score write in the same maintenance window, so descriptions and stored scores do not remain inconsistent. Keep all sync and other summary writers stopped. The existing web start command invokes schema push, so review/change that deployment procedure separately before a production release; this scoring change needs no schema change.
6. Apply the exact reviewed file with `npm run scores:recalculate -- --apply out/idaho-score-plan.json`. The command recomputes from current Idaho inputs and requires an exact match of the model, row set, inputs, old scores and proposed updates. Any stale data or tampered plan fails before writes. One serializable transaction updates only scoreQuality, scoreSuccess, scoreAccess, scoreCrowd, scoreTrophy, scoreOppRes and scoreOppNr, scoped by both id and state=ID. Any failure rolls back the transaction; regenerate/review the plan rather than silently retrying after a conflict.
7. Verify page scores, residency-aware filters/sorts and map values. Verify historical table counts and non-score HuntSummary columns are unchanged; Colorado must be unchanged. The new calculation and old stored scores may differ until recalculation; code deployment alone does not migrate stored values.

There is no automatic score backfill on startup. `summary` was deliberately not used: although it has no agency requests, it deletes and recreates Idaho summary rows and changes more than scores. The new command never imports the sync runner.

## Rollback

The reviewed plan preserves all previous score fields. If rollback is approved, keep writers stopped and use a reviewed transaction to restore only those seven fields by Idaho id from `before`, first requiring current values to match the plan's `after`. If inputs or current scores have changed, stop for review. Roll back the application descriptions/model at the same time. No automated production rollback was run.

## Validation

`npm test` exercises the 2129 regression, all controlled-elk rates below 20%, monotonic success/access/density, bounded trophy influence, missing/invalid data, sample floors, absolute Opportunity, and stale/tampered plan rejection. `npm run scores:compare` reproduces the snapshot comparison offline. The initial review had no database credentials. The approved maintenance run subsequently validated exact inputs, serializable score-only updates, non-score field equality and stale-plan rejection against production.
