# Hard rules

These never change to make something pass. Each rule has an ID so tests and
code can point to it (for example, "H5: a decision that can't be written is
not sent"). The IDs live in docs, code and tests only. The screen always uses
plain words (H12).

| ID | Rule | Result | Applies to | Checked by |
|----|------|--------|------------|------------|
| H1 | The hub never decides anything by itself. A decision exists only when the owner clicks it at the desk. | Nothing happens | The whole hub | Decision writer |
| H2 | The hub only carries the owner's decision to the project. The project re-checks it with its own rules and may refuse. The hub shows the refusal in plain words and doesn't try another way around it. | The project's answer wins | Every decision | Decision door |
| H3 | The hub never changes a project's logbook, database or files. It reads feeds, and the only way in is the project's own decision door. | Block | Everything in the hub | Translators, store, decision writer |
| H4 | The hub's own record is add-only. Lines are never changed, deleted or overwritten. | Block | Hub store | Store |
| H5 | If the hub can't write a decision to its own record, the decision isn't sent. | Step doesn't happen | Decision writer | Decision writer |
| H6 | A request gets one decision from the owner, sent once. | Refuse the second | Decision writer | Decision writer |
| H7 | A reject needs a note saying why. | Refuse | Decision writer | Decision writer, desk screen |
| H8 | A feed line that doesn't match the format is refused and shown as a problem. The hub never guesses missing parts. | Refuse | Feed | Feed checker |
| H9 | One broken or silent project never stops the village. Its house goes dark with a plain "no news" note and the others keep running. | Keep running | Village, store | Village state |
| H10 | Scripted data is always marked demo, and the screen says so. Demo data never looks like real activity. | Mark it | Demo player, village, desk screen | Demo player, village, desk screen |
| H11 | Stage 1 makes no paid AI calls and no network calls. | Block | The whole app | Tests run with the network off; no AI package installed |
| H12 | The screen speaks plain words. Rule codes and ids never show. | Fix before done | Every screen | Playwright text scan |
| H13 | Nothing secret or private is committed: no keys, no company, client or employer names, no personal data. | Block | Every tracked file | `.gitignore`, the public check |

## Where each rule is tested

| ID | Tested in step |
|----|----------------|
| H1 | 12 |
| H2 | 12 |
| H3 | 3 (store), 12 (decision writer), Stage 2 (translators open projects read-only) |
| H4 | 3 |
| H5 | 12 |
| H6 | 12 |
| H7 | 12 |
| H8 | 2 |
| H9 | 8 |
| H10 | 4, 8, 11 |
| H11 | 1 (no AI package), 4 (tests with the network off) |
| H12 | 11, 15 |
| H13 | 1 (`.gitignore`), 16 (the public check) |

## Open questions

Record each answer here and in `DECISIONS.md`. Each has my recommendation.

| # | Question | Settle in | Recommendation | Answer |
|---|----------|-----------|----------------|--------|
| Q1 | Where does a project's feed live: a plain file the project adds lines to, or the hub reading the project's own database through a translator? | Step 2 | Allow both. The format is the same. Stage 1 uses scripted files. | Both. A feed is either a plain text file the project adds to (one JSON line per feed line) or a translator that reads the project's own logbook read-only. Both give the same lines to the same checker. Stage 1 uses scripted files. (Step 2) |
| Q2 | How does the hub know which agents a project has? | Step 2 | A small card per project lists its agents. A new agent seen in the feed is added automatically. | As recommended. Each project's card, kept in the list file from Q4, names its agents. An agent that turns up in the feed but isn't on the card is added to the village automatically, so the checker never refuses a line for naming a new agent. Plain code, like a gate, uses the agent name `system`. The card itself is made in the step that first needs it. (Step 2) |
| Q3 | What opens a waiting request, and what closes it? | Step 2 | A `needs_human` line opens it. A later line for the same request that is a decision or a finish closes it. | As recommended, made exact. A `needs_human` line opens it. A later line for the same request in the same project closes it when it is a decision (its `refers_to` points at the `needs_human` line) or a finish (its status is `done`, `blocked` or `failed`). If a request asks again, the newest `needs_human` line is the open one. (Step 2) |
| Q4 | How does the hub find projects? | Step 2 | One list file in `config/`. | As recommended. One list file in `config/` names every project, with its card (Q2) and where its feed lives (Q1). The hub knows only the projects on that list. The file itself is made in the step that first needs it. (Step 2) |
| Q5 | Which real projects get houses first, and what do their scripted days show? What is the team house's project called? | Step 7 | Start with approval-desk, then the owner picks. Scripted activity on a real name is always marked DEMO (H10). | approval-desk first, then the team house. The team house's project is called boxcutter for now: that name is not yet confirmed by the owner. It is written in one place (`TEAM_HOUSE_PROJECT` in `lib/demo/scripts/team-house.ts`), so confirming or changing it is a one-line change. The scripted days are the ones from step 4: approval-desk has one refund agent working through a refund inbox, and the team house has a planner, a builder and a checker working through jobs. Scripted activity is always marked DEMO (H10): each house's entry in `config/houses.ts` says whether its data is demo or real, and a demo house wears a DEMO tag on its sign. Two more houses stand for sale until the owner picks the next projects. (Step 7) |
| Q6 | How does a decision reach a real project: a command the hub runs, a local web call, or the project reading the hub's outbox? | Before Stage 2 | Decide with the owner. It changes another project, so it needs the owner's OK. | |
| Q7 | What choices can a request offer (approve and reject only, a changed amount, picking an order)? | Step 2 (shape), step 12 | The request's feed line lists its choices, and the desk shows them generically. Stage 1 offers approve and reject. | Shape settled (Step 2): a `needs_human` line must list its choices, and no other line may. Each choice is an `id` (the short word carried to the project's door) and a `label` (the plain words on the button). The desk shows whatever is listed. A waiting line with no choices is refused (H8): the hub never makes them up. Stage 1 offers `approve` and `reject`, and a choice with the id `reject` always needs a note (H7). Whether a choice can carry more than a note (a changed amount, an order) is settled in step 12. |
| Q8 | What makes something urgent? | Step 14 | The project marks it in the feed. The hub never guesses. | |
