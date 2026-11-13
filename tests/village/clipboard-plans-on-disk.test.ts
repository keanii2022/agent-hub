import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PLAN_FILE, readBuildBoard } from "../../app/api/clipboard/plans-on-disk";
import { THIS_HUB, type BoardRow } from "../../lib/village/clipboard";

const bakeryPlan = [
  "# Bakery",
  "- [x] **Step 1: Skeleton**",
  "  - **Status:** done",
  "- [ ] **Step 2: Order form**",
  "  - **Status:** current",
  "- [ ] **Step 3: Order book**",
  "  - **Status:** not-started",
  "",
].join("\n");

const kitePlan = "### 1. Shop window\n\n**Status:** done\n\n### 2. Basket\n\n**Status:** done\n";

const bakeryRow: BoardRow = {
  project: "bakery",
  plan: "read",
  total: 3,
  done: 1,
  steps: ["done", "current", "not yet"],
  currentSteps: [{ number: "2", name: "Order form" }],
};

const kiteRow: BoardRow = { project: "kites", plan: "read", total: 2, done: 2, steps: ["done", "done"], currentSteps: [] };

const made: string[] = [];

/** A scripted folder of invented projects, made fresh and thrown away after the test. */
function scriptedFolder(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), "hub-plans-"));
  made.push(folder);
  for (const [path, words] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), words);
  }
  return folder;
}

afterEach(() => {
  for (const folder of made.splice(0)) {
    unlock(folder);
    rmSync(folder, { recursive: true, force: true });
  }
});

function everythingUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** Every file and folder under `folder`: its bytes, its size and when it was last changed. */
function fingerprintOf(folder: string): Record<string, string> {
  const prints: Record<string, string> = {};
  for (const path of [folder, ...everythingUnder(folder)]) {
    const facts = lstatSync(path);
    const bytes = facts.isFile() ? createHash("sha256").update(readFileSync(path)).digest("hex") : "not a file";
    prints[relative(folder, path)] = `${bytes} ${facts.size} ${facts.mtimeMs} ${facts.mode}`;
  }
  return prints;
}

function lock(folder: string): void {
  for (const path of [...everythingUnder(folder), folder]) {
    const facts = lstatSync(path);
    if (!facts.isSymbolicLink()) chmodSync(path, facts.isDirectory() ? 0o555 : 0o444);
  }
}

function unlock(folder: string): void {
  chmodSync(folder, 0o755);
  for (const path of everythingUnder(folder)) {
    const facts = lstatSync(path);
    if (facts.isDirectory()) chmodSync(path, 0o755);
  }
}

const boardFrom = (plansFolder: string) => readBuildBoard({ plansFolder, hubFolder: process.cwd() });

describe("the build board, read from a scripted folder of plans", () => {
  it("has one row per project, in name order, with numbers that match each PLAN.md", () => {
    const folder = scriptedFolder({ "kites/PLAN.md": kitePlan, "bakery/PLAN.md": bakeryPlan });
    expect(boardFrom(folder)).toEqual({
      from: "plans folder",
      cannotOpenFolder: false,
      projects: [bakeryRow, kiteRow],
    });
  });

  it("H9: a missing plan, a plan with no steps and a plan that can't be opened each get a row, and the others stay", () => {
    const folder = scriptedFolder({
      "bakery/PLAN.md": bakeryPlan,
      "no-plan/README.md": "No plan here.\n",
      "notes/PLAN.md": "# Thoughts\n\nNothing here is a step.\n",
      "odd/PLAN.md/inside.md": "PLAN.md is a folder here.\n",
    });
    expect(boardFrom(folder).projects).toEqual([
      bakeryRow,
      { project: "no-plan", plan: "missing" },
      { project: "notes", plan: "not understood" },
      { project: "odd", plan: "unreadable" },
    ]);
  });

  it("opens only the PLAN.md at the top of each project: not loose files, not plans further down", () => {
    const folder = scriptedFolder({
      "PLAN.md": bakeryPlan,
      "loose-notes.md": kitePlan,
      "bakery/PLAN.md": bakeryPlan,
      "bakery/docs/PLAN.md": kitePlan,
      "bakery/OLD-PLAN.md": kitePlan,
    });
    expect(boardFrom(folder).projects).toEqual([bakeryRow]);
  });

  it("never reads anything named private, or a hidden folder", () => {
    const folder = scriptedFolder({
      "bakery/PLAN.md": bakeryPlan,
      "private/PLAN.md": kitePlan,
      "Private/PLAN.md": kitePlan,
      ".hidden/PLAN.md": kitePlan,
    });
    expect(boardFrom(folder).projects).toEqual([bakeryRow]);

    const privateFolder = join(scriptedFolder({ "private/bakery/PLAN.md": bakeryPlan }), "private");
    expect(boardFrom(privateFolder)).toEqual({ from: "plans folder", cannotOpenFolder: true, projects: [] });
  });

  it("never follows a link: not a linked project folder, and not a linked PLAN.md", () => {
    const elsewhere = scriptedFolder({ "secret-project/PLAN.md": kitePlan, "loose/PLAN.md": kitePlan });
    const folder = scriptedFolder({ "bakery/PLAN.md": bakeryPlan, "linked-plan/README.md": "No plan of its own.\n" });
    symlinkSync(join(elsewhere, "secret-project"), join(folder, "linked-project"));
    symlinkSync(join(elsewhere, "loose", PLAN_FILE), join(folder, "linked-plan", PLAN_FILE));

    expect(boardFrom(folder).projects).toEqual([bakeryRow, { project: "linked-plan", plan: "unreadable" }]);
  });

  it("says the folder can't be opened when it isn't there or isn't a folder, and shows nothing", () => {
    const folder = scriptedFolder({ "a-file": "not a folder\n" });
    const nothing = { from: "plans folder", cannotOpenFolder: true, projects: [] };
    expect(boardFrom(join(folder, "nowhere"))).toEqual(nothing);
    expect(boardFrom(join(folder, "a-file"))).toEqual(nothing);
  });

  it("shows an empty board for a folder with no projects in it", () => {
    const folder = scriptedFolder({ "loose-notes.md": "nothing\n" });
    expect(boardFrom(folder)).toEqual({ from: "plans folder", cannotOpenFolder: false, projects: [] });
  });

  it("finds a folder that isn't given in full from where the hub runs", () => {
    const hubFolder = scriptedFolder({ "plans/bakery/PLAN.md": bakeryPlan });
    expect(readBuildBoard({ plansFolder: "plans", hubFolder }).projects).toEqual([bakeryRow]);
  });

  it("leaves a plan too big to be a plan unread", () => {
    const folder = scriptedFolder({ "bakery/PLAN.md": bakeryPlan + "x".repeat(1_000_001) });
    expect(boardFrom(folder).projects).toEqual([{ project: "bakery", plan: "unreadable" }]);
  });
});

describe("with no folder of plans named", () => {
  it("shows this hub's own plan and nothing else", () => {
    const hubFolder = scriptedFolder({ "PLAN.md": bakeryPlan, "other-project/PLAN.md": kitePlan });
    expect(readBuildBoard({ plansFolder: null, hubFolder })).toEqual({
      from: "this hub only",
      cannotOpenFolder: false,
      projects: [{ ...bakeryRow, project: THIS_HUB }],
    });
  });

  it("reads the real plan of this repo", () => {
    const [row] = readBuildBoard({ plansFolder: null, hubFolder: process.cwd() }).projects;
    expect(row).toMatchObject({ project: "agent-hub", plan: "read" });
  });
});

describe("H3: the hub only reads the plans", () => {
  const files = {
    "bakery/PLAN.md": bakeryPlan,
    "kites/PLAN.md": kitePlan,
    "notes/PLAN.md": "# Thoughts\n",
    "no-plan/README.md": "No plan here.\n",
    "private/PLAN.md": kitePlan,
  };

  it("leaves every file and folder unchanged, byte for byte, after reading the board many times", () => {
    const folder = scriptedFolder(files);
    const before = fingerprintOf(folder);

    for (let read = 0; read < 5; read += 1) boardFrom(folder);

    expect(fingerprintOf(folder)).toEqual(before);
    expect(readFileSync(join(folder, "bakery", PLAN_FILE), "utf8")).toBe(bakeryPlan);
  });

  it("reads a folder it is not allowed to write to, and gets the same board", () => {
    const folder = scriptedFolder(files);
    const whenWritable = boardFrom(folder);
    lock(folder);
    expect(() => writeFileSync(join(folder, "bakery", PLAN_FILE), "changed")).toThrow();

    expect(boardFrom(folder)).toEqual(whenWritable);
    expect(boardFrom(folder).projects.map((row) => row.project)).toEqual(["bakery", "kites", "no-plan", "notes"]);
  });

  it("is built from the parts of Node that read, and none that write, delete, move or make", () => {
    const source = readFileSync("app/api/clipboard/plans-on-disk.ts", "utf8");
    const fromFs = /import \{([^}]+)\} from "node:fs";/.exec(source);
    expect(fromFs).not.toBeNull();
    expect(fromFs![1].split(",").map((name) => name.trim()).sort()).toEqual([
      "closeSync",
      "constants",
      "fstatSync",
      "openSync",
      "readFileSync",
      "readdirSync",
    ]);
    expect(source).not.toMatch(/node:fs\/promises|node:child_process|require\(/);
    expect(source).toMatch(/openSync\(path, constants\.O_RDONLY/);
  });

  it("has a route with a GET and nothing else", () => {
    const route = readFileSync("app/api/clipboard/route.ts", "utf8");
    expect(route).toMatch(/export function GET\(/);
    expect(route).not.toMatch(/export (async )?function (POST|PUT|PATCH|DELETE)\b/);
  });
});
