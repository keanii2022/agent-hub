import { readFileSync, readdirSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IN_MEMORY_DATABASE } from "../../lib/store";
import { GET } from "../../app/api/events/route";
import {
  DEMO_SCRIPTS,
  RECENT_EVENTS_ROUTE,
  closeDemoHub,
  demoHub,
  type RecentEvents,
} from "../../lib/demo";
import { A_MOMENT_IN_THE_DEMO, clockAt, handTimer } from "./helpers";
import { NETWORK_IS_OFF, keepTheNetworkOff } from "./network-off";

const network = keepTheNetworkOff();

afterEach(() => {
  closeDemoHub();
});

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("the demo with the network off", () => {
  it("H11: the network really is off in these tests", async () => {
    expect(() => net.connect(9, "127.0.0.1")).toThrow(NETWORK_IS_OFF);
    await expect((async () => fetch("http://127.0.0.1:9/"))()).rejects.toThrow(
      NETWORK_IS_OFF,
    );
    expect(network.attempts.splice(0)).toEqual(["opened a connection", "called fetch"]);
  });

  it("H11: the hub starts, the demo plays and the route answers without the network", async () => {
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    demoHub({ databasePath: IN_MEMORY_DATABASE, now: clock.now, timer: hand.timer });
    for (let tick = 0; tick < 120; tick += 1) {
      clock.moveOn(15);
      hand.tick();
    }

    const response = GET(new Request(`http://hub.test${RECENT_EVENTS_ROUTE}?limit=200`));
    const { events } = (await response.json()) as RecentEvents;

    expect(response.status).toBe(200);
    expect(new Set(events.map((event) => event.line.project))).toEqual(
      new Set(DEMO_SCRIPTS.map((script) => script.project)),
    );
    expect(network.attempts).toEqual([]);
  });

  it("H11: the demo code never reaches for the network or an AI service", () => {
    const reachesOut =
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|["'](node:)?(http|https|http2|net|tls|dgram|dns|child_process)["']|https?:\/\//;
    const sources = [...filesUnder("lib/demo"), ...filesUnder("app/api")];

    expect(sources.length).toBeGreaterThan(5);
    for (const path of sources) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(reachesOut);
    }
  });
});
