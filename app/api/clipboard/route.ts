import { plansFolderFrom } from "../../../lib/village/clipboard";
import type { VillageProblem } from "../../../lib/village/state";
import { readBuildBoard } from "./plans-on-disk";

// The plans are files on this machine, which only the Node runtime can open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only: there is a GET here and nothing else.
export function GET(): Response {
  try {
    return Response.json(
      readBuildBoard({ plansFolder: plansFolderFrom(process.env), hubFolder: process.cwd() }),
    );
  } catch (problem) {
    console.error(problem);
    const body: VillageProblem = { problem: "The hub couldn't read the plans." };
    return Response.json(body, { status: 500 });
  }
}
