import { demoHub, readRecentEvents, type EventsProblem } from "../../../lib/demo";

// The hub's record is kept with Node's built-in SQLite, which only the Node runtime has.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  try {
    const { store } = demoHub();
    const answer = readRecentEvents(store, new URL(request.url).searchParams, new Date());
    return Response.json(answer.body, { status: answer.status });
  } catch (problem) {
    console.error(problem);
    const body: EventsProblem = { problem: "The hub couldn't read its own record." };
    return Response.json(body, { status: 500 });
  }
}
