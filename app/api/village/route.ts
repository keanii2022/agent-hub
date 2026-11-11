import { houses } from "../../../config/houses";
import { demoHub } from "../../../lib/demo";
import { projectsOf, readVillageState, type VillageProblem } from "../../../lib/village/state";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  try {
    const { store, now } = demoHub();
    return Response.json(readVillageState({ store, projects: projectsOf(houses), now: now() }));
  } catch (problem) {
    console.error(problem);
    const body: VillageProblem = { problem: "The hub couldn't read its own record." };
    return Response.json(body, { status: 500 });
  }
}
