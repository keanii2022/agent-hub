import { HUB_DATABASE_PATH, openHubStore, type HubStore } from "../store";
import {
  startDemoPlayer,
  type DemoClock,
  type DemoTimer,
  type RunningDemoPlayer,
} from "./player";
import {
  configuredRealFeeds,
  startRealFeeds,
  type RealFeed,
  type RunningRealFeeds,
} from "./real-feeds";
import type { DemoScript } from "./script";
import { DEMO_SCRIPTS } from "./scripts";

export const HUB_DATABASE_PATH_VARIABLE = "HUB_DATABASE_PATH";

type Environment = Record<string, string | undefined>;

/** Where the hub keeps its record. Several hubs can run side by side, each with its own. */
export function hubDatabasePath(environment: Environment = process.env): string {
  const chosen = environment[HUB_DATABASE_PATH_VARIABLE];
  return chosen === undefined || chosen.trim() === "" ? HUB_DATABASE_PATH : chosen;
}

export const HUB_FROZEN_AT_VARIABLE = "HUB_FROZEN_AT";

const UTC_MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * The moment the hub is frozen at, or null when it runs live. A frozen hub
 * plays the demo up to that moment once and then never moves on, so a browser
 * test sees the very same village on every run.
 */
export function hubFrozenAt(environment: Environment = process.env): Date | null {
  const chosen = environment[HUB_FROZEN_AT_VARIABLE];
  if (chosen === undefined || chosen.trim() === "") return null;
  const moment = new Date(chosen);
  if (!UTC_MOMENT.test(chosen) || Number.isNaN(moment.getTime())) {
    throw new Error(
      `${HUB_FROZEN_AT_VARIABLE} is "${chosen}", which isn't a time the hub can read. It has to look like 2026-10-05T14:07:30Z.`,
    );
  }
  return moment;
}

const neverTicks: DemoTimer = () => () => {};

export type DemoHub = {
  databasePath: string;
  store: HubStore;
  player: RunningDemoPlayer;
  /** The projects on their own data. None unless the hub was told where a project's records are. */
  realFeeds: RunningRealFeeds;
  /** The hub's own clock: the real time, or the one frozen moment. Everything that answers "as of now" asks here. */
  now: DemoClock;
  isFrozen: boolean;
};

export type DemoHubOptions = {
  databasePath?: string;
  scripts?: readonly DemoScript[];
  realFeeds?: readonly RealFeed[];
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
 * back, and its options are ignored. With `HUB_FROZEN_AT` set, the clock stays
 * on that moment and the player never ticks. A project with a real feed is
 * read from its own records, and its scripted day is not played.
 */
export function demoHub(options: DemoHubOptions = {}): DemoHub {
  const running = holder[RUNNING_HUB];
  if (running !== undefined) return running;

  const frozenAt = hubFrozenAt();
  const isFrozen = frozenAt !== null;
  const now = options.now ?? (isFrozen ? () => frozenAt : () => new Date());
  const databasePath = options.databasePath ?? hubDatabasePath();
  const feeds = options.realFeeds ?? configuredRealFeeds();
  const isReal = (project: string) => feeds.some((feed) => feed.project === project);
  const timer = options.timer ?? (isFrozen ? neverTicks : undefined);
  const store = openHubStore(databasePath);
  try {
    const player = startDemoPlayer({
      store,
      scripts: (options.scripts ?? DEMO_SCRIPTS).filter((script) => !isReal(script.project)),
      now,
      timer,
    });
    const realFeeds = startRealFeeds({ store, feeds, timer });
    const hub = { databasePath, store, player, realFeeds, now, isFrozen };
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
  running.realFeeds.stop();
  running.store.close();
  delete holder[RUNNING_HUB];
}
