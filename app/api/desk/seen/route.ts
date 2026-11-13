import { demoHub } from "../../../../lib/demo";
import { readDeskRequest } from "../../../../lib/decisions/from-the-desk";
import { markSeenAtTheDesk } from "../../../../lib/decisions/seen";
import { STATUS_OF_SEEN_OUTCOME, type SeenOutcome } from "../../../../lib/decisions/words";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The owner's own mark on a ready result. Nothing is sent to any project.
export async function POST(request: Request): Promise<Response> {
  const reading = await readDeskRequest(request);
  if (!reading.ok) {
    const body: SeenOutcome = { outcome: "not_understood", words: reading.words };
    return Response.json(body, { status: reading.status });
  }
  try {
    const { store, now } = demoHub();
    const outcome = markSeenAtTheDesk({ store, now: now() }, reading.sent);
    return Response.json(outcome, { status: STATUS_OF_SEEN_OUTCOME[outcome.outcome] });
  } catch (problem) {
    console.error(problem);
    const body: SeenOutcome = {
      outcome: "not_recorded",
      words: "The hub couldn't read its own record, so nothing was marked.",
    };
    return Response.json(body, { status: 500 });
  }
}
