# Decisions

One entry per step, added at the end of that step's session. Newest at the bottom.

Template:

```
## Step N: <name> (YYYY-MM-DD)

**Built:** what now exists, in plain words.
**Decided:** choices made and why, including any open questions from RULES.md answered.
**Left for later:** anything noticed but kept out of scope.
```

## Entries

## Planning (2026-10-15)

**Built:** The planning files only: `PLAN.md`, `ARCHITECTURE.md`, `RULES.md`, `DECISIONS.md` and `CLAUDE.md`. No code.
**Decided:**
- The repo is public, like approval-desk. The first idea was a private repo; the owner said no private repos, even for the demo data.
- Real project names are fine in public files. Assumed, to confirm: company, client and employer names, keys and personal data still stay out (H13). The owner can loosen this.
- The hub is no longer purely view only. The owner chose to approve from the hub. The safety line moved: the hub never decides by itself, and it only carries the owner's decision to a project's own door, which re-checks it with the project's own rules and may refuse (H1 to H3). This is recorded here because it changes the original brief.
- Changing a real project (for example adding a decision door to approval-desk) needs the owner's OK and its own session in that project. It is not part of Stage 1.
- One server (`npm run hub`) runs everything. The hub reads feeds from disk, so no project needs its own server running for the hub to open.
- The feed is the only thing the hub reads. A translator per project turns its logbook into feed lines. approval-desk's logbook has no project or agent field, so its translator fills those in.
- Stage 1 runs on scripted, invented data, marked demo, with no paid AI calls and no network.
- The manager character does rounds: it knocks on each house, an agent hands over paperwork, and the manager carries it to the desk. Urgent items also get walkers: the agent walks out smoking and takes it to the desk itself (steps 9, 10 and 14).
- The desk is a normal web page, not part of the pixel canvas. The village is drawn on a plain canvas.
- The pixel engine is built fresh here. Ideas come from approval-desk's village prototype; no files are copied until the owner decides how to reuse code.
- The folder is `~/Projects/agent-hub` and the repo is named `agent-hub`. It stays local until the owner says push.
**Left for later:** Open questions Q1 to Q8 in `RULES.md`. The "Later" list at the bottom of `PLAN.md` (real approval-desk house, decision door, more real houses, live updates, sound).

## Step 1: Skeleton (2026-11-09)

**Built:** The empty project: Next.js with TypeScript, Vitest and Playwright, one sample test for each, and `npm run hub`, which opens a page that says "Agent Hub" on port 4040.
**Decided:**
- The hub runs on port 4040 so it never clashes with another project's server.
- The sample unit test checks that no AI or game packages are installed, so that promise is tested from day one.
- `AGENTS.md` is git-ignored. Next.js writes it by itself every time the hub starts; the owner chose to keep it out of the public repo.
- The browser tests can run on another port (`HUB_PORT`), so two copies of the repo can be tested at the same time.
- The planning files were already committed before this step, so this commit holds only the skeleton.
**Left for later:** `.env.example` is not created yet. Stage 1 needs no settings, so nothing depends on it.

## Step 2: Feed format (2026-11-09)

**Built:** The shared feed format as code (`lib/feed/`): the shape of a feed line, and a checker that accepts good lines and refuses bad ones, listing every problem in plain words. A sample translator turns invented approval-desk-shaped rows (all four kinds) into feed lines. The feed table in `ARCHITECTURE.md` matches the code, and a test fails if they drift apart.
**Decided:**
- Q1: both. A feed is a plain file with one line per event, or a read-only translator over the project's own records. Both go through the same checker. Stage 1 uses scripted files.
- Q2: a card per project names its agents. An agent seen in the feed but not on the card is added automatically. Plain code that is not an agent is called `system`.
- Q3: a `needs_human` line opens a request. A later line for the same request closes it if it points back at that line (a decision) or says done, blocked or failed (a finish). If a request asks again, the newest ask is the open one.
- Q4: one list file in `config/` names every project and where its feed lives.
- Q7 (shape): a line that needs the owner must list its choices, each with an id and a button label. The desk shows whatever is listed. Stage 1 offers approve and reject. Anything more is left to step 12.
- Every line must say whether it is demo or real. A line with no mark is refused, so scripted data can never pass as real (H10).
- Unknown parts are refused, not ignored, so a typo cannot silently drop an urgent mark. Nothing is trimmed or corrected by the checker.
- Times are UTC in one fixed shape. Line ids are text, so a project with non-number ids still fits.
- This step was built by an agent in its own copy of the repo while step 5 was built in another, with the owner's go-ahead to run the steps in parallel.
**Left for later:**
- The project list file and card (Q2, Q4) are answered in words only; the first step that needs them creates them.
- "Is this request still open?" has no shared helper yet. Steps 8 and 11 both need it.
- H6 says one decision per request, but a request may ask again. Step 12 has to say whether that means per request or per ask.
- Nothing says when a ready result leaves the desk. Step 12 ("seen") covers it.
- The invented rows guess at approval-desk's time format and details. The real translator (step 18) may need to convert.
