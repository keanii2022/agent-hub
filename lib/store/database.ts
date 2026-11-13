import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DECISIONS_SCHEMA, FEED_LINES_SCHEMA } from "./schema";

export const HUB_DATABASE_PATH = "data/hub.sqlite";
export const IN_MEMORY_DATABASE = ":memory:";

const WAIT_FOR_ANOTHER_WRITER_MS = 5000;

export class HubStoreError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "HubStoreError";
  }
}

export function openHubDatabase(databasePath: string): DatabaseSync {
  let database: DatabaseSync | undefined;
  try {
    if (databasePath !== IN_MEMORY_DATABASE) {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    database = new DatabaseSync(databasePath);
    database.exec(`PRAGMA busy_timeout = ${WAIT_FOR_ANOTHER_WRITER_MS}`);
    database.exec(FEED_LINES_SCHEMA);
    database.exec(DECISIONS_SCHEMA);
    return database;
  } catch (cause) {
    if (database?.isOpen) database.close();
    throw new HubStoreError(
      `The hub couldn't open its record at ${databasePath}.`,
      cause,
    );
  }
}

/** Everything `work` writes is kept together, or none of it is. */
export function inOneTransaction<Result>(database: DatabaseSync, work: () => Result): Result {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}
