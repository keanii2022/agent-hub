# Stage 1 plan

One step per session. The step marked **current** is the one to work on.
Part numbers match `ARCHITECTURE.md`. Rule IDs match `RULES.md`.

**How to use this file**

- A step is finished only when its "done when" is true, with proof shown (for example, test output).
- To tick a step: change its Status to `done`, tick its box, and mark the next step `current`.
- Statuses: `not-started`, `current`, `done`. Only one step is ever `current`.

**Milestones**

- **First look = steps 1 to 8.** One command opens the hub: the plaza, the human at his desk, the houses, all alive from scripted data.
- **The desk works = steps 9 to 12.** The manager's rounds, paperwork on the desk, the desk screen, and decisions.
- **Full village = steps 13 to 16.** Inside the houses, urgent walkers, controls, and a safe public README.

Stage 1 makes no paid AI calls and no network calls. All data is scripted and marked demo.

---

- [x] **Step 1: Skeleton**
  - **Status:** done
  - **Goal:** Start the project: git, Next.js with TypeScript, Vitest, Playwright, one sample test for each, and one command (`npm run hub`) that starts the hub. Nothing else.
  - **Done when:** both sample tests pass; `npm run hub` opens a page that says "Agent Hub"; `.env` and `private/` are excluded from git (checked with `git check-ignore`); no AI or game packages are installed.
  - **Scope:** repo root files (`package.json`, `tsconfig.json`, Next.js and Playwright config, `.gitignore`, `.env.example`, README stub), `app/` with one blank page, `tests/`, `e2e/`. The planning files in this folder go into the first commit, after the owner approves the diff.
  - **Dependencies:** none.
  - **Out of scope:** feed, store, art; creating the GitHub repo (stay local until the owner says push; it will be public).

- [x] **Step 2: Feed format** (parts 3 and 4)
  - **Status:** done
  - **Goal:** Write the shared feed format as code: types, plus a checker that accepts good lines and refuses bad ones with a plain-words reason. Settle open questions Q1 to Q4 and Q7 in `RULES.md`. Include one test where invented rows shaped like approval-desk's logbook (its four kinds) are translated into feed lines, to prove the format fits a real logbook.
  - **Done when:** good example lines pass; each kind of bad line (missing field, wrong type, bad time, unknown status) is refused with a plain reason (H8); tests show the same format works for a project with one agent and one with ten; the invented approval-desk-shaped rows translate into valid lines; the feed table in `ARCHITECTURE.md` matches the code.
  - **Scope:** `lib/feed/` (format, checker, sample translator for invented rows), `tests/feed/`, the feed section of `ARCHITECTURE.md`, open questions in `RULES.md`.
  - **Dependencies:** step 1.
  - **Out of scope:** reading approval-desk's real database or files; any storage; any art.

- [ ] **Step 3: Hub store** (part 5)
  - **Status:** current
  - **Goal:** The hub's own add-only record, in SQLite (Node's built-in one, as approval-desk does). It keeps the feed lines the hub has seen. Same idea as approval-desk's logbook: lines can be added, never changed, deleted or overwritten. Lines the checker refuses are not stored.
  - **Done when:** adding a line works; changing, deleting and overwriting a line all fail (H4); a refused line is not stored; adding the same line twice stores it once.
  - **Scope:** `lib/store/`, `tests/store/`, `data/` (the database file, git-ignored).
  - **Dependencies:** step 2.
  - **Out of scope:** the decisions table (step 12); any screen.

- [ ] **Step 4: Scripted demo data and player** (part 6)
  - **Status:** not-started
  - **Goal:** Invented, scripted feeds in the shared format: an approval-desk-style house with one agent, and a team house with three agents (its project name is settled in Q5). A player feeds them into the hub's store on a clock. When the hub opens, it first fills in the recent past so the village is already busy, then keeps playing new events. Every line is marked demo.
  - **Done when:** starting the hub loads the demo; running it twice gives identical data; every line is marked demo (H10); a read-only route lists recent events; the tests run with the network off (H11).
  - **Scope:** `lib/demo/` (scripts and player), one read-only route under `app/api/`, `tests/demo/`.
  - **Dependencies:** steps 2 and 3.
  - **Out of scope:** reading real projects; any art.

- [ ] **Step 5: Pixel engine** (part 7, base)
  - **Status:** not-started
  - **Goal:** Draw the pixel screen with a plain canvas: a small fixed-size screen scaled up sharp, a dusk colour palette, a small pixel font, drawing helpers, an animation clock, and pause. Built fresh in this repo; ideas come from approval-desk's village prototype, no files are copied unless the owner decides so (see `DECISIONS.md`).
  - **Done when:** a test page draws the palette, sample text and a sample sprite; it stays sharp (no blur) at 2x and 3x; a Playwright screenshot test passes; pause stops the animation.
  - **Scope:** `lib/village/engine/`, one throwaway test page (`app/lab/`), `tests/` and `e2e/`.
  - **Dependencies:** step 1.
  - **Out of scope:** the plaza, houses, characters, any feed data, any game library.

- [ ] **Step 6: Plaza and the human desk** (part 7)
  - **Status:** not-started
  - **Goal:** The main community area: ground, paths, trees, plants, and clutter (broken robot arms, cigarette butts). The human desk sits in the middle, with the human (the robot's human cousin) always at his computer, typing. The home page shows it.
  - **Done when:** `npm run hub` shows the plaza with the human at his computer; the human animates (typing, small idle moves); the computer can be reached by keyboard and by click (it does nothing yet); a screenshot test passes.
  - **Scope:** `lib/village/plaza/`, `lib/village/characters/human`, `app/page.tsx`, `e2e/`.
  - **Dependencies:** step 5.
  - **Out of scope:** houses, the manager, the desk screen, any feed data.

- [ ] **Step 7: Houses and signs** (part 7)
  - **Status:** not-started
  - **Goal:** Houses placed around the plaza from one list (project name, sign style, outside props). Each has a Vegas-style neon sign with its name, in a style that fits the project, and props that fit it (for example a box and a box cutter left outside for boxcutter). A path runs from the desk to every house. Houses can be for sale (empty, with a sign). Adding a house means adding one entry to the list, plus props if they are new. Settle Q5.
  - **Done when:** the plaza shows the approval-desk house, a team house, and two for-sale houses, each reached by a path; each sign shows its name; a test adds a fifth house by editing only the list.
  - **Scope:** `lib/village/houses/`, `config/houses`, `tests/`, `e2e/`.
  - **Dependencies:** step 6.
  - **Out of scope:** reacting to the feed (step 8); insides of houses (step 13).

- [ ] **Step 8: The village comes alive from the feed** (part 7)
  - **Status:** not-started
  - **Goal:** Houses react to the hub's record. Windows glow when an agent is working. The number of residents follows the feed, and can change. A house with no news for a while goes dark with a plain "no news" note, and one broken project never stops the others (H9). Every house on demo data shows a DEMO tag (H10).
  - **Done when:** playing the demo makes windows glow and go dark on schedule; changing the agent count in a script changes the residents; a house whose feed fails goes dark while the others keep running; the DEMO tag is visible; tests check the village state, not just pixels.
  - **Scope:** `lib/village/state/` (feed to village state), house drawing updates, `tests/`, `e2e/`.
  - **Dependencies:** steps 3, 4 and 7.
  - **Out of scope:** anyone walking around; the desk screen.

- [ ] **Step 9: The manager's rounds** (part 7)
  - **Status:** not-started
  - **Goal:** The manager character walks the paths from the desk to each house in turn, knocks, waits, moves on, and walks back to the desk. The route comes from the house list, so a new house joins automatically. At this step nothing is handed over yet.
  - **Done when:** the manager visits every occupied house in order and returns; for-sale houses are skipped; a test shows a new house joins the route with no code change.
  - **Scope:** `lib/village/characters/manager`, route logic, `tests/`.
  - **Dependencies:** steps 7 and 8.
  - **Out of scope:** handover, paperwork, the exclamation mark, urgent walkers.

- [ ] **Step 10: Handover and the paperwork stack** (part 7)
  - **Status:** not-started
  - **Goal:** When a house has something waiting for the owner (a request that needs a decision, or a result that is ready), the agent hands it to the manager at the door ("oh snap, master has to see this"). The manager walks it to the desk smoking, taps the owner on the shoulder ("here you go, master"), and drops a big stack. The stack grows with the number of waiting items. An exclamation mark shows above the computer until the desk is opened.
  - **Done when:** scripted "needs a decision" and "result ready" events play the full sequence; the stack size follows the waiting count; the exclamation mark shows, then clears when the desk is opened; tests check the sequence state.
  - **Scope:** village animation and state in `lib/village/`, `tests/`, `e2e/`.
  - **Dependencies:** step 9.
  - **Out of scope:** the desk screen (step 11); decisions (step 12).

- [ ] **Step 11: Desk screen** (part 8)
  - **Status:** not-started
  - **Goal:** Clicking the computer, or pressing a key, opens the desk screen: a normal web page (not the pixel canvas) listing everything waiting from all projects, with who sent it, what it is, and how long it has waited. It also has a log of all events with filters by project and agent. Plain words only (H12). Look only; no decision buttons yet.
  - **Done when:** Playwright opens the desk from the computer and from the keyboard; it lists waiting items from at least three projects; the filters work; the log is in order; no rule codes appear on screen.
  - **Scope:** `app/desk/`, `lib/desk/`, `e2e/`.
  - **Dependencies:** steps 3, 4 and 10.
  - **Out of scope:** approve and reject (step 12); real projects.

- [ ] **Step 12: Decisions from the desk** (parts 9 and 10)
  - **Status:** not-started
  - **Goal:** Approve, or reject with a note, from the desk; and mark a ready result as "seen". A decision is written to the hub's record first, then handed to the project's door. In Stage 1 the door is a stand-in per demo project that re-checks with its own scripted rule and may refuse. The hub shows the project's answer in plain words. Settle Q7.
  - **Done when:** Playwright tests pass for: approve accepted by the stand-in (the stack shrinks, the house reacts); reject without a note refused (H7); stand-in refuses and the reason is shown (H2); a second decision on the same request refused (H6); a record that can't be written means nothing is sent (H5).
  - **Scope:** `lib/decisions/`, a decisions table in `lib/store/`, buttons on the desk screen, `tests/`, `e2e/`.
  - **Dependencies:** step 11.
  - **Out of scope:** any real project; changing approval-desk; how decisions travel to real projects (Q6, Stage 2).

- [ ] **Step 13: Inside the house** (part 7)
  - **Status:** not-started
  - **Goal:** Clicking a house opens its inside: the agents at work at their stations, showing their current step from the feed. Two or more agents get a bunk bed and a worn-out, hard-working look. Any number of agents (1 to 10) lays out sensibly. A for-sale house is empty. There is a way back to the plaza.
  - **Done when:** houses with 1, 3 and 10 agents all lay out; each agent's current step comes from the feed; the for-sale inside is empty; Esc or a back button returns to the plaza; it works by keyboard; screenshot tests pass.
  - **Scope:** `lib/village/interiors/`, `tests/`, `e2e/`.
  - **Dependencies:** step 8.
  - **Out of scope:** approval-desk's detailed scene (Stage 2); agents walking out (step 14).

- [ ] **Step 14: Urgent walkers** (part 7)
  - **Status:** not-started
  - **Goal:** When the feed marks an item urgent, the agent leaves the house, walks the path smoking, taps the owner's shoulder, and drops its paperwork without waiting for the manager. Settle Q8.
  - **Done when:** an urgent scripted event triggers the walk; non-urgent items still go through the manager; the stack and exclamation mark behave as in step 10; a house shows that its agent is away while walking; tests check the sequence state.
  - **Scope:** `lib/village/characters/` and village state, `tests/`, `e2e/`.
  - **Dependencies:** steps 10 and 13.
  - **Out of scope:** new houses, new data formats.

- [ ] **Step 15: Controls and access**
  - **Status:** not-started
  - **Goal:** A speed button and a pause key. Every clickable place is reachable by keyboard. A plain-words summary of the scene for screen readers. A check that no rule codes or ids show on screen (H12).
  - **Done when:** Playwright tests pass for: every clickable place reachable by keyboard; pause freezes the village; speed changes it; a text scan of every screen finds no rule codes.
  - **Scope:** controls and labels across `app/` and `lib/village/`, `e2e/`.
  - **Dependencies:** steps 11, 12, 13 and 14.
  - **Out of scope:** new features.

- [ ] **Step 16: Safety check, README and demo**
  - **Status:** not-started
  - **Goal:** A check that fails if a secret or a banned kind of name is in a tracked file (H13). A README with screenshots and a short demo.
  - **Done when:** the check passes, and fails on a planted fake secret; a fresh copy runs from the README alone (`npm install`, `npm run hub`); the owner has read the README and confirmed nothing private is in it.
  - **Scope:** `README.md`, `scripts/check-public.ts`, screenshots.
  - **Dependencies:** all earlier steps.
  - **Out of scope:** new features; pushing to GitHub (the owner does that).

- [ ] **Step 17: Clipboard on the human desk**
  - **Status:** not-started
  - **Goal:** A clipboard on the human desk that shows the owner's build board: one bar per project with done/total and the current step, read from each project's PLAN.md. The hub only reads; nothing on the clipboard changes a plan.
  - **Done when:** the clipboard opens from the desk by click and by keyboard; its numbers match the PLAN.md files in a test with a scripted plan folder.
  - **Scope:** `lib/village/clipboard.ts`, `app/`, `e2e/`.
  - **Dependencies:** steps 6 and 11.
  - **Out of scope:** editing plans from the hub.

- [ ] **Step 18: First real house: approval-desk**
  - **Status:** not-started
  - **Goal:** A read-only translator that turns approval-desk's logbook into the hub's feed format, so the first house shows a real agent at work.
  - **Done when:** the translator runs against approval-desk's seeded database and the village plays its last ten logbook entries; a test proves the translator never writes.
  - **Scope:** `lib/feed/translators/approval-desk.ts`, tests.
  - **Dependencies:** steps 2, 3 and 8.
  - **Out of scope:** any change inside approval-desk.

---

## Later (not now)

Decided when each starts. The rules in `RULES.md` stay the same.

- **Real approval-desk house:** a read-only translator that reads its logbook. approval-desk is not changed to do this.
- **Decision door in approval-desk:** the small entrance that lets the hub hand a decision to the project, which re-checks it with its own rules. This changes another project, so it needs the owner's OK and its own session there (Q6).
- **More real houses:** boxcutter and the owner's other projects, and an easy "add a house" helper.
- **Live updates:** the hub notices new lines while it is open.
- **Approval-desk's detailed scene:** rebuilt from the village prototype as that house's inside.
- **Extras:** sound, a day palette.
