import { closeSync, constants, fstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { THIS_HUB, boardRowFor, type BoardRow, type BuildBoard } from "../../../lib/village/clipboard";

// The only place the hub opens a project's plan. It opens `<folder>/<project>/PLAN.md`
// for reading and nothing else: no other file, no link, nothing named
// "private", and it never writes (H3).

export const PLAN_FILE = "PLAN.md";

/** A plan is a page or two of words. Anything far bigger is not one, and is left unread. */
const PLAN_BYTES_AT_MOST = 1_000_000;

type PlanOnDisk = { found: "text"; text: string } | { found: "nothing" } | { found: "unreadable" };

function isNoSuchFile(problem: unknown): boolean {
  const code = (problem as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function planAt(path: string): PlanOnDisk {
  let file: number;
  try {
    // O_NOFOLLOW: a PLAN.md that is a link is refused here, so a link can never lead the hub out of the folder.
    file = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (problem) {
    return { found: isNoSuchFile(problem) ? "nothing" : "unreadable" };
  }
  try {
    const facts = fstatSync(file);
    if (!facts.isFile() || facts.size > PLAN_BYTES_AT_MOST) return { found: "unreadable" };
    return { found: "text", text: readFileSync(file, "utf8") };
  } catch {
    return { found: "unreadable" };
  } finally {
    closeSync(file);
  }
}

function rowFor(project: string, planPath: string): BoardRow {
  const plan = planAt(planPath);
  if (plan.found === "nothing") return { project, plan: "missing" };
  if (plan.found === "unreadable") return { project, plan: "unreadable" };
  return boardRowFor(project, plan.text);
}

function isNamedPrivate(name: string): boolean {
  return name.toLowerCase() === "private";
}

function inNameOrder(first: string, second: string): number {
  const [a, b] = [first.toLowerCase(), second.toLowerCase()];
  if (a !== b) return a < b ? -1 : 1;
  return first < second ? -1 : first > second ? 1 : 0;
}

export type PlansOnDisk = {
  /** The folder whose direct subfolders are projects, or null when the hub was told about none. */
  plansFolder: string | null;
  /** Where the hub itself runs: its own plan is here, and a folder not given in full is looked for from here. */
  hubFolder: string;
};

/**
 * The build board, read fresh from the plans. One project's missing, odd or
 * unreadable plan never stops the others (H9): it gets its own row saying so.
 */
export function readBuildBoard({ plansFolder, hubFolder }: PlansOnDisk): BuildBoard {
  if (plansFolder === null) {
    return {
      from: "this hub only",
      cannotOpenFolder: false,
      projects: [rowFor(THIS_HUB, join(hubFolder, PLAN_FILE))],
    };
  }

  const folder = resolve(hubFolder, plansFolder);
  const nothingRead: BuildBoard = { from: "plans folder", cannotOpenFolder: true, projects: [] };
  if (isNamedPrivate(basename(folder))) return nothingRead;

  let projectNames: string[];
  try {
    projectNames = readdirSync(folder, { withFileTypes: true })
      // A link to a folder is not a folder here, so it is never followed.
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !isNamedPrivate(entry.name))
      .map((entry) => entry.name)
      .sort(inNameOrder);
  } catch {
    return nothingRead;
  }

  return {
    from: "plans folder",
    cannotOpenFolder: false,
    projects: projectNames.map((project) => rowFor(project, join(folder, project, PLAN_FILE))),
  };
}
