import { demoHub } from "../../../../lib/demo";
import { decideAtTheDesk } from "../../../../lib/decisions/decide";
import { STAND_IN_DOORS } from "../../../../lib/decisions/doors";
import { readDeskRequest } from "../../../../lib/decisions/from-the-desk";
import { readDeskDecisions } from "../../../../lib/decisions/read";
import { STATUS_OF_DECISION_OUTCOME, type DecisionOutcome } from "../../../../lib/decisions/words";
import type { VillageProblem } from "../../../../lib/village/state";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The decisions on record, for the desk to show. Only reads.
export function GET(): Response {
  try {
    const { store, now, realFeeds } = demoHub();
    return Response.json(
      readDeskDecisions({ store, doors: STAND_IN_DOORS, realProjects: realFeeds.projects, now: now() }),
    );
  } catch (problem) {
    console.error(problem);
    const body: VillageProblem = { problem: "The hub couldn't read its own record." };
    return Response.json(body, { status: 500 });
  }
}

// H1: the one place a decision is made, and only from what a button on the desk sent.
export async function POST(request: Request): Promise<Response> {
  const reading = await readDeskRequest(request);
  if (!reading.ok) {
    const body: DecisionOutcome = { outcome: "not_understood", words: reading.words };
    return Response.json(body, { status: reading.status });
  }
  try {
    const { store, now, realFeeds } = demoHub();
    const outcome = decideAtTheDesk(
      { store, doors: STAND_IN_DOORS, realProjects: realFeeds.projects, now: now() },
      reading.sent,
    );
    return Response.json(outcome, { status: STATUS_OF_DECISION_OUTCOME[outcome.outcome] });
  } catch (problem) {
    console.error(problem);
    // The writer throws only while it is still reading: nothing was written, and nothing was sent.
    const body: DecisionOutcome = {
      outcome: "not_recorded",
      words: "The hub couldn't read its own record, so nothing was sent. Nothing has changed.",
    };
    return Response.json(body, { status: 500 });
  }
}
