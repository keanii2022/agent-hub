import { HUB_DATABASE_PATH, openHubStore, type HubStore } from "../store";
import {
  startDemoPlayer,
  type DemoClock,
  type DemoTimer,
  type RunningDemoPlayer,
} from "./player";
import type { DemoScript } from "./script";

export const HUB_DATABASE_PATH_VARIABLE = "HUB_DATABASE_PATH";

type Environment = Record<string, string | undefined>;

/** Where the hub keeps its record. Several hubs can run side by side, each with its own. */
export function hubDatabasePath(environment: Environment = process.env): string {
  const chosen = environment[HUB_DATABASE_PATH_VARIABLE];
  return chosen === undefined || chosen.trim() === "" ? HUB_DATABASE_PATH : chosen;
}

export type DemoHub = {
  databasePath: string;
  store: HubStore;
  player: RunningDemoPlayer;
};

export type DemoHubOptions = {
  databasePath?: string;
  scripts?: readonly DemoScript[];
  now?: DemoClock;
  timer?: DemoTimer;
};

// `next dev` loads this file again on every hot reload, which would forget a
// plain variable and start a second player. A slot on the process itself lasts
// as long as the server does.
const RUNNING_HUB = Symbol.for("agent-hub.demo-hub");
type HubHolder = { [RUNNING_HUB]?: DemoHub };
const holder = globalThis as HubHolder;

/**
 * The one hub of this server process. The first call opens the record, fills
 * in the recent past and starts the player; every later call gets the same hub
 * back, and its options are ignored.
 */
export function demoHub(options: DemoHubOptions = {}): DemoHub {
  const running = holder[RUNNING_HUB];
  if (running !== undefined) return running;

  const databasePath = options.databasePath ?? hubDatabasePath();
  const store = openHubStore(databasePath);
  try {
    const player = startDemoPlayer({
      store,
      scripts: options.scripts,
      now: options.now,
      timer: options.timer,
    });
    const hub = { databasePath, store, player };
    holder[RUNNING_HUB] = hub;
    return hub;
  } catch (problem) {
    store.close();
    throw problem;
  }
}

export function closeDemoHub(): void {
  const running = holder[RUNNING_HUB];
  if (running === undefined) return;
  running.player.stop();
  running.store.close();
  delete holder[RUNNING_HUB];
}
