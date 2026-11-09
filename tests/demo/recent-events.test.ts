import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore } from "../../lib/store";
import { GET } from "../../app/api/events/route";
import * as eventsRoute from "../../app/api/events/route";
import {
  DEFAULT_EVENTS_LIMIT,
  DEMO_SCRIPTS,
  MOST_EVENTS_AT_ONCE,
  RECENT_EVENTS_ROUTE,
  closeDemoHub,
  createDemoPlayer,
  demoHub,
  readRecentEvents,
  type RecentEvents,
  type RecentEventsAnswer,
} from "../../lib/demo";
import { A_MOMENT_IN_THE_DEMO, handTimer, unixSeconds } from "./helpers";
import { keepTheNetworkOff } from "./network-off";

keepTheNetworkOff();

let store: HubStore;

beforeEach(() => {
  store = openHubStore(IN_MEMORY_DATABASE);
  createDemoPlayer({ store, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
});

afterEach(() => {
  store.close();
  closeDemoHub();
});

const ask = (question = ""): RecentEventsAnswer =>
  readRecentEvents(store, new URLSearchParams(question), A_MOMENT_IN_THE_DEMO);

function eventsOf(answer: RecentEventsAnswer): RecentEvents {
  if (answer.status !== 200) throw new Error(answer.body.problem);
  return answer.body;
}

describe("the list of recent events", () => {
  it("gives the newest events first, with the hub's own time", () => {
    const { asOf, events } = eventsOf(ask());

    expect(asOf).toBe("2026-10-05T14:07:00Z");
    expect(events).toHaveLength(DEFAULT_EVENTS_LIMIT);
    expect(events).toEqual(
      store.readLines({ newestFirst: true, limit: DEFAULT_EVENTS_LIMIT }),
    );
    const times = events.map((event) => unixSeconds(event.line.when));
    expect(times).toEqual([...times].sort((earlier, later) => later - earlier));
  });

  it("gives each event as a stored feed line a screen can use as it is", () => {
    const answer = eventsOf(ask("limit=3"));

    expect(Object.keys(answer)).toEqual(["asOf", "events"]);
    for (const event of answer.events) {
      expect(Object.keys(event)).toEqual(["seq", "line"]);
      expect(event.line).toEqual(store.findLine(event.line.project, event.line.id)?.line);
    }
    expect(JSON.parse(JSON.stringify(answer))).toEqual(answer);
  });

  it("H10: every event it lists is marked demo", () => {
    const { events } = eventsOf(ask(`limit=${MOST_EVENTS_AT_ONCE}`));
    expect(events.length).toBeGreaterThan(DEFAULT_EVENTS_LIMIT);
    for (const event of events) expect(event.line.demo).toBe(true);
  });

  it("gives as many events as asked for", () => {
    expect(eventsOf(ask("limit=1")).events).toHaveLength(1);
    expect(eventsOf(ask("limit=7")).events).toHaveLength(7);
  });

  it("gives one project's events when a project is named", () => {
    for (const script of DEMO_SCRIPTS) {
      const { events } = eventsOf(ask(`project=${encodeURIComponent(script.project)}`));
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) expect(event.line.project).toBe(script.project);
    }
    expect(eventsOf(ask("project=nobody-lives-here")).events).toEqual([]);
  });

  it("gives what was stored after a given line, oldest first, so a screen can pick up where it stopped", () => {
    const everything = store.readLines({ order: "stored" });
    const lastSeen = everything[everything.length - 6].seq;

    const { events } = eventsOf(ask(`after=${lastSeen}`));

    expect(events).toEqual(everything.slice(-5));
    expect(eventsOf(ask(`after=${everything[everything.length - 1].seq}`)).events).toEqual([]);
  });

  it("refuses a question it can't read, in plain words", () => {
    for (const question of [
      "limit=0",
      "limit=-1",
      "limit=many",
      "limit=1.5",
      `limit=${MOST_EVENTS_AT_ONCE + 1}`,
      "after=-1",
      "after=last",
      "project=",
    ]) {
      const answer = ask(question);
      expect(answer.status, question).toBe(400);
      if (answer.status === 400) expect(answer.body.problem).toMatch(/^[a-z]+ (has to be|is) /);
    }
  });

  it("never writes, whatever the question says", () => {
    const before = store.readLines({ order: "stored" });
    const readOnly = { readLines: store.readLines };

    for (const question of [
      "",
      "limit=5",
      "after=0",
      "project=approval-desk",
      "add=1&status=done&delete=all",
      `line=${encodeURIComponent('{"project":"approval-desk","id":"1"}')}`,
    ]) {
      readRecentEvents(readOnly, new URLSearchParams(question), A_MOMENT_IN_THE_DEMO);
    }

    expect(store.readLines({ order: "stored" })).toEqual(before);
  });
});

describe("the route", () => {
  const startHub = () =>
    demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: () => A_MOMENT_IN_THE_DEMO,
      timer: handTimer().timer,
    });

  it("answers a GET with the hub's recent events", async () => {
    const hub = startHub();

    const response = GET(new Request(`http://hub.test${RECENT_EVENTS_ROUTE}?limit=4`));
    const body = (await response.json()) as RecentEvents;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.events).toEqual(hub.store.readLines({ newestFirst: true, limit: 4 }));
  });

  it("answers a question it can't read with a plain problem, not a crash", async () => {
    startHub();
    const response = GET(new Request(`http://hub.test${RECENT_EVENTS_ROUTE}?limit=none`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      problem: `limit has to be a whole number from 1 to ${MOST_EVENTS_AT_ONCE}.`,
    });
  });

  it("stores nothing because of a request", () => {
    const hub = startHub();
    const before = hub.store.readLines({ order: "stored" });

    GET(new Request(`http://hub.test${RECENT_EVENTS_ROUTE}?add=1&project=approval-desk`));
    GET(new Request(`http://hub.test${RECENT_EVENTS_ROUTE}`));

    expect(hub.store.readLines({ order: "stored" })).toEqual(before);
  });

  it("is read-only: it answers GET and no other method", () => {
    const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
    expect(Object.keys(eventsRoute).filter((name) => methods.includes(name))).toEqual(["GET"]);
  });

  it("runs on the Node runtime, where the built-in database lives", () => {
    expect(eventsRoute.runtime).toBe("nodejs");
  });

  it("lives where the route's address says", () => {
    expect(RECENT_EVENTS_ROUTE).toBe("/api/events");
    expect(readFileSync("app/api/events/route.ts", "utf8")).toContain("export function GET");
  });
});
