import { houses } from "../../../config/houses";
import { demoHub, readVillageOfHub } from "../../../lib/demo";
import { projectsOf, type VillageProblem } from "../../../lib/village/state";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    const { store, now, realFeeds } = demoHub();
    return Response.json(readVillageOfHub({ store, projects: projectsOf(houses), now: now(), realFeeds }));
  } catch (problem) {
    console.error(problem);
    const body: VillageProblem = { problem: "The hub couldn't read its own record." };
    return Response.json(body, { status: 500 });
  }
}
