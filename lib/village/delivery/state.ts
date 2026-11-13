import {
  legStartsOf,
  managerRoundFor,
  managerStateAt,
  type ManagerRound,
} from "../characters/manager";
import { housesToVisit, type PlacedHouse } from "../houses/place";
import { villageHouses } from "../houses/village";
import { AGENTS_SHARING_BUNKS_FROM } from "../interiors/state";
import type { VillageNews } from "../state/house-status";
import type { VillageState } from "../state/village-state";
import { legsOfAnAgentsWalk, legsOfTheManagersTrip, type TripLeg } from "./trip";

// What has been carried to the desk is history: the clock alone cannot say it.
// So the handover is a small state machine. A state and one thing that happened
// give the next state, and nothing else is read: no clock, no hub, no screen.
// The page steps it once a frame; drawing only ever reads a state.

export const MANAGER = "the manager";

export type PaperworkPlace = "at the house" | "being handed over" | "being carried" | "on the desk";

/** One thing the hub says is waiting for the owner: a request to decide, or a result to look at. */
export type WaitingPaper = {
  /** Its project and its line's id. The same paperwork keeps its key for as long as it waits. */
  readonly key: string;
  readonly project: string;
  readonly kind: "decision" | "result";
  readonly isUrgent: boolean;
  /** The agent that sent it. */
  readonly from: string;
};

export type Paperwork = WaitingPaper & {
  readonly place: PaperworkPlace;
  /** Who has come for it or has it in hand; null while it waits at the house or lies on the desk. */
  readonly carrier: string | null;
  /** When it landed on the desk; null until it does. */
  readonly onTheDeskSinceMs: number | null;
  /** The desk has been opened since it landed. */
  readonly seen: boolean;
};

/** Who is home in each project's house, by name, in the order the house seats them. */
export type AgentsAtHome = ReadonlyMap<string, readonly string[]>;

/** An agent out of its house with its own urgent paperwork. */
export type AgentOut = {
  readonly name: string;
  /** Its place among its house's agents, counted from 0: the station it sits at inside, and so its colour. */
  readonly placeInHouse: number;
  /** It shares its house, so it looks as worn out as it does inside. */
  readonly isWornOut: boolean;
};

/** Someone on the way to the desk with paperwork. One trip at a time for each carrier. */
export type Trip = {
  readonly carrier: string;
  /** The agent walking its own paperwork over; null when someone else carries, the manager for one. */
  readonly agent: AgentOut | null;
  /** The project whose door the paperwork comes from. */
  readonly project: string;
  readonly legs: readonly TripLeg[];
  /** The leg the carrier is on, counted from 0. */
  readonly onLeg: number;
  readonly legStartedAtMs: number;
};

export type DeliveryState = {
  /** The village time this state is true for. */
  readonly atMs: number;
  /** False until the hub's first answer: before it, nothing is known to be waiting. */
  readonly hasHeardNews: boolean;
  /** Everything waiting for the owner, in the order it was first heard of. */
  readonly paperwork: readonly Paperwork[];
  readonly trips: readonly Trip[];
  /**
   * The manager's round keeps its own time: at village time `atMs` it stood at
   * `roundMs`. It runs on from there, except while he is on a trip, when it
   * stands still at the moment it will pick up from.
   */
  readonly managersRound: { readonly roundMs: number; readonly atMs: number };
  /** Paperwork the owner had already seen on the desk before this state began. */
  readonly seenBefore: readonly string[];
  /** Who was home in each house at the last news that said. Only an agent known to be home walks out. */
  readonly agentsAtHome: AgentsAtHome;
};

export type DeliveryEvent =
  /** The village clock moved on. */
  | { readonly type: "time passed"; readonly atMs: number }
  /**
   * The hub answered: this is everything waiting now. Anything missing has
   * stopped waiting. `agentsAtHome` says who is in each house; left out, what
   * was last known stands.
   */
  | {
      readonly type: "news";
      readonly atMs: number;
      readonly waiting: readonly WaitingPaper[];
      readonly agentsAtHome?: AgentsAtHome;
    }
  /** The owner opened the desk: what lies on it has been seen. */
  | { readonly type: "desk opened"; readonly atMs: number }
  /**
   * Someone sets off for the desk with the named paperwork, on legs of their
   * own. The manager does this by himself at a door, and an agent by itself
   * when its paperwork is urgent; anyone else is sent off with this event.
   */
  | {
      readonly type: "carrier sets off";
      readonly atMs: number;
      readonly carrier: string;
      readonly agent?: AgentOut;
      readonly project: string;
      readonly legs: readonly TripLeg[];
      readonly keys: readonly string[];
    };

/**
 * A village where nothing is known yet, with the manager where his round has
 * him at `timeMs`. `seenBefore` is for a page that remembers which paperwork
 * the owner has already looked at.
 */
export function deliveryStartingAt(timeMs: number, seenBefore: readonly string[] = []): DeliveryState {
  const atMs = Math.max(0, timeMs);
  return {
    atMs,
    hasHeardNews: false,
    paperwork: [],
    trips: [],
    managersRound: { roundMs: atMs, atMs },
    seenBefore,
    agentsAtHome: new Map(),
  };
}

const agentsAtHomeByVillage = new WeakMap<VillageState, AgentsAtHome>();

/** Who the hub says is home in each house, in the order the house seats them. */
export function agentsAtHomeOf(village: VillageState): AgentsAtHome {
  let atHome = agentsAtHomeByVillage.get(village);
  if (!atHome) {
    atHome = new Map(village.projects.map((project) => [project.project, project.agents.map((agent) => agent.name)]));
    agentsAtHomeByVillage.set(village, atHome);
  }
  return atHome;
}

const papersByVillage = new WeakMap<VillageState, readonly WaitingPaper[]>();

/** Everything the hub says is waiting, longest-waiting first. */
export function waitingPapersOf(village: VillageState): readonly WaitingPaper[] {
  let papers = papersByVillage.get(village);
  if (!papers) {
    papers = village.projects
      .flatMap((project) => [...project.waiting, ...project.ready])
      .sort((first, second) => second.waitedMs - first.waitedMs)
      .map((item) => ({
        key: `${item.line.project}/${item.line.id}`,
        project: item.line.project,
        kind: item.kind,
        isUrgent: item.isUrgent,
        from: item.line.agent,
      }));
    papersByVillage.set(village, papers);
  }
  return papers;
}

export function tripOf(state: DeliveryState, carrier: string): Trip | null {
  return state.trips.find((trip) => trip.carrier === carrier) ?? null;
}

/** Where the manager's round stands: the time to hand to `managerStateAt`. */
export function managersRoundMsOf(state: DeliveryState): number {
  const { roundMs, atMs } = state.managersRound;
  return tripOf(state, MANAGER) ? roundMs : roundMs + (state.atMs - atMs);
}

/** The stack: what lies on the desk, bottom first. */
export function paperworkOnTheDesk(state: DeliveryState): Paperwork[] {
  return state.paperwork
    .filter((paper) => paper.place === "on the desk")
    .sort((below, above) => (below.onTheDeskSinceMs ?? 0) - (above.onTheDeskSinceMs ?? 0));
}

export function paperworkOf(state: DeliveryState, carrier: string): Paperwork[] {
  return state.paperwork.filter((paper) => paper.carrier === carrier);
}

/** The exclamation mark: something lies on the desk that has landed since the desk was last opened. */
export function markIsShowing(state: DeliveryState): boolean {
  return state.paperwork.some((paper) => paper.place === "on the desk" && !paper.seen);
}

/** The keys of the paperwork the owner has seen on the desk, for a page that wants to remember them. */
export function seenAtTheDesk(state: DeliveryState): string[] {
  return state.paperwork.filter((paper) => paper.seen).map((paper) => paper.key);
}

function landed(paper: Paperwork, atMs: number, seenBefore: readonly string[] = []): Paperwork {
  return {
    ...paper,
    place: "on the desk",
    carrier: null,
    onTheDeskSinceMs: atMs,
    seen: seenBefore.includes(paper.key),
  };
}

function atTheHouse(paper: WaitingPaper): Paperwork {
  return { ...paper, place: "at the house", carrier: null, onTheDeskSinceMs: null, seen: false };
}

function afterSettingOff(
  state: DeliveryState,
  trip: Pick<Trip, "carrier" | "agent" | "project" | "legs">,
  keys: readonly string[],
): DeliveryState {
  // A carrier already out finishes that trip first, and a trip with nowhere to go is no trip.
  if (tripOf(state, trip.carrier) || trip.legs.length === 0) return state;
  const { paperworkIs } = trip.legs[0];
  return {
    ...state,
    trips: [...state.trips, { ...trip, onLeg: 0, legStartedAtMs: state.atMs }],
    paperwork: state.paperwork.map((paper) => {
      if (!keys.includes(paper.key) || paper.place !== "at the house") return paper;
      return paperworkIs === "on the desk"
        ? landed(paper, state.atMs)
        : { ...paper, place: paperworkIs, carrier: trip.carrier };
    }),
  };
}

function afterALegEnds(state: DeliveryState, trip: Trip): DeliveryState {
  const nextLeg = trip.legs[trip.onLeg + 1];
  // However a trip is put together, it ends with its paperwork on the desk.
  const paperworkIs = nextLeg?.paperworkIs ?? "on the desk";
  const paperwork = state.paperwork.map((paper) => {
    if (paper.carrier !== trip.carrier) return paper;
    return paperworkIs === "on the desk" ? landed(paper, state.atMs) : { ...paper, place: paperworkIs };
  });

  if (!nextLeg) {
    return {
      ...state,
      paperwork,
      trips: state.trips.filter((other) => other !== trip),
      managersRound:
        trip.carrier === MANAGER ? { roundMs: state.managersRound.roundMs, atMs: state.atMs } : state.managersRound,
    };
  }
  return {
    ...state,
    paperwork,
    trips: state.trips.map((other) =>
      other === trip ? { ...trip, onLeg: trip.onLeg + 1, legStartedAtMs: state.atMs } : other,
    ),
  };
}

type Handover = {
  readonly atMs: number;
  readonly house: PlacedHouse;
  /** The round's leg he is on when it starts: his wait at that door. */
  readonly waitLeg: number;
  readonly roundsDone: number;
};

function isTheWaitAt(round: ManagerRound, legNumber: number, house: PlacedHouse): boolean {
  const leg = round.legs[legNumber];
  return leg.activity === "waiting" && leg.atHouse === house;
}

/** Every agent known to live in a house is out walking, so nobody is in to hand anything over at its door. */
function everyoneIsOutOf(state: DeliveryState, house: PlacedHouse): boolean {
  if (house.project === null) return false;
  const atHome = state.agentsAtHome.get(house.project) ?? [];
  const away = agentsAwayFrom(state, house.project);
  return atHome.length > 0 && atHome.every((name) => away.includes(name));
}

/**
 * The next moment the manager, out on his round, waits at a door that has
 * paperwork for him and someone in to hand it over.
 */
function nextHandover(state: DeliveryState, houses: readonly PlacedHouse[]): Handover | null {
  if (tripOf(state, MANAGER)) return null;
  const round = managerRoundFor(houses);
  const legStarts = legStartsOf(round);
  const roundMs = managersRoundMsOf(state);
  const roundsDone = Math.floor(roundMs / round.lastsMs);
  const msIntoRound = roundMs - roundsDone * round.lastsMs;

  let next: Handover | null = null;
  for (const house of housesToVisit(houses)) {
    const hasPaperwork = state.paperwork.some(
      (paper) => paper.project === house.project && paper.place === "at the house",
    );
    const waitLeg = round.legs.findIndex((_, legNumber) => isTheWaitAt(round, legNumber, house));
    if (!hasPaperwork || waitLeg < 0 || everyoneIsOutOf(state, house)) continue;

    const waitStarts = legStarts[waitLeg];
    const isWaitingThere = msIntoRound >= waitStarts && msIntoRound < waitStarts + round.legs[waitLeg].lastsMs;
    const msUntil = isWaitingThere ? 0 : (waitStarts - msIntoRound + round.lastsMs) % round.lastsMs;
    if (next === null || state.atMs + msUntil < next.atMs) {
      next = {
        atMs: state.atMs + msUntil,
        house,
        waitLeg,
        // A wait he has already passed this round comes round again in the next one.
        roundsDone: !isWaitingThere && waitStarts < msIntoRound ? roundsDone + 1 : roundsDone,
      };
    }
  }
  return next;
}

function afterTheManagerIsHandedPaperwork(
  state: DeliveryState,
  handover: Handover,
  houses: readonly PlacedHouse[],
): DeliveryState {
  const round = managerRoundFor(houses);
  const walkOn = round.legs[handover.waitLeg + 1];
  const pickUpAt = handover.waitLeg + 2;
  if (walkOn?.activity !== "walking" || pickUpAt >= round.legs.length) {
    throw new Error("The manager's round has no walk on from a door to pick up after a trip to the desk");
  }
  const project = handover.house.project ?? "";
  const setOff = afterSettingOff(
    state,
    { carrier: MANAGER, agent: null, project, legs: legsOfTheManagersTrip(handover.house, walkOn) },
    state.paperwork.filter((paper) => paper.project === project).map((paper) => paper.key),
  );
  return {
    ...setOff,
    managersRound: {
      roundMs: handover.roundsDone * round.lastsMs + legStartsOf(round)[pickUpAt],
      atMs: state.atMs,
    },
  };
}

/** The name an agent carries its own paperwork under: its project's and its own, so no two houses' agents are mixed up. */
export function carrierNameOf(project: string, agent: string): string {
  return `${project}/${agent}`;
}

function managerIsAtTheDoorOf(state: DeliveryState, house: PlacedHouse, houses: readonly PlacedHouse[]): boolean {
  const trip = tripOf(state, MANAGER);
  if (!trip) return managerStateAt(managersRoundMsOf(state), houses).atHouse === house;
  const leg = trip.legs[trip.onLeg];
  return leg.activity !== "walking" && leg.atHouse === house;
}

/** The house and the place in it of the agent who would walk a paper over; null when nobody home can. */
function walkerFor(
  state: DeliveryState,
  paper: Paperwork,
  houses: readonly PlacedHouse[],
): { readonly house: PlacedHouse; readonly agent: AgentOut } | null {
  const house = housesToVisit(houses).find((candidate) => candidate.project === paper.project);
  const atHome = state.agentsAtHome.get(paper.project) ?? [];
  const placeInHouse = atHome.indexOf(paper.from);
  if (!house || placeInHouse < 0) return null;
  return {
    house,
    agent: { name: paper.from, placeInHouse, isWornOut: atHome.length >= AGENTS_SHARING_BUNKS_FROM },
  };
}

/** Urgent paperwork still at its house that its own agent, being home, will walk over. */
function isForItsOwnAgent(state: DeliveryState, paper: Paperwork, houses: readonly PlacedHouse[]): boolean {
  return paper.isUrgent && paper.place === "at the house" && walkerFor(state, paper, houses) !== null;
}

/**
 * While the manager is at a door being handed its paperwork, anything urgent
 * that turns up there goes into his arms with the rest: he is on his way to
 * the desk already, and an agent setting off behind him would only get there
 * as he does.
 */
function afterTheManagerIsHandedWhatIsUrgent(state: DeliveryState): DeliveryState {
  const trip = tripOf(state, MANAGER);
  const leg = trip?.legs[trip.onLeg];
  if (!leg || leg.activity === "walking" || leg.atHouse === null || leg.paperworkIs === "on the desk") return state;
  const { project } = leg.atHouse;
  const isHandedOver = (paper: Paperwork): boolean =>
    paper.isUrgent && paper.place === "at the house" && paper.project === project;
  if (!state.paperwork.some(isHandedOver)) return state;
  return {
    ...state,
    paperwork: state.paperwork.map((paper) =>
      isHandedOver(paper) ? { ...paper, place: leg.paperworkIs, carrier: MANAGER } : paper,
    ),
  };
}

/**
 * Urgent paperwork does not wait for the manager's round: its own agent walks
 * it over, the moment it can. It cannot while another agent is on the way to
 * the desk with paperwork, so only one is ever there; while it is still out on
 * an earlier walk; or while the manager stands at its door, who then takes it
 * himself. Each of those ends with something else happening, so this is asked
 * again after everything that happens and never has to watch the clock.
 */
function afterUrgentPaperworkIsTaken(given: DeliveryState, houses: readonly PlacedHouse[]): DeliveryState {
  const state = afterTheManagerIsHandedWhatIsUrgent(given);
  const someoneIsOnTheWay = state.trips.some(
    (trip) => trip.agent !== null && trip.legs[trip.onLeg].paperworkIs !== "on the desk",
  );
  if (someoneIsOnTheWay) return state;

  for (const paper of state.paperwork) {
    if (!paper.isUrgent || paper.place !== "at the house") continue;
    const walker = walkerFor(state, paper, houses);
    const carrier = carrierNameOf(paper.project, paper.from);
    if (!walker || tripOf(state, carrier) || managerIsAtTheDoorOf(state, walker.house, houses)) continue;
    return afterSettingOff(
      state,
      { carrier, agent: walker.agent, project: paper.project, legs: legsOfAnAgentsWalk(walker.house) },
      // Everything urgent of its own goes in the one walk.
      state.paperwork
        .filter((other) => other.isUrgent && other.project === paper.project && other.from === paper.from)
        .map((other) => other.key),
    );
  }
  return state;
}

function firstLegToEnd(state: DeliveryState): { readonly trip: Trip; readonly atMs: number } | null {
  let first: { trip: Trip; atMs: number } | null = null;
  for (const trip of state.trips) {
    const atMs = trip.legStartedAtMs + trip.legs[trip.onLeg].lastsMs;
    if (first === null || atMs < first.atMs) first = { trip, atMs };
  }
  return first;
}

/** Plays everything that happens by itself up to `toMs`, each thing at its own exact moment and in order. */
function advancedTo(state: DeliveryState, toMs: number, houses: readonly PlacedHouse[]): DeliveryState {
  const until = Math.max(state.atMs, toMs);
  let current = state;
  for (;;) {
    current = afterUrgentPaperworkIsTaken(current, houses);
    const legEnd = firstLegToEnd(current);
    const handover = nextHandover(current, houses);
    if (legEnd && legEnd.atMs <= until && (!handover || legEnd.atMs <= handover.atMs)) {
      current = afterALegEnds({ ...current, atMs: legEnd.atMs }, legEnd.trip);
    } else if (handover && handover.atMs <= until) {
      current = afterTheManagerIsHandedPaperwork({ ...current, atMs: handover.atMs }, handover, houses);
    } else {
      return current.atMs === until ? current : { ...current, atMs: until };
    }
  }
}

function afterNews(
  state: DeliveryState,
  waiting: readonly WaitingPaper[],
  agentsAtHome: AgentsAtHome = state.agentsAtHome,
): DeliveryState {
  const stillWaiting = new Map(waiting.map((paper) => [paper.key, paper]));
  const known = new Set(state.paperwork.map((paper) => paper.key));

  const kept = state.paperwork
    .filter((paper) => stillWaiting.has(paper.key))
    .map((paper) => {
      const { isUrgent } = stillWaiting.get(paper.key) as WaitingPaper;
      return paper.isUrgent === isUrgent ? paper : { ...paper, isUrgent };
    });
  // Whatever was already waiting when the page opened was carried over before
  // anyone was watching: it lies on the desk from the first frame.
  const fresh = waiting
    .filter((paper) => !known.has(paper.key))
    .map((paper) =>
      state.hasHeardNews ? atTheHouse(paper) : landed(atTheHouse(paper), state.atMs, state.seenBefore),
    );

  const nothingChanged =
    state.hasHeardNews &&
    agentsAtHome === state.agentsAtHome &&
    fresh.length === 0 &&
    kept.length === state.paperwork.length &&
    kept.every((paper, index) => paper === state.paperwork[index]);
  return nothingChanged
    ? state
    : { ...state, hasHeardNews: true, paperwork: [...kept, ...fresh], agentsAtHome };
}

function afterTheDeskIsOpened(state: DeliveryState): DeliveryState {
  if (!markIsShowing(state)) return state;
  return {
    ...state,
    paperwork: state.paperwork.map((paper) =>
      paper.place === "on the desk" && !paper.seen ? { ...paper, seen: true } : paper,
    ),
  };
}

/**
 * The state after one thing happens. Time only moves forwards: an event dated
 * before the state counts as happening now.
 */
export function deliveryAfter(
  state: DeliveryState,
  event: DeliveryEvent,
  houses: readonly PlacedHouse[] = villageHouses,
): DeliveryState {
  const now = advancedTo(state, event.atMs, houses);
  switch (event.type) {
    case "time passed":
      return now;
    case "news":
      // He may be waiting at the very door the news is about, and it may be urgent.
      return advancedTo(afterNews(now, event.waiting, event.agentsAtHome), now.atMs, houses);
    case "desk opened":
      return afterTheDeskIsOpened(now);
    case "carrier sets off":
      return afterSettingOff(now, { ...event, agent: event.agent ?? null }, event.keys);
  }
}

/** One frame's step for the page: the clock has moved to `timeMs`, and this is the news it has. */
export function deliveryFollowing(
  state: DeliveryState,
  timeMs: number,
  news: VillageNews,
  houses: readonly PlacedHouse[] = villageHouses,
): DeliveryState {
  const now = deliveryAfter(state, { type: "time passed", atMs: timeMs }, houses);
  // Without an answer from the hub nothing is known to have changed, so the desk keeps what it has.
  if (typeof news === "string") return now;
  return deliveryAfter(
    now,
    { type: "news", atMs: timeMs, waiting: waitingPapersOf(news), agentsAtHome: agentsAtHomeOf(news) },
    houses,
  );
}

/** The trips of agents out of their houses with their own paperwork, in the order they set off. */
export function agentTripsOf(state: DeliveryState): Trip[] {
  return state.trips.filter((trip) => trip.agent !== null);
}

/**
 * The names of a project's agents who are out of its house right now: from
 * the moment one steps out of the door until it has gone back in.
 */
export function agentsAwayFrom(state: DeliveryState, project: string): string[] {
  return state.trips.flatMap((trip) => (trip.agent !== null && trip.project === project ? [trip.agent.name] : []));
}

/**
 * What every agent out of its house is doing, one plain sentence each, for
 * whoever cannot see the picture. Empty when every agent is home.
 */
export function describeAgentsOut(state: DeliveryState): string {
  return state.trips
    .flatMap((trip) => (trip.agent === null ? [] : [`${trip.agent.name} is ${trip.legs[trip.onLeg].doing}.`]))
    .join(" ");
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What is happening with the paperwork, in plain sentences, for whoever cannot see the picture. */
export function describeDelivery(state: DeliveryState, houses: readonly PlacedHouse[] = villageHouses): string {
  const trip = tripOf(state, MANAGER);
  const doing = trip ? trip.legs[trip.onLeg].doing : managerStateAt(managersRoundMsOf(state), houses).doing;
  const sentences = [`The manager is ${doing}.`];
  const agentsOut = describeAgentsOut(state);
  if (agentsOut) sentences.push(agentsOut);

  for (const house of housesToVisit(houses)) {
    const atTheHouse = state.paperwork.filter(
      (paper) => paper.project === house.project && paper.place === "at the house",
    );
    const forItsAgent = atTheHouse.filter((paper) => isForItsOwnAgent(state, paper, houses)).length;
    const forTheManager = atTheHouse.length - forItsAgent;
    if (forItsAgent > 0) {
      sentences.push(
        `${counted(forItsAgent, "urgent paper waits", "urgent papers wait")} at ${house.name} for its agent to walk it over.`,
      );
    }
    if (forTheManager > 0) {
      sentences.push(`${counted(forTheManager, "paper waits", "papers wait")} at ${house.name} for his next call.`);
    }
  }

  const onTheDesk = paperworkOnTheDesk(state).length;
  sentences.push(
    onTheDesk === 0
      ? "Nothing is waiting on the desk."
      : `${counted(onTheDesk, "paper is", "papers are")} waiting on the desk.`,
  );
  if (markIsShowing(state)) {
    sentences.push("An exclamation mark above the computer says something new has landed there.");
  }
  return sentences.join(" ");
}

/**
 * The same, as marks for the page to hang on its canvas (`data-desk-papers`,
 * `data-desk-mark`, `data-delivery`, `data-agents-out`), so a browser test can
 * follow the sequence without reading pixels.
 */
export function deliveryMarksOf(
  state: DeliveryState,
  houses: readonly PlacedHouse[] = villageHouses,
): { deskPapers: string; deskMark: "showing" | "cleared"; delivery: string; agentsOut: string } {
  return {
    deskPapers: String(paperworkOnTheDesk(state).length),
    deskMark: markIsShowing(state) ? "showing" : "cleared",
    delivery: describeDelivery(state, houses),
    agentsOut: describeAgentsOut(state),
  };
}
