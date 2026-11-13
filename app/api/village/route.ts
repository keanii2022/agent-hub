import { houses } from "../../../config/houses";
import { withoutSeenResults } from "../../../lib/decisions/seen";
import { demoHub, readVillageOfHub } from "../../../lib/demo";
import type { HubStore } from "../../../lib/store/hub-store";
import { projectsOf, type VillageProblem } from "../../../lib/village/state";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// H9: a record that can't be read already leaves every house dark with nothing on the desk, so no marks are needed.
function seenResultsOrNone(store: Pick<HubStore, "readSeenResults">) {
  try {
    return store.readSeenResults();
  } catch {
    return [];
  }
}

export function GET(): Response {
  try {
    const { store, now, realFeeds } = demoHub();
    const village = readVillageOfHub({ store, projects: projectsOf(houses), now: now(), realFeeds });
    // The plaza and the desk both read this answer, so a result the owner has seen leaves both at once.
    return Response.json(withoutSeenResults(village, seenResultsOrNone(store)));
  } catch (problem) {
    console.error(problem);
    const body: VillageProblem = { problem: "The hub couldn't read its own record." };
    return Response.json(body, { status: 500 });
  }
}
