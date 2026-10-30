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
| Q1 | Where does a project's feed live: a plain file the project adds lines to, or the hub reading the project's own database through a translator? | Step 2 | Allow both. The format is the same. Stage 1 uses scripted files. | |
| Q2 | How does the hub know which agents a project has? | Step 2 | A small card per project lists its agents. A new agent seen in the feed is added automatically. | |
| Q3 | What opens a waiting request, and what closes it? | Step 2 | A `needs_human` line opens it. A later line for the same request that is a decision or a finish closes it. | |
| Q4 | How does the hub find projects? | Step 2 | One list file in `config/`. | |
| Q5 | Which real projects get houses first, and what do their scripted days show? What is the team house's project called? | Step 7 | Start with approval-desk, then the owner picks. Scripted activity on a real name is always marked DEMO (H10). | |
| Q6 | How does a decision reach a real project: a command the hub runs, a local web call, or the project reading the hub's outbox? | Before Stage 2 | Decide with the owner. It changes another project, so it needs the owner's OK. | |
| Q7 | What choices can a request offer (approve and reject only, a changed amount, picking an order)? | Step 2 (shape), step 12 | The request's feed line lists its choices, and the desk shows them generically. Stage 1 offers approve and reject. | |
| Q8 | What makes something urgent? | Step 14 | The project marks it in the feed. The hub never guesses. | |
