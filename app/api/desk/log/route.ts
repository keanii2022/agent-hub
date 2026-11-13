import { houses } from "../../../../config/houses";
import { demoHub } from "../../../../lib/demo";
import { readDeskLog } from "../../../../lib/desk/read-log";
import { projectsOf, type VillageProblem } from "../../../../lib/village/state";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only: there is a GET here and nothing else.
export function GET(): Response {
  try {
    const { store, now, realFeeds } = demoHub();
    return Response.json(
      readDeskLog({ store, projects: projectsOf(houses), realProjects: realFeeds.projects, now: now() }),
    );
  } catch (problem) {
    console.error(problem);
    const body: VillageProblem = { problem: "The hub couldn't read its own record." };
    return Response.json(body, { status: 500 });
  }
}
