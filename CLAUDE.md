# DrawOdds project instructions

Read and follow [AGENTS.md](AGENTS.md) for this repository's product requirements, owner preferences, UAT personas, deployment approval and operational safeguards. It is the shared source of project instructions for every agent; update it when those instructions change. This file adds only what is specific to Claude's environment.

## Before you start

- `git fetch` and branch from `origin/main`. Other agents (Codex) merge to main often, sometimes dozens of commits a day. Before editing a file, check whether main already changed or built what you're about to build. Name branches `claude/<topic>`.
- Read the "Where to look first" table in AGENTS.md for the task, and the code it points to. Docs can lag the code; when they disagree, trust the code and fix the doc.

## Merging and deploying

The owner has authorized (2026-11-10) Claude to merge its own PRs into `main` once CI on the branch is green. No manual review is needed; Railway then deploys `main`. Do this with `gh api -X PUT repos/Keveritt43/DrawOdds/pulls/<n>/merge -f merge_method=merge`, then check the deploy and the live site. This doesn't lift the database and sync safeguards in AGENTS.md. Never merge with failing or pending CI.

The owner repeated this in chat on 2026-11-11: he does not want to approve PRs himself. When CI on the branch is green, merge your own PR in the same turn and go on to the deploy check; don't ask him to approve, review or merge, and don't end a turn on "PR open, waiting for you". If a merge is still refused by the session's approval check, report that in one line and carry on with the rest of the work.

## What this environment can and can't reach

- **Cloud container:** GitHub (`gh`) and package registries only. npm and pip installs may be blocked, and there is no `node_modules` in the repo. Agency sites (CPW, IDFG, ArcGIS, BLM) are **not** reachable from the shell.
- **Agency data:** fetch it through the built-in browser pane, when the desktop app is linked, or through an offline script the owner runs. In the browser, test a parser by bundling it with esbuild into an IIFE and running it in the page with `javascript_tool`. PDFs: load pdf.js 4.4.168 from cdnjs into a tab on the agency's domain.
- **Montana FWP** (fwp.mt.gov, myfwp.mt.gov, fwp-gis.mt.gov): the shell can't reach it (Bash network access is off for this account, so a new session doesn't help). Claude in Chrome can. To bring data back as a file, save it to the owner's `Downloads` folder and move it into the connected `Downloads\huntapp` folder.
- **Chrome allows one automatic download per tab.** A second download from the same tab is blocked silently, even after a real click. Use a fresh tab for each file. To move data that lives in one tab into a new tab, put it in the URL fragment (`#…`, which never reaches the server) of a link with `target=_blank`, click it with a real click, and save from the new tab.
- **CPW widen PDFs:** GET `https://cpw.widencollective.com/albert/viewer/anonymous/asset/widen:assets:asset:CPWZZ:{id}` with headers `x-widen-albert-client: einstein`, `x-widen-context-actor: widen:users:visitor:CPWZZ:anonymous`, `x-widen-context-tracking: doNotTrack=false; anonymous=true`, then read `document_previews.uri`.
- **Railway** is reachable through its MCP tools (IDs in AGENTS.md): use them for logs, status, deployments and variables. Never read `DATABASE_URL` or other secrets.

## Checks without node_modules

```bash
# unit tests
NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/tsx --test tests/*.test.ts
# bundle/syntax check of a file
/opt/npm-tools/node_modules/@esbuild/linux-x64/bin/esbuild src/lib/coOdds.ts --bundle --platform=node --outfile=/dev/null
# full typecheck and build: let CI do it after pushing the branch
gh api "repos/Keveritt43/DrawOdds/actions/runs?head_sha=$(git rev-parse HEAD)" --jq '.workflow_runs[] | [.name,.status,.conclusion] | @tsv'
```

A green test run here is not a typecheck. Don't call work done until CI on the branch is green, and the deployed page has been looked at, on desktop and phone widths.

## Habits that saved time

- Write the parser test from a real page of the source before fixing the parser.
- Backtest any model against the naive baseline before claiming accuracy, and put the numbers in the state doc (`docs/state-adapter-guide.md` §4).
- When an earlier plan of yours turns out wrong, say so in the reply and in the doc, then fix it.
