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
