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

## Step 3: Hub store (2026-11-09)

**Built:** The hub's own add-only record of feed lines (`lib/store/`), in SQLite using Node's built-in one. Every line goes through the feed checker first; a refused line is not stored and the caller gets the plain-words reasons back. Adding the same line twice stores it once.
**Decided:**
- The database itself refuses changing, deleting and overwriting a line, not only the code in front of it (H4). Tests try raw SQL from a second connection and see it fail.
- A different line that reuses a project's line number is refused in plain words and the first line stays.
- "The same line" means the same data; the order of parts inside its details does not matter.
- Lines are read back in the order they happened, with a second order (the order they arrived) for a reader that checks back for new lines.
- The record keeps no "stored at" time, so playing the same lines into two fresh records gives identical data. Step 4 needs that.
- Opening the store always needs a path, so a test can never open the real file by accident. The real file lives in `data/`, which is git-ignored.
- A real database failure raises a clear error, which step 12 uses for H5.
**Left for later:**
- SQLite cannot stop someone with the file from deleting it or removing the guards. The guards cover changes to lines only; reopening the store puts missing guards back.
- The checker accepts names with broken characters. The store copes; the checker could refuse them.
- `ARCHITECTURE.md` part 5 does not describe the table layout; it lives in `lib/store/schema.ts`.

## Step 4: Scripted demo data and player (2026-11-09)

**Built:** Two invented, scripted days in the shared feed format (`lib/demo/`): approval-desk with one agent, and a team house with three. A player fills in the recent past when the hub opens, then adds each new line when its moment comes. Every line is marked demo. A read-only route (`/api/events`) lists recent events.
**Decided:**
- Q5, in part: the team house's project is called `boxcutter` for now. The owner has not confirmed the name; it is written in one place (`lib/demo/scripts/team-house.ts`) so it is a one-line change, and a test keeps it that way.
- Each script is a short day that repeats (20 minutes for approval-desk, 30 for the team house), counted from a fixed start date. A line's time and number come only from the script and the day count, so the same moment always gives the same lines and replaying adds nothing twice. Something is always happening when the hub opens.
- Every waiting request is closed inside its own scripted day, so a database that is kept between runs never fills up with open requests.
- Agents arriving and leaving are lines in the feed, so the number of residents can change without changing the format.
- The player starts on the first request to the hub, once per server, and survives hot reload.
- The database location can be set with `HUB_DATABASE_PATH`, so browser tests can use their own file.
- Next.js serves the built-in SQLite from a route with no config change.
**Left for later:**
- After editing a script, delete `data/hub.sqlite`; changed lines for the current scripted day are refused until the next one.
- There is no way yet to freeze the player's clock for a running hub. Screenshot tests that show feed data need one (step 8).
- Scripted "the owner approved" lines are demo data from the project, not decisions made at the hub's desk. Step 12 decides how they sit side by side.
- Port 4045 cannot be used with Next.js (it is on its reserved list).

## Step 5: Pixel engine (2026-11-09)

**Built:** The pixel engine (`lib/village/engine/`): a small fixed screen (384 by 216) drawn in memory and shown on a plain canvas at a whole-number scale, always sharp. A 28-colour dusk palette, a small pixel font stored as data in the repo, helpers for rectangles, sprites and text, and a clock with speed and pause. A throwaway page at `/lab` shows the palette, sample text and an animated campfire.
**Decided:**
- The screen is 384 by 216: it fills a 1080p screen exactly at 5x, fits a laptop window at 3x, and leaves room for several houses and their signs.
- The picture is built in memory and the canvas only shows it, so nothing can blur it and drawing can be tested without a browser.
- Sprites and helpers take colour names only, so everything stays inside the palette.
- The clock never reads real time by itself; the frame loop feeds it. That makes it steppable by hand, so screenshots and tests are exact. Pause is the only way to stop time.
- The font is fixed width, 5 by 9, with capitals, lowercase, digits and punctuation.
- Built fresh; nothing was read or copied from another project.
**Left for later:**
- Saved screenshots are named for macOS. Running the browser tests on another system would need new ones.
- No see-through drawing or glow yet; a later step can add it.
- `/lab` stays reachable in the running app. No step removes it yet.

## Step 6: Plaza and the human desk (2026-11-09)

**Built:** The home page now shows the plaza at dusk: a sunset sky, grass, two dirt streets and a road to the hills, a paved square in the middle, trees, plants, lamp posts, broken robot arms and cigarette butts. The human sits in the middle at his desk and types at an old boxy computer; between typing he reads the screen, sips coffee, looks around, leans back and blinks. The computer is a real button that the keyboard and a click both reach. It does nothing yet.
**Decided:**
- A slanted top-down view with a strip of sunset sky, so it reads as dusk at a glance.
- Two streets and a walk through the square, with six clear house lots along them. Every lot's doorstep already touches a street, so houses need no new paths.
- The layout is data (lots, paths, and the desk's key spots: where a visitor stands, where the shoulder tap lands, where a paperwork stack and the alert mark go). Later steps read it instead of guessing.
- Everything that moves is worked out from the clock time, apart from the drawing, so tests check what is happening and not only pixels.
- `/?time=4200&scale=2` holds one exact frame, the same trick as the lab page, so screenshot tests never flicker.
- The focus mark on the computer is painted into the picture as yellow corner brackets.
- The seated human is 16 by 24 pixels; a standing character will be about 26 tall. Houses and doors are sized to that.
**Left for later:**
- The walk through the square runs under the desk. Walkers (step 9) have to go round it on the paving.
- House signs will be tight: "approval-desk" is 78 pixels wide in the pixel font and a lot is 80.
- The screen-reader description of the picture is fixed text for now; the live summary is step 15.
- The owner has not judged the look yet. (Later the same week the owner said the layout is fine for now.)

## Step 7: Houses and signs (2026-11-11)

**Built:** Houses stand around the plaza from one list (`config/houses.ts`): approval-desk and the team house on the upper street, and two for-sale houses on the lower street. Each project house has a neon sign on its roof with its name, and props outside: a rubber stamp and ticked paperwork for approval-desk, a cardboard box and a box cutter for the team house. For-sale houses are dark cottages with a "FOR SALE" board. Adding a house is one entry in the list, and a test proves it with a fifth house.
**Decided:**
- Q5: approval-desk first, then the team house. The team house is called boxcutter for now; the owner has not confirmed the name, and it is still written in one place. Two houses stand for sale until the owner picks the next projects. Scripted activity is always marked DEMO.
- The DEMO tag shows already, from the list's "demo or real" field, so a lit window under a real project's name is never unmarked (H10). Step 8 only has to keep it.
- The list is a TypeScript file so it can take the team house's name from its one place instead of retyping it.
- A sign holds up to 13 letters on one line, so "approval-desk" stays whole; its board hangs a few pixels over the lot. Longer names break in two at a hyphen or space.
- The glow is a dimmer colour around the letters plus a speckled halo, with bulbs that chase and a letter that buzzes out now and then, all worked out from the clock.
- How a house is built (brick office, timber workshop, plaster cottage) is its own list field, apart from its sign, so houses differ in more than the sign.
- Each house is drawn from a small status (lit windows, dark or not, a note, a tag) with defaults for now. Step 8 fills it from the feed.
- This step was cut off once by a usage limit and picked up again from its saved files.
**Left for later:**
- Houses are not clickable yet (step 13). Their click areas are ready.
- The list has no agent cards or feed locations yet (Q2, Q4); the first step that needs them adds them.
- A plaza lamp post stands just left of the team house's door and its glow speckles that wall. Moving it is the owner's call.
- A third sign style ("pink star") exists but no house uses it yet.

## Step 8: The village comes alive from the feed (2026-11-11)

**Built:** Houses now follow the hub's record. Each house lights one window per agent at home: bright while that agent is working, soft orange while it is in but between jobs, off when nobody is there. A house with no news for five minutes goes dark with a "no news" note, and so does a house whose lines can't be read, while the others keep running (H9). The DEMO tag shows in every case (H10). The page asks a new read-only route (`/api/village`) every two seconds, and the picture's description for screen readers says the same news in words.
**Decided:**
- One pure function turns feed lines plus a moment into the village's state: who is home, who is working and on what, what is waiting for the owner and for how long. Later steps (manager, paperwork, desk, house insides, walkers) all read that same state.
- The rule for what opens and closes a waiting request (Q3) is built once, in `lib/feed/requests.ts`, so the desk screen uses the same one.
- An agent is home from its first line until its "leave" line, so a real project with no arrive and leave lines still works, and a new agent shows up by itself (Q2).
- "A while" is five minutes without a line. The longest quiet stretch in the scripts is just over three, so a demo house only goes dark when its feed has really stopped. Nobody home is not "no news": the windows are off but the sign stays on.
- The note says "no news" for both silence and a broken feed. The reason is kept in the data only.
- A dark house still lists its waiting requests, because the owner still owes an answer.
- Browser tests run against a hub frozen on one moment (`HUB_FROZEN_AT`) with its record in memory, so every run sees the same village and leaves nothing behind. `npm run hub` without it is fully live.
**Left for later:**
- Nothing in the rules says what clears a ready result. For now it stays ready until its request says something newer, so results pile up. Step 10's stack and step 11's list need an answer; step 12's "seen" is the likely one.
- Five minutes is tuned to the demo. A real project that is quiet overnight would show "no news"; step 18 should give real houses a longer wait.
- The village looks back 24 hours, so a request waiting longer than a day drops out of the picture (the record keeps it).
- If the owner's own hub is running on port 4040, `npm run e2e` reuses it and fails with a plain message asking to stop it first.
- `ARCHITECTURE.md`'s "what you see" table does not mention the soft window or the five minutes yet.

## Step 9: The manager's rounds (2026-11-12)

**Built:** The manager walks his round on the plaza: from behind the human's chair, along the paths to each occupied house in list order, three knocks, a wait, on to the next, then back to rest at the desk. For-sale houses are skipped. A test shows a new house joins the round with only a list entry added.
**Decided:**
- What he is doing at any moment is worked out from the clock time and the house list alone, apart from the drawing, so tests check it as data.
- Walking is a general helper (`lib/village/routes`): the shortest walk between two spots along paths and paving, going round the desk. Steps 10 and 14 reuse it.
- The round is built from named legs (walk, knock, wait), so step 10 can add the handover.
- How he looks and his pace were picked in the parallel run; see "Calls to review" in `PLAN.md`.
**Left for later:**
- The screen-reader text describes the round as a whole, not what he is doing right now. Step 15 has what it needs to say that.

## Step 10: Handover and the paperwork stack (2026-11-12)

**Built:** When a house has something waiting for the owner, its agent steps out at the door during the manager's call and hands it over ("oh snap, master has to see this"). The manager carries it to the desk smoking, taps the owner on the shoulder ("here you go, master") and drops it on the stack. The stack grows and shrinks with what is waiting. A yellow exclamation mark shows above the computer until the computer is pressed.
**Decided:**
- What has been carried so far is history, not something the clock alone can tell. It is kept as a small state machine (`lib/village/delivery/`): each item goes from the house, to handed over, to carried, to the desk. The page steps it; the drawing only reads it. Tests play scripted "needs a decision" and "result ready" news through the whole sequence.
- Items already waiting when the page opens are on the desk from the first frame, so a fixed frame is always the same.
- The same landing, stack and mark work for any carrier, so step 14's walkers reuse them.
- "The desk was opened" is the press on the computer. Step 11 makes the same press open the desk screen.
- Looks and timing were picked in the parallel run; see "Calls to review" in `PLAN.md`.
**Left for later:**
- The mark comes back after a reload, because nothing remembers what the owner has already seen. Step 11 can hand that back in.
- The screen-reader text does not mention the stack or the mark yet (step 15).

## Step 11: Desk screen (2026-11-12)

**Built:** The desk (`/desk`): an ordinary web page in the village's dusk colours. It lists everything waiting for the owner from all projects, each with who sent it, what it is, how long it has waited and the choices on offer, with urgent and DEMO items marked. Below that is a log of everything that happened, with filters by project and by agent. It opens from a click on the computer, Enter or Space on it, or the D key, and Esc goes back. It only reads.
**Decided:**
- The desk gets its data from read-only routes it asks from the browser (`/api/village` and a new `/api/desk/log`), so a quiet hub or one failing project never blanks the page (H9).
- The three-project case is proven with a scripted hub answer in the browser test, with an invented third project, because the demo keeps two projects. The real frozen hub covers those two.
- A real house's log shows real lines only, and a demo house's scripted lines only, the same as the village.
- A line's `details` are not shown, because some values read like code (H12). A browser test scans the desk for rule codes.
- The desk remembers what it has shown for this browser tab, so the plaza's alert mark stays cleared for those papers.
- Each waiting card has a place for actions at its foot, empty for now. Step 12 fills it.
- Order, wording and the shortcut key were picked in the parallel run; see "Calls to review" in `PLAN.md`.
**Left for later:**
- The log shows each project's newest 200 events, with no way to page further back.
- Ready results pile up on the desk until step 12's "seen".
- Filters are not kept in the page address.
- `ARCHITECTURE.md` does not mention `/api/desk/log` yet.

## Step 13: Inside the house (2026-11-12)

**Built:** Every house on the plaza is a real button the mouse and the keyboard both reach. Opening one shows its inside: one station per agent (a small robot at a desk) with a card giving the agent's name, its current step and what it is doing, straight from the feed. Two or more agents get bunk beds and a worn-out look. A for-sale house is empty, and a house with no news is dark. Esc or the "< Plaza" button goes back, and focus returns to the house that was opened. The DEMO tag stays visible inside (H10).
**Decided:**
- The room's layout is worked out from the list of agents alone (1 to 10), apart from the drawing, and tested as data.
- The ten-agent room is drawn from invented state on a throwaway page (`/lab/inside`), so the demo scripts stay as they are.
- The inside takes a per-agent "away" flag already, for step 14.
- The pixel font has no euro sign, so a room writes "EUR" instead.
- Looks, layout and wording were picked in the parallel run; see "Calls to review" in `PLAN.md`.
**Left for later:**
- A euro sign in the pixel font.
- While a house is open, the plaza is still drawn underneath each frame. Wasteful, not visible.

## Step 14: Urgent walkers (2026-11-12)

**Built:** An urgent item that arrives while the page is open sends its own agent out of the door at once. It walks the paths smoking, taps the owner's shoulder, drops its paperwork on the stack and goes home. Ordinary items still wait for the manager. While the agent is out, its house shows it: the door stands open, its window is dark, and its station inside is empty.
**Decided:**
- Q8: a line is urgent only when the project itself writes `urgent: true` on it. The hub never works urgency out from the wording, the amount or how long something has waited, and no new feed field was needed.
- The hub does not guess who walks either: only the agent that sent the line, and only while the feed shows that agent at home. Otherwise the manager brings it on his next call.
- The walk is one more carrier in the delivery state machine from step 10, so the landing, the stack and the alert mark behave the same.
- Items already waiting when the page opens stay on the desk from the start, as in step 10.
- Finished in a second sitting: the first agent was cut off by a usage limit and its saved work was picked up as it was.
- Words, looks and who-goes-first were picked in the parallel run; see "Calls to review" in `PLAN.md`.
**Left for later:** nothing for this step.

## Step 17: Clipboard on the human desk (2026-11-12)

**Built:** A small clipboard on the pixel desk that the mouse and the keyboard both reach (and the C key from the plaza). It opens the build board (`/clipboard`), a normal web page in the desk's dusk look: one row per project with a bar of done steps out of the total, the numbers as text, and the name of the current step. The hub only reads the plans.
**Decided:**
- Reading a plan is one small function from a `PLAN.md`'s text to total, done and current step. It understands both plan formats the owner uses (checkbox steps and numbered heading steps) and counts only real steps.
- Where the plans are is a setting (`HUB_PLANS_FOLDER`), never a path written into the repo. Unset, the board shows this hub's own plan only.
- The reader opens only `PLAN.md` at the top of each project folder, never follows links out of the folder, never reads anything named `private`, and never writes. A test shows the files are unchanged after a read.
- A project whose plan is missing or can't be understood says so in plain words and the others still show.
- Browser tests read invented plans kept in the repo (`e2e/plans/`), never the owner's own projects.
- Finished in a second sitting from the first agent's saved work, after a usage limit cut it off.
- The key, the page's name and the bar's look were picked in the parallel run; see "Calls to review" in `PLAN.md`.
**Left for later:** the README does not mention the setting yet (step 16).

## Step 18: First real house: approval-desk (2026-11-12, not finished)

**Built:** A read-only translator (`lib/feed/translators/approval-desk.ts`) that turns approval-desk's logbook rows into checked feed lines marked real, each keeping its own time. When the hub is started with `APPROVAL_DESK_DATABASE` set, it feeds the last ten entries into its record, then anything newer every five seconds; the house loses its DEMO tag and its scripted day is not played. Unset, nothing changes.
**Decided:**
- The village reads a real house from real lines only and a demo house from scripted lines only, so the two never mix.
- Old entries are shown as they are: a dark house with "no news". Times are never moved to look live.
- A real house goes dark after one hour without news; demo houses stay at five minutes.
- Every real line is credited to `refund-agent`.
- A row the translator can't read is refused in plain words and never stops the rest (H8, H9).
- The translator never writes: tests show the database's bytes are unchanged and that a write through its connection fails. Databases in write-ahead mode are refused, because even a read-only open would leave side files in the other project's folder.
- The real gate outcome sits at a different place in the row than the step 2 sample assumed. The translator follows the real shape.
- Built in the parallel run, with the owner's go-ahead for the whole remaining plan.
**Left for later:**
- Not ticked: no approval-desk database has ten logbook entries, so the ten-entry run is proven only on invented rows.
- `ARCHITECTURE.md`'s "how approval-desk fits" paragraph and its folder list are out of date.
- `/api/events` still lists every stored line, real and scripted.
- Neither the README nor `.env.example` mentions the new setting yet.
