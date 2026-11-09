# Architecture

The hub only reads and carries. Each project keeps its own agents, its own
add-only logbook and its own rules. The hub never decides anything by itself.

## Parts

| # | Part | What it does | Uses AI? | Touches a project? | Built in step |
|---|------|--------------|----------|--------------------|---------------|
| 1 | Projects (outside this repo) | Run their own agents and keep their own add-only logbook | Their own | They are the projects | n/a |
| 2 | Translators | One per project. Turn that project's log lines into feed lines. Read-only | No | Read only | 2 (a sample), Stage 2 (real) |
| 3 | Feed | The shared format every project is translated into | No | No | 2 |
| 4 | Feed checker | Accepts good lines, refuses bad ones with a plain reason | No | No | 2 |
| 5 | Hub store | The hub's own add-only record of feed lines and decisions | No | No | 3, 12 |
| 6 | Demo player | Plays scripted, invented feeds into the store | No | No | 4 |
| 7 | Village | The pixel-art plaza, houses, insides and characters | No | No | 5 to 10, 13, 14 |
| 8 | Desk screen | Lists everything waiting from all projects, plus the log | No | No | 11 |
| 9 | Decision writer | Writes the owner's decision to the store first, then sends it | No | No | 12 |
| 10 | Decision door | Each project's own entrance for decisions. It re-checks with its own rules and may refuse | No | Only the project's own door | 12 (stand-in), Stage 2 (real) |

## Flow

```
Project (own agent + own logbook)
     │  read only
     ▼
Translator ──► Feed line ──► Feed checker ──► Hub store (add-only)
                                                   │
                              ┌────────────────────┴───────────────┐
                              ▼                                    ▼
                          Village (pixels)                    Desk screen
                  houses, manager, walkers, stack        waiting items + log
                                                               │
                                              owner clicks approve / reject
                                                               ▼
                                                        Decision writer
                                                     (store first, then send)
                                                               ▼
                                                     Project's decision door
                                              (re-checks with its own rules)
                                                               ▼
                                                  Answer shown in plain words
```

1. A project writes to its own logbook, as it always did.
2. A translator reads that logbook (read only) and turns each line into a feed line. Stage 1 has no real translators: the scripted demo data is already in feed format.
3. The checker refuses any line that doesn't match the format. The store keeps the good ones, add-only.
4. The village reads the store and shows what is happening. Nothing in the village invents status.
5. When something needs the owner, it goes to the desk (see "What you see" below). The owner opens the desk screen.
6. The owner approves, or rejects with a note. The decision is written to the store first. If it can't be written, nothing is sent (H5).
7. The decision is handed to the project's own door. The project re-checks with its own rules and may refuse. The hub shows the answer.

One server runs everything: `npm run hub`. No project needs its own server running for the hub to open, because the hub reads from disk.

## The feed

One line per step. It says which project, which agent, which request, what step, what happened, and when. It works the same for a project with one agent or ten. The names and types below are the ones in `lib/feed/format.ts`, and a test keeps this table and the code the same.

| Field | Type | Needed | Says | Example |
|-------|------|--------|------|---------|
| project | text | always | Which project | `"approval-desk"` |
| agent | text | always | Which agent did it (`system` for plain code, like a gate) | `"refund-agent"` |
| request | text | always | Which request or job | `"REQ-014"` |
| step | text, one word | always | What step, in one short word | `"gate_decision"` |
| what | text | always | What happened, in one plain sentence | `"Over the limit, sent to a person"` |
| status | one of the six below | always | How the village should react | `"needs_human"` |
| when | text, UTC time ending in `Z` | always | When it happened | `"2026-10-05T14:03:11Z"` |
| id | text | always | The project's own line number. No two lines of one project share it | `"41"` |
| refers_to | text | optional | The `id` of an earlier line this one is about | `"40"` |
| choices | list of `{ id, label }` | waiting lines only | What the owner may do. A `needs_human` line must list at least one; no other line may | `[{"id":"approve","label":"Approve"},{"id":"reject","label":"Reject"}]` |
| urgent | true or false | optional | The project marks it urgent | `true` |
| details | any JSON | optional | Extra information for the desk screen | `{"amount":250}` |
| demo | true or false | always | `true` on scripted data, `false` on real | `true` |

**Status values**

| Status | Meaning |
|--------|---------|
| `working` | A normal step happened |
| `needs_human` | Waiting for the owner's decision |
| `result_ready` | Worth the owner's eyes, no decision needed |
| `done` | The request finished fine |
| `blocked` | A rule stopped it |
| `failed` | Something broke |

**Choices.** Each choice has an `id` (the short word carried to the project's door) and a `label` (the plain words on the button). The desk shows whatever a line lists. Stage 1 offers `approve` and `reject`. A choice with the id `reject` always needs a note (H7).

**What the checker refuses (H8).** A line is refused, with every problem listed in plain words, when: a needed field is missing; a field has the wrong type (the `id` `41` as a number instead of the text `"41"`, for example); a text is empty; a name starts or ends with a space; the step is more than one word; the status isn't one of the six; the time isn't a real UTC time written like the example; a field isn't in the table above (extra information goes in `details`); the choices break the rule in the table; or a line points at itself. An optional field is left out when there is nothing to say; an empty value in its place is refused. Nothing is trimmed, filled in or corrected.

**Where a feed lives.** Either a plain text file the project adds to, one JSON line per feed line, or a translator that reads the project's own logbook read-only. Both give the same lines to the same checker. (Settled in step 2, Q1.)

**How approval-desk fits.** Its logbook has `id`, `logged_at`, `kind`, `request_id`, `refers_to` and `details`. A translator maps them to `id`, `when`, `step`, `request`, `refers_to` and `details` (the two line numbers become text), and fills in what the logbook doesn't say: `project`, `agent`, `what`, `status`, `demo`, and the `choices` on a waiting line. Its four kinds map like this: `gate_decision` (send to a human becomes `needs_human`, block becomes `blocked`, allow becomes `working`), `human_decision` (`working`), `refund_done` (`done`), and `refund_refused` (`blocked`). A kind or gate outcome the translator doesn't know is refused, never guessed. approval-desk is not changed. Step 2 proves this with invented rows in that shape (`lib/feed/sample-translator.ts`); the real logbook is first read in Stage 2.

**A request's life.** A `needs_human` line opens it. It is closed by a later line for the same request, in the same project, that is either a decision (its `refers_to` points at the `needs_human` line) or a finish (its status is `done`, `blocked` or `failed`). If a request asks again with a new `needs_human` line, the newest one is the open one. The desk shows the open ones. (Settled in step 2, Q3.)

## What you see

| The feed says | The village shows |
|---------------|-------------------|
| `working` | The agent works at its station; the window glows |
| `needs_human` | On the next round the manager knocks, the agent hands over the paperwork, the manager walks it to the desk, taps the owner and drops the stack. The stack grows. An exclamation mark shows above the computer |
| `result_ready` | The agent says "oh snap, master has to see this" and hands it over the same way |
| `urgent` | The agent walks out and takes it to the desk itself, smoking |
| `done` | A small celebration; the paperwork is stamped |
| `blocked` | A red alert emote over the house |
| `failed` | Sparks and smoke from the house |
| No news for a while | The house goes dark with a plain "no news" note |
| No project in the house | A for-sale sign |
| Scripted data | A DEMO tag |

## Planned folders

```
app/                 pages: the village (home), the desk screen, a few read-only routes
lib/feed/            the format and the checker
lib/store/           the add-only record
lib/demo/            scripted feeds and the player
lib/village/         pixel engine, plaza, houses, characters, insides
lib/desk/            what the desk screen shows
lib/decisions/       the decision writer and the stand-in doors
lib/translators/     one per project (Stage 2)
config/              the list of projects and houses
tests/  e2e/         Vitest and Playwright
data/                the database file (git-ignored)
private/             the owner's own notes (git-ignored)
```

The village is drawn on a plain canvas: no game library. The desk screen is an ordinary web page, so it is easy to test and to reach by keyboard.

## Test standards

### Never fails

Feed checker, store, decisions, the desk screen, and the village's state (what the village believes is happening).

- Ordinary tests: Vitest, plus Playwright for the village page and the desk screen.
- Stage 1 uses scripted data only: no AI calls and no network, so tests are fast, free and give the same result every time.
- Each test names the rule it checks by ID (see `RULES.md`), for example "H5: a decision that can't be written is not sent".

### Looked at by the owner

The art: how the plaza, houses, signs and characters look and move.

- Playwright screenshot tests catch accidental changes.
- Whether it looks good is the owner's call, step by step.
