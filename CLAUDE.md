# Agent Hub: working rules

A pixel-art village that shows all of the owner's AI agents and what their
workflows are doing. One house per project, one resident per agent. A human
desk in the middle collects everything that needs the owner.

## Where things are

- `PLAN.md`: the steps, each with status, goal, done when, scope, dependencies and out of scope. The step marked `current` is the one to work on.
- `ARCHITECTURE.md`: the parts, the flow, the feed format, what the village shows, test standards.
- `RULES.md`: the hard rules (H1 to H13) and open questions.
- `DECISIONS.md`: one entry per step.
- `private/`: the owner's own notes. Never committed.

## Stack

TypeScript, Next.js, SQLite (Node's built-in one), Vitest, Playwright.
The village uses a plain canvas: no game library.
Ask before adding anything outside this list.

## Session rules

1. One step per session. Start by reading `PLAN.md` and finding the step marked `current`.
2. Stay inside that step's scope. If something else needs doing, note it; don't do it.
3. A step is done only when its "done when" is true. Show the proof (for example, test output).
4. Show the owner the diff and wait for their OK before any commit.
5. End every step by:
   - explaining in plain words what was built
   - adding an entry to `DECISIONS.md`
   - setting the step's Status to `done` in `PLAN.md`, ticking its box, and marking the next step `current`
6. Ask the owner questions one at a time, in plain words, with a recommendation.

## Constraints

- **Public repo.** Real project names are fine. No company, client or employer names, no keys, no personal data. See H13.
- **Other projects are never changed from here.** A change to another project needs the owner's OK and its own session in that project.
- **The hub never decides by itself.** It only carries the owner's decision to a project's own door (H1 to H3).
- **Stage 1 uses scripted, invented data.** No paid AI calls, no network. Scripted data is marked demo.
- **Hard rules are fixed.** Never loosen a rule in `RULES.md` to make something pass. Changing one needs the owner's OK and a `DECISIONS.md` entry.
- **Plain words on screen.** Rule IDs live in docs, code and tests only.
- **API keys and `.env` never committed.** `.env.example` stays without a value.
- **`private/` never committed.** Never copy anything from it into tracked files.

## Tests

- Feed checker, store, decisions, desk screen, village state: ordinary tests that must never fail. No AI calls, no network.
- Art: screenshot tests catch accidental changes; the owner judges how it looks.
- Tests name the rule they check by its ID, for example "H5: a decision that can't be written is not sent".
