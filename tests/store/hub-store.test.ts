import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  HUB_DATABASE_PATH,
  HubStoreError,
  IN_MEMORY_DATABASE,
  openHubStore,
  type AddLineResult,
  type HubStore,
} from "../../lib/store";

const workingLine = {
  project: "approval-desk",
  agent: "refund-agent",
  request: "REQ-014",
  step: "read_request",
  what: "Read the refund request",
  status: "working",
  when: "2026-10-05T14:03:11Z",
  id: "40",
  demo: true,
};

const waitingLine = {
  ...workingLine,
  step: "gate_decision",
  what: "Over the limit, sent to a person",
  status: "needs_human",
  when: "2026-10-05T14:03:12Z",
  id: "41",
  refers_to: "40",
  choices: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ],
  urgent: true,
  details: { amount: 250, currency: "EUR", history: [null, 1.5, "note", false] },
};

const teamLine = {
  project: "team-house",
  agent: "planner",
  request: "JOB-7",
  step: "plan",
  what: "Split the job into three parts",
  status: "working",
  when: "2026-10-05T14:03:11.5Z",
  id: "40",
  demo: true,
};

const openStores: HubStore[] = [];
const openRawDatabases: DatabaseSync[] = [];
const temporaryFolders: string[] = [];

function memoryStore(): HubStore {
  const store = openHubStore(IN_MEMORY_DATABASE);
  openStores.push(store);
  return store;
}

function temporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "hub-store-test-"));
  temporaryFolders.push(folder);
  return folder;
}

function storeInFile(databasePath: string): HubStore {
  const store = openHubStore(databasePath);
  openStores.push(store);
  return store;
}

function rawDatabase(databasePath: string): DatabaseSync {
  const database = new DatabaseSync(databasePath);
  openRawDatabases.push(database);
  return database;
}

function everyRow(database: DatabaseSync) {
  return database.prepare("SELECT * FROM feed_lines ORDER BY seq").all();
}

function idsOf(stored: { line: { project: string; id: string } }[]): string[] {
  return stored.map(({ line }) => `${line.project}/${line.id}`);
}

function reasonsOf(result: AddLineResult): string[] {
  if (result.ok) throw new Error("expected the line to be refused, but it was stored");
  return result.problems.map((problem) => problem.reason);
}

afterEach(() => {
  for (const database of openRawDatabases.splice(0)) database.close();
  for (const store of openStores.splice(0)) store.close();
  for (const folder of temporaryFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("adding lines", () => {
  it("stores a good line and gives it back unchanged", () => {
    const store = memoryStore();

    const result = store.addLine(waitingLine);

    expect(result).toEqual({
      ok: true,
      added: true,
      stored: { seq: 1, line: waitingLine },
    });
    expect(store.readLines()).toEqual([{ seq: 1, line: waitingLine }]);
    expect(store.findLine("approval-desk", "41")).toEqual({ seq: 1, line: waitingLine });
  });

  it("H8: a line the checker refuses is not stored, and the caller gets the plain reasons", () => {
    const store = memoryStore();
    const { status: _removed, ...lineWithoutStatus } = workingLine;

    const result = store.addLine(lineWithoutStatus);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.why).toBe("refused_by_checker");
    expect(result.problems.map((problem) => problem.field)).toEqual(["status"]);
    expect(result.problems[0].reason).not.toBe("");
    expect(store.readLines()).toEqual([]);
  });

  it("H8: something that isn't a line at all is not stored", () => {
    const store = memoryStore();

    expect(store.addLine("not a line").ok).toBe(false);
    expect(store.addLine(null).ok).toBe(false);
    expect(store.readLines()).toEqual([]);
  });

  it("H4: adding the same line twice stores it once", () => {
    const store = memoryStore();

    const first = store.addLine(waitingLine);
    const second = store.addLine({ ...waitingLine });

    expect(first).toMatchObject({ ok: true, added: true });
    expect(second).toEqual({
      ok: true,
      added: false,
      stored: { seq: 1, line: waitingLine },
    });
    expect(store.readLines()).toHaveLength(1);
  });

  it("H4: the same line with its details written in another order is still the same line", () => {
    const store = memoryStore();
    store.addLine(waitingLine);

    const reordered = {
      ...waitingLine,
      details: { history: [null, 1.5, "note", false], currency: "EUR", amount: 250 },
    };

    expect(store.addLine(reordered)).toMatchObject({ ok: true, added: false });
    expect(store.readLines()).toHaveLength(1);
  });

  it("H4: a different line with an id the project already used is refused, and the first one stays", () => {
    const store = memoryStore();
    store.addLine(workingLine);

    const result = store.addLine({ ...workingLine, what: "Something else entirely" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.why).toBe("id_already_used");
    expect(result.problems).toEqual([
      {
        field: "id",
        reason:
          'The hub already keeps a different line numbered "40" for approval-desk. The first one stays as it is, and this one was not stored.',
      },
    ]);
    if (result.why !== "id_already_used") return;
    expect(result.kept).toEqual({ seq: 1, line: workingLine });
    expect(store.readLines()).toEqual([{ seq: 1, line: workingLine }]);
  });

  it("H12: the reason for a used id is plain words, with no rule code in it", () => {
    const store = memoryStore();
    store.addLine(workingLine);

    const [reason] = reasonsOf(store.addLine({ ...workingLine, status: "done" }));

    expect(reason).not.toMatch(/\bH\d+\b|UNIQUE|constraint|SQL/i);
  });

  it("two projects may use the same id", () => {
    const store = memoryStore();

    expect(store.addLine(workingLine)).toMatchObject({ ok: true, added: true });
    expect(store.addLine(teamLine)).toMatchObject({ ok: true, added: true });
    expect(store.readLines()).toHaveLength(2);
  });

  it("H8: adding many gives one answer per line in order, and a refused line doesn't stop the others", () => {
    const store = memoryStore();

    const results = store.addLines([
      workingLine,
      { ...waitingLine, status: "sleeping" },
      waitingLine,
      workingLine,
      { ...workingLine, agent: "someone-else" },
    ]);

    expect(
      results.map((result) => (result.ok ? `added:${result.added}` : result.why)),
    ).toEqual([
      "added:true",
      "refused_by_checker",
      "added:true",
      "added:false",
      "id_already_used",
    ]);
    expect(idsOf(store.readLines({ order: "stored" }))).toEqual([
      "approval-desk/40",
      "approval-desk/41",
    ]);
  });

  it("H4: names with unusual characters are still stored once and found again", () => {
    const store = memoryStore();
    const halfAnEmoji = "\ud83c";
    const otherHalfAnEmoji = "\ud83d";
    const unusualNames = ["naïve ☃ 🏠", "it's \"quoted\"", "two\nlines", "a\u0000b", halfAnEmoji];

    for (const name of unusualNames) {
      const line = { ...workingLine, project: name, agent: name, request: name, id: name };

      expect(store.addLine(line)).toMatchObject({ ok: true, added: true });
      expect(store.addLine(line)).toMatchObject({ ok: true, added: false });
      expect(store.addLine({ ...line, what: "Something else" })).toMatchObject({
        ok: false,
        why: "id_already_used",
      });
      expect(store.findLine(name, name)?.line).toEqual(line);
      expect(store.readLines({ project: name, agent: name, request: name })).toHaveLength(1);
    }
    expect(
      store.addLine({ ...workingLine, project: halfAnEmoji, id: otherHalfAnEmoji }),
    ).toMatchObject({ ok: true, added: true });
    expect(store.readLines()).toHaveLength(unusualNames.length + 1);
  });

  it("adding none stores nothing", () => {
    const store = memoryStore();

    expect(store.addLines([])).toEqual([]);
    expect(store.readLines()).toEqual([]);
  });

  it("the caller's own line is not kept by reference: changing it later doesn't change the record", () => {
    const store = memoryStore();
    const mine = structuredClone(waitingLine);
    const result = store.addLine(mine);

    mine.what = "Changed after it was stored";
    mine.details.amount = 1;
    if (result.ok) result.stored.line.what = "Changed through the answer";

    expect(store.readLines()).toEqual([{ seq: 1, line: waitingLine }]);
  });
});

describe("the database itself refuses changes", () => {
  function fileWithTwoLines() {
    const databasePath = join(temporaryFolder(), "hub.sqlite");
    const store = storeInFile(databasePath);
    store.addLines([workingLine, waitingLine]);
    const raw = rawDatabase(databasePath);
    return { databasePath, store, raw, before: everyRow(raw) };
  }

  const otherLineJson = JSON.stringify({ ...workingLine, what: "Rewritten by hand" });

  it("H4: a stored line cannot be changed", () => {
    const { raw, before } = fileWithTwoLines();

    expect(() =>
      raw.prepare("UPDATE feed_lines SET line_json = ? WHERE seq = 1").run(otherLineJson),
    ).toThrow(/never changed/);
    expect(() => raw.exec("UPDATE feed_lines SET seq = 99 WHERE seq = 1")).toThrow(
      /never changed/,
    );
    expect(() => raw.exec("UPDATE OR REPLACE feed_lines SET seq = 2 WHERE seq = 1")).toThrow(
      /never changed/,
    );
    expect(() => raw.exec("UPDATE feed_lines SET project = 'other'")).toThrow();
    expect(everyRow(raw)).toEqual(before);
  });

  it("H4: a stored line cannot be deleted", () => {
    const { raw, before } = fileWithTwoLines();

    expect(() => raw.exec("DELETE FROM feed_lines WHERE seq = 1")).toThrow(/never deleted/);
    expect(() => raw.exec("DELETE FROM feed_lines")).toThrow(/never deleted/);
    expect(everyRow(raw)).toEqual(before);
  });

  it("H4: a stored line cannot be overwritten", () => {
    const { raw, before } = fileWithTwoLines();
    const insertOver = (sql: string) => () => raw.prepare(sql).run(otherLineJson);

    expect(insertOver("INSERT OR REPLACE INTO feed_lines (line_json) VALUES (?)")).toThrow(
      /never overwritten/,
    );
    expect(insertOver("REPLACE INTO feed_lines (line_json) VALUES (?)")).toThrow(
      /never overwritten/,
    );
    expect(
      insertOver(
        "INSERT INTO feed_lines (line_json) VALUES (?) ON CONFLICT (project, line_id) DO UPDATE SET line_json = excluded.line_json",
      ),
    ).toThrow(/never overwritten/);
    expect(insertOver("INSERT OR IGNORE INTO feed_lines (line_json) VALUES (?)")).toThrow(
      /never overwritten/,
    );
    expect(insertOver("INSERT INTO feed_lines (line_json) VALUES (?)")).toThrow(
      /never overwritten/,
    );
    expect(everyRow(raw)).toEqual(before);
  });

  it("H4: a new line cannot take the place of a stored one by reusing its number", () => {
    const { raw, before } = fileWithTwoLines();
    const newLineJson = JSON.stringify({ ...teamLine, id: "900" });

    expect(() =>
      raw
        .prepare("INSERT OR REPLACE INTO feed_lines (seq, line_json) VALUES (1, ?)")
        .run(newLineJson),
    ).toThrow(/never overwritten/);
    expect(everyRow(raw)).toEqual(before);
  });

  it("H4: overwriting is refused even when a connection lets replaced rows fire delete triggers", () => {
    const { raw, before } = fileWithTwoLines();
    raw.exec("PRAGMA recursive_triggers = ON");

    expect(() =>
      raw.prepare("REPLACE INTO feed_lines (line_json) VALUES (?)").run(otherLineJson),
    ).toThrow(/never overwritten/);
    expect(everyRow(raw)).toEqual(before);
  });

  it("H4: the columns used for looking lines up cannot be set apart from the line", () => {
    const { raw, before } = fileWithTwoLines();

    expect(() =>
      raw
        .prepare("INSERT INTO feed_lines (line_json, project) VALUES (?, 'other')")
        .run(JSON.stringify({ ...teamLine, id: "900" })),
    ).toThrow();
    expect(() => raw.exec("INSERT INTO feed_lines (line_json) VALUES ('not a line')")).toThrow();
    expect(everyRow(raw)).toEqual(before);
  });

  it("H4: the lines and the refusals are still there after closing and opening again", () => {
    const { databasePath, store, raw, before } = fileWithTwoLines();
    store.close();

    const reopened = storeInFile(databasePath);

    expect(reopened.readLines({ order: "stored" })).toEqual([
      { seq: 1, line: workingLine },
      { seq: 2, line: waitingLine },
    ]);
    expect(reopened.addLine(workingLine)).toMatchObject({ ok: true, added: false });
    expect(reopened.addLine(teamLine)).toMatchObject({ ok: true, added: true, stored: { seq: 3 } });
    expect(() => raw.exec("DELETE FROM feed_lines")).toThrow(/never deleted/);
    expect(() => raw.exec("UPDATE feed_lines SET line_json = '{}'")).toThrow(/never changed/);
    expect(everyRow(raw).slice(0, 2)).toEqual(before);
  });

  it("H4: after refused changes the store still reads the first lines", () => {
    const { store, raw } = fileWithTwoLines();

    expect(() => raw.exec("DELETE FROM feed_lines")).toThrow();
    expect(() =>
      raw.prepare("REPLACE INTO feed_lines (line_json) VALUES (?)").run(otherLineJson),
    ).toThrow();

    expect(store.readLines({ order: "stored" })).toEqual([
      { seq: 1, line: workingLine },
      { seq: 2, line: waitingLine },
    ]);
  });
});

describe("reading lines back", () => {
  const earlyLine = { ...workingLine, id: "1", when: "2026-10-05T09:00:00Z" };
  const sameMomentFirst = { ...workingLine, id: "2", when: "2026-10-05T10:00:00Z" };
  const sameMomentSecond = {
    ...workingLine,
    id: "3",
    when: "2026-10-05T10:00:00.000Z",
    agent: "system",
    request: "REQ-015",
  };
  const halfSecondLater = { ...teamLine, id: "4", when: "2026-10-05T10:00:00.5Z" };
  const lateLine = { ...teamLine, id: "5", when: "2026-10-05T11:00:00Z", agent: "builder" };

  function storeWithLinesAddedOutOfOrder(): HubStore {
    const store = memoryStore();
    store.addLines([lateLine, halfSecondLater, sameMomentFirst, sameMomentSecond, earlyLine]);
    return store;
  }

  it("gives lines in the order they happened, and lines at the same moment in the order they were stored", () => {
    const store = storeWithLinesAddedOutOfOrder();

    expect(idsOf(store.readLines())).toEqual([
      "approval-desk/1",
      "approval-desk/2",
      "approval-desk/3",
      "team-house/4",
      "team-house/5",
    ]);
  });

  it("can give lines in the order they were stored", () => {
    const store = storeWithLinesAddedOutOfOrder();

    expect(idsOf(store.readLines({ order: "stored" }))).toEqual([
      "team-house/5",
      "team-house/4",
      "approval-desk/2",
      "approval-desk/3",
      "approval-desk/1",
    ]);
  });

  it("reads one project, one agent or one request", () => {
    const store = storeWithLinesAddedOutOfOrder();

    expect(idsOf(store.readLines({ project: "team-house" }))).toEqual([
      "team-house/4",
      "team-house/5",
    ]);
    expect(idsOf(store.readLines({ agent: "system" }))).toEqual(["approval-desk/3"]);
    expect(idsOf(store.readLines({ project: "team-house", agent: "builder" }))).toEqual([
      "team-house/5",
    ]);
    expect(idsOf(store.readLines({ request: "REQ-014" }))).toEqual([
      "approval-desk/1",
      "approval-desk/2",
    ]);
    expect(store.readLines({ project: "nobody" })).toEqual([]);
  });

  it("reads lines that happened at a moment or later", () => {
    const store = storeWithLinesAddedOutOfOrder();

    expect(
      idsOf(store.readLines({ happenedSince: new Date("2026-10-05T10:00:00Z") })),
    ).toEqual(["approval-desk/2", "approval-desk/3", "team-house/4", "team-house/5"]);
    expect(
      idsOf(store.readLines({ happenedSince: new Date("2026-10-05T10:00:00.001Z") })),
    ).toEqual(["team-house/4", "team-house/5"]);
    expect(
      idsOf(store.readLines({ happenedSince: new Date("2026-10-05T10:00:00.500Z") })),
    ).toEqual(["team-house/4", "team-house/5"]);
    expect(
      idsOf(store.readLines({ happenedSince: new Date("2026-10-05T10:00:00.501Z") })),
    ).toEqual(["team-house/5"]);
  });

  it("reads only the lines stored after the last one a reader saw", () => {
    const store = storeWithLinesAddedOutOfOrder();
    const seen = store.readLines({ order: "stored", limit: 3 });
    const lastSeen = seen[seen.length - 1].seq;

    expect(idsOf(store.readLines({ storedAfter: lastSeen, order: "stored" }))).toEqual([
      "approval-desk/3",
      "approval-desk/1",
    ]);
    expect(store.readLines({ storedAfter: 5 })).toEqual([]);
  });

  it("reads the newest few first", () => {
    const store = storeWithLinesAddedOutOfOrder();

    expect(idsOf(store.readLines({ newestFirst: true, limit: 2 }))).toEqual([
      "team-house/5",
      "team-house/4",
    ]);
    expect(idsOf(store.readLines({ newestFirst: true, order: "stored", limit: 1 }))).toEqual([
      "approval-desk/1",
    ]);
    expect(store.readLines({ limit: 0 })).toEqual([]);
  });

  it("finds one line by its project and id, or nothing", () => {
    const store = storeWithLinesAddedOutOfOrder();

    expect(store.findLine("team-house", "5")?.line).toEqual(lateLine);
    expect(store.findLine("team-house", "1")).toBeNull();
  });

  it("refuses a limit or a time that makes no sense", () => {
    const store = memoryStore();

    expect(() => store.readLines({ limit: -1 })).toThrow(RangeError);
    expect(() => store.readLines({ limit: 1.5 })).toThrow(RangeError);
    expect(() => store.readLines({ happenedSince: new Date("not a time") })).toThrow(RangeError);
  });
});

describe("where the record lives", () => {
  it("playing the same lines into two fresh records gives identical data", () => {
    const folder = temporaryFolder();
    const lines = [workingLine, waitingLine, { ...workingLine, status: "sleeping" }, teamLine];
    const firstPath = join(folder, "first.sqlite");
    const secondPath = join(folder, "second.sqlite");

    storeInFile(firstPath).addLines(lines);
    const second = storeInFile(secondPath);
    for (const line of lines) second.addLine(line);
    second.addLines(lines);

    expect(everyRow(rawDatabase(secondPath))).toEqual(everyRow(rawDatabase(firstPath)));
    expect(everyRow(rawDatabase(firstPath))).toHaveLength(3);
  });

  it("makes the folder for its database when it isn't there yet", () => {
    const databasePath = join(temporaryFolder(), "not", "made", "yet", "hub.sqlite");

    const store = storeInFile(databasePath);

    expect(store.addLine(workingLine)).toMatchObject({ ok: true, added: true });
  });

  it("H3: the store writes only to its own database, never to a project's files", () => {
    const folder = temporaryFolder();
    const logbookPath = join(folder, "approval-desk-logbook.txt");
    writeFileSync(logbookPath, "the project's own lines\n");
    const databasePath = join(folder, "hub", "hub.sqlite");

    const store = storeInFile(databasePath);
    store.addLines([workingLine, waitingLine, teamLine]);
    store.readLines({ project: "approval-desk" });
    store.close();

    expect(readFileSync(logbookPath, "utf8")).toBe("the project's own lines\n");
    expect(readdirSync(folder).sort()).toEqual(["approval-desk-logbook.txt", "hub"]);
    expect(readdirSync(join(folder, "hub"))).toEqual(["hub.sqlite"]);
  });

  it("H13: the real database lives in data/, which git ignores", () => {
    const ignored = readFileSync(".gitignore", "utf8").split("\n");

    expect(HUB_DATABASE_PATH.startsWith("data/")).toBe(true);
    expect(ignored).toContain("data/");
  });

  it("says so plainly when the record can't be opened", () => {
    const folder = temporaryFolder();
    const notADatabase = join(folder, "notes.txt");
    writeFileSync(notADatabase, "these are not the lines you are looking for\n".repeat(50));

    expect(() => openHubStore(notADatabase)).toThrow(HubStoreError);
    expect(() => openHubStore(notADatabase)).toThrow(/couldn't open its record/);
  });

  it("says so plainly when the record can't be written, and stores nothing", () => {
    const databasePath = join(temporaryFolder(), "hub.sqlite");
    const store = storeInFile(databasePath);
    store.addLine(workingLine);
    store.close();

    expect(() => store.addLine(waitingLine)).toThrow(HubStoreError);
    expect(() => store.addLine(waitingLine)).toThrow(/couldn't write to its own record/);
    expect(() => store.readLines()).toThrow(/couldn't read its own record/);
    expect(everyRow(rawDatabase(databasePath))).toHaveLength(1);
  });

  it("when something breaks halfway through a batch, none of the batch is stored", () => {
    const databasePath = join(temporaryFolder(), "hub.sqlite");
    const store = storeInFile(databasePath);
    const lineThatBreaksWhenRead = {
      ...waitingLine,
      get project(): string {
        throw new Error("this line can't be read");
      },
    };

    expect(() => store.addLines([workingLine, lineThatBreaksWhenRead])).toThrow(HubStoreError);

    expect(everyRow(rawDatabase(databasePath))).toEqual([]);
    expect(store.addLine(workingLine)).toMatchObject({ ok: true, added: true });
  });
});
