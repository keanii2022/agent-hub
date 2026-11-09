import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FINISH_STATUSES,
  STAGE_1_CHOICES,
  WAITING_STATUS,
  type FeedLine,
} from "../../lib/feed";
import {
  ARRIVE_STEP,
  DEMO_SCRIPTS,
  DemoScriptError,
  LEAVE_STEP,
  TEAM_HOUSE_PROJECT,
  approvalDeskScript,
  compileDemoScript,
  dayNumberAt,
  playableLinesBetween,
  startOfDay,
  teamHouseScript,
  type DemoScript,
  type ScriptedLine,
} from "../../lib/demo";
import {
  A_MOMENT_IN_THE_DEMO,
  daysOf,
  oneDayOf,
  tinyScript,
  unixSeconds,
} from "./helpers";
import { keepTheNetworkOff } from "./network-off";

keepTheNetworkOff();

const everyScriptedLine = DEMO_SCRIPTS.flatMap((script) => oneDayOf(script));
const waitingLines = everyScriptedLine.filter((line) => line.status === WAITING_STATUS);

const isFinish = (line: FeedLine) =>
  FINISH_STATUSES.some((finish) => finish === line.status);

function closingLineOf(waiting: FeedLine): FeedLine | undefined {
  return everyScriptedLine.find(
    (line) =>
      line.project === waiting.project &&
      line.request === waiting.request &&
      unixSeconds(line.when) > unixSeconds(waiting.when) &&
      (line.refers_to === waiting.id || isFinish(line)),
  );
}

function agentsOf(lines: FeedLine[]): string[] {
  return [...new Set(lines.map((line) => line.agent))].sort();
}

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("the scripted days", () => {
  it("H10: every scripted line is marked demo", () => {
    expect(everyScriptedLine.length).toBeGreaterThan(60);
    for (const line of everyScriptedLine) expect(line.demo).toBe(true);
  });

  it("H10: a script has no way to switch the demo mark off", () => {
    const script = tinyScript("garden");
    const sneaky: DemoScript = {
      ...script,
      requests: script.requests.map((request) =>
        request.map((line) => ({ ...line, demo: false }) as ScriptedLine),
      ),
    };
    for (const line of oneDayOf(sneaky)) expect(line.demo).toBe(true);
  });

  it("H8: the feed checker accepts every scripted line", () => {
    for (const script of DEMO_SCRIPTS) {
      expect(() => oneDayOf(script)).not.toThrow();
    }
  });

  it("has an approval-desk house with one agent", () => {
    expect(approvalDeskScript.project).toBe("approval-desk");
    expect(agentsOf(oneDayOf(approvalDeskScript))).toEqual(["refund-agent"]);
  });

  it("has a team house with three agents", () => {
    expect(teamHouseScript.project).toBe(TEAM_HOUSE_PROJECT);
    expect(agentsOf(oneDayOf(teamHouseScript))).toHaveLength(3);
  });

  it("writes the team house's name in exactly one place", () => {
    const written = [...filesUnder("lib/demo"), ...filesUnder("app/api")].flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.toLowerCase().includes(TEAM_HOUSE_PROJECT.toLowerCase()))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(written).toHaveLength(1);
  });

  it("plays one script per project", () => {
    const projects = DEMO_SCRIPTS.map((script) => script.project);
    expect(new Set(projects).size).toBe(projects.length);
    expect(projects).toHaveLength(2);
  });
});

describe("what later screens need from the scripted days", () => {
  it("has several requests waiting for the owner in each house, each with the Stage 1 choices", () => {
    for (const script of DEMO_SCRIPTS) {
      const waitingHere = waitingLines.filter((line) => line.project === script.project);
      expect(waitingHere.length).toBeGreaterThanOrEqual(3);
    }
    for (const line of waitingLines) expect(line.choices).toEqual(STAGE_1_CHOICES);
  });

  it("keeps every waiting request open for at least four minutes", () => {
    for (const waiting of waitingLines) {
      const closing = closingLineOf(waiting);
      expect(closing, `${waiting.what} is never closed`).toBeDefined();
      if (closing === undefined) continue;
      const openForSeconds = unixSeconds(closing.when) - unixSeconds(waiting.when);
      expect(openForSeconds).toBeGreaterThanOrEqual(4 * 60);
    }
  });

  it("closes some waiting requests with a decision that points at them, and the rest with a finish", () => {
    const closings = waitingLines.map(closingLineOf);
    const byDecision = closings.filter(
      (closing, index) => closing?.refers_to === waitingLines[index].id,
    );
    const byFinish = closings.filter(
      (closing, index) =>
        closing !== undefined &&
        closing.refers_to !== waitingLines[index].id &&
        isFinish(closing),
    );
    expect(byDecision.length).toBeGreaterThanOrEqual(3);
    expect(byFinish.length).toBeGreaterThanOrEqual(2);
    expect(byDecision.length + byFinish.length).toBe(waitingLines.length);
  });

  // The day starts again every 20 or 30 minutes. A request the script left
  // open would add one more to the desk on every round, for as long as the hub runs.
  it("leaves no waiting request open when the scripted day ends", () => {
    expect(waitingLines.filter((line) => closingLineOf(line) === undefined)).toEqual([]);
  });

  it("has results worth the owner's eyes in each house", () => {
    for (const script of DEMO_SCRIPTS) {
      const results = everyScriptedLine.filter(
        (line) => line.project === script.project && line.status === "result_ready",
      );
      expect(results.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("marks a few waiting requests urgent and leaves most of them plain", () => {
    const urgent = everyScriptedLine.filter((line) => line.urgent === true);
    expect(urgent.length).toBeGreaterThanOrEqual(1);
    for (const line of urgent) expect(line.status).toBe(WAITING_STATUS);
    expect(waitingLines.length - urgent.length).toBeGreaterThan(urgent.length);
  });

  it("has a job a rule stopped and a job that broke", () => {
    const statuses = new Set(everyScriptedLine.map((line) => line.status));
    expect(statuses).toContain("blocked");
    expect(statuses).toContain("failed");
  });

  it("has each agent arrive once, work, and leave once", () => {
    for (const script of DEMO_SCRIPTS) {
      const lines = oneDayOf(script);
      for (const agent of script.agents) {
        const own = lines.filter((line) => line.agent === agent.name);
        const arrivals = own.filter((line) => line.step === ARRIVE_STEP);
        const leavings = own.filter((line) => line.step === LEAVE_STEP);
        expect(arrivals).toHaveLength(1);
        expect(leavings).toHaveLength(1);
        expect(own[0]).toBe(arrivals[0]);
        expect(own[own.length - 1]).toBe(leavings[0]);
        expect(own.some((line) => line.status === "working")).toBe(true);
      }
      expect(agentsOf(lines)).toEqual(script.agents.map((agent) => agent.name).sort());
    }
  });

  it("has the team house's agents start and finish at different times, so the number inside changes", () => {
    const lines = oneDayOf(teamHouseScript);
    let inside = 0;
    const numbersInside = lines.flatMap((line) => {
      if (line.step === ARRIVE_STEP) return [(inside += 1)];
      if (line.step === LEAVE_STEP) return [(inside -= 1)];
      return [];
    });
    expect(numbersInside).toEqual([1, 2, 3, 2, 1, 0]);
  });

  it("changes when an agent is in the house by editing one time in the script", () => {
    const [first, ...others] = teamHouseScript.agents;
    const later: DemoScript = {
      ...teamHouseScript,
      agents: [...others, { ...first, arrives: "00:20" }],
    };
    const arrivalOf = (script: DemoScript) =>
      oneDayOf(script).find(
        (line) => line.agent === first.name && line.step === ARRIVE_STEP,
      )?.when;
    const secondsMoved =
      unixSeconds(arrivalOf(later) ?? "") - unixSeconds(arrivalOf(teamHouseScript) ?? "");
    expect(secondsMoved).toBe(10);
  });

  it("H12: speaks plain words, with no rule codes, ids or addresses", () => {
    for (const line of everyScriptedLine) {
      expect(line.what).toBe(line.what.trim());
      expect(line.what).not.toMatch(/\b[HQ]\d{1,2}\b/);
      expect(line.what).not.toMatch(/[_@{}<>]|https?:|www\./);
      expect(line.what).not.toContain(line.request);
      expect(line.what.length).toBeLessThanOrEqual(110);
      expect(line.step).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });
});

describe("how a script becomes feed lines", () => {
  const threeDays = DEMO_SCRIPTS.map((script) => daysOf(script, 3, A_MOMENT_IN_THE_DEMO));

  it("gives every line of a project its own id, day after day", () => {
    for (const lines of threeDays) {
      const ids = lines.map((line) => line.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("never uses a request's name again on a later day", () => {
    for (const lines of threeDays) {
      const dayOfRequest = new Map<string, string>();
      for (const line of lines) {
        const day = line.id.split("-")[0];
        expect(dayOfRequest.get(line.request) ?? day).toBe(day);
        dayOfRequest.set(line.request, day);
      }
    }
  });

  it("points every line that is about another at an earlier line of the same request", () => {
    for (const lines of threeDays) {
      const pointing = lines.filter((line) => line.refers_to !== undefined);
      expect(pointing.length).toBeGreaterThan(0);
      for (const line of pointing) {
        const target = lines.find((other) => other.id === line.refers_to);
        expect(target?.request).toBe(line.request);
        expect(unixSeconds(target?.when ?? "")).toBeLessThanOrEqual(unixSeconds(line.when));
      }
    }
  });

  it("gives the lines of a day in the order they happen", () => {
    for (const lines of threeDays) {
      const times = lines.map((line) => unixSeconds(line.when));
      expect(times).toEqual([...times].sort((earlier, later) => earlier - later));
    }
  });

  it("gives the same lines for the same stretch of time, however often it is asked", () => {
    const compiled = compileDemoScript(teamHouseScript);
    const since = startOfDay(compiled, dayNumberAt(compiled, A_MOMENT_IN_THE_DEMO));
    const once = playableLinesBetween(compiled, since, A_MOMENT_IN_THE_DEMO);
    const again = playableLinesBetween(
      compileDemoScript(teamHouseScript),
      since,
      A_MOMENT_IN_THE_DEMO,
    );
    expect(once.length).toBeGreaterThan(0);
    expect(again).toEqual(once);
  });

  it("refuses a script with a time it can't read", () => {
    const script = tinyScript("garden");
    const broken: DemoScript = {
      ...script,
      agents: [{ ...script.agents[0], arrives: "soon" }],
    };
    expect(() => compileDemoScript(broken)).toThrow(DemoScriptError);
  });

  it("refuses a line set for after the scripted day has ended", () => {
    const script = tinyScript("garden");
    const broken: DemoScript = {
      ...script,
      requests: [[{ ...script.requests[0][0], at: "10:00" }]],
    };
    expect(() => compileDemoScript(broken)).toThrow(DemoScriptError);
  });

  it("refuses a line that is about a line the request doesn't have", () => {
    const script = tinyScript("garden");
    const broken: DemoScript = {
      ...script,
      requests: [[{ ...script.requests[0][0], about: "nothing" }]],
    };
    expect(() => compileDemoScript(broken)).toThrow(DemoScriptError);
  });
});
