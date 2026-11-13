import { describe, expect, it } from "vitest";
import {
  AGENT_HEIGHT,
  AGENT_WIDTH,
  agentBoxAt,
  agentPoints,
  type WalkingAgent,
} from "../../../lib/village/characters/agent";
import {
  HANDOVER_WORDS,
  URGENT_TAP_WORDS,
  agentsAwayFrom,
  bubbleBoxFor,
  deliveryAfter,
  deliveryDrawables,
  deliverySceneOf,
  deliveryStartingAt,
  deskMark,
  drawDeliveryAir,
  legsOfAnAgentsWalk,
  type AgentsAtHome,
  type DeliveryState,
  type WaitingPaper,
} from "../../../lib/village/delivery";
import { colourAt, createSurface, type ColourName, type Surface } from "../../../lib/village/engine";
import { drawVillage, glassOfWindow, villageHouses, type PlacedHouse } from "../../../lib/village/houses";
import { agentColours } from "../../../lib/village/interiors";
import { desk, plazaStateAt, type Rect } from "../../../lib/village/plaza";
import { statusOfVillage } from "../../../lib/village/state";
import { coloursIn, contains, findWords, pixelsThatDiffer, wholeScreen } from "../houses/helpers";
import { frozenVillage } from "../interiors/helpers";
import { APPROVAL_DESK, TEAM_PROJECT, approvalDeskHouse, playedTo, teamHouse } from "./helpers";

// The frozen village the browser tests see: one agent in approval-desk, three in the team house.
const AT_HOME: AgentsAtHome = new Map(
  frozenVillage.projects.map((project) => [project.project, project.agents.map((agent) => agent.name)]),
);
const [refundAgent] = AT_HOME.get(APPROVAL_DESK)!;
const team = AT_HOME.get(TEAM_PROJECT)!;

function urgentFrom(project: string, from: string, id: string = "ask-1"): WaitingPaper {
  return { key: `${project}/${id}`, project, kind: "decision", isUrgent: true, from };
}

/** The picture the home page paints for a delivery state, with the frozen village's news. */
function pictureOf(state: DeliveryState): Surface {
  const surface = createSurface();
  const scene = deliverySceneOf(state);
  drawVillage(
    surface,
    plazaStateAt(state.atMs, { ownerIsBeingTapped: scene.ownerIsBeingTapped }),
    villageHouses,
    statusOfVillage(frozenVillage, (project) => agentsAwayFrom(state, project)),
    deliveryDrawables(scene),
  );
  drawDeliveryAir(surface, scene);
  return surface;
}

function boxOf(agent: WalkingAgent): Rect {
  return { ...agentBoxAt(agent.at, agent.facing), width: AGENT_WIDTH, height: AGENT_HEIGHT };
}

type WindowLight = "bright" | "soft" | "off";

function windowLights(picture: Surface, house: PlacedHouse): WindowLight[] {
  return house.windows.map((window) => {
    const colours = coloursIn(picture, glassOfWindow(house.build, window));
    return colours.has("lamp") ? "bright" : colours.has("sunset") ? "soft" : "off";
  });
}

function doorway(house: PlacedHouse): Rect {
  return { x: house.door.x + 1, y: house.door.y + 1, width: house.door.width - 2, height: 10 };
}

const openPage = deliveryAfter(deliveryStartingAt(0), { type: "news", atMs: 0, waiting: [], agentsAtHome: AT_HOME });
// The manager is resting at the desk, and has left it by the time the agent gets there: the two are never in
// each other's way at a door or behind the chair on this walk.
const SETS_OFF_AT_MS = 26_000;
const setOff = deliveryAfter(openPage, {
  type: "news",
  atMs: SETS_OFF_AT_MS,
  waiting: [urgentFrom(APPROVAL_DESK, refundAgent)],
  agentsAtHome: AT_HOME,
});
const WALK_AND_BACK_MS = legsOfAnAgentsWalk(approvalDeskHouse).reduce((total, leg) => total + leg.lastsMs, 0);
const states = [setOff, ...playedTo(setOff, SETS_OFF_AT_MS + WALK_AND_BACK_MS + 1000, 100)];
const walker = (state: DeliveryState): WalkingAgent => deliverySceneOf(state).walkers[0];
const during = (doing: string, where: (agent: WalkingAgent) => boolean = () => true): DeliveryState => {
  const found = states.find((state) => walker(state)?.doing.startsWith(doing) && where(walker(state)));
  if (!found) throw new Error(`It is never ${doing}`);
  return found;
};

describe("the urgent walk in the village's picture", () => {
  const beforeIt = pictureOf(deliveryAfter(openPage, { type: "time passed", atMs: SETS_OFF_AT_MS }));
  const home = states.at(-1)!;

  it("shows the agent stepping out of its open door with the paperwork, saying the agent's line", () => {
    const steppingOut = during("stepping out");
    const picture = pictureOf(steppingOut);
    const box = boxOf(walker(steppingOut));
    expect(coloursIn(picture, box)).toContain(agentColours[0]);
    expect(coloursIn(picture, box)).toContain("cyan");
    expect(coloursIn(picture, box)).toContain("cream");
    expect(coloursIn(beforeIt, box)).not.toContain(agentColours[0]);

    const [bubble] = deliverySceneOf(steppingOut).speech;
    const bubbleBox = bubbleBoxFor(picture, bubble);
    expect(contains(wholeScreen, bubbleBox)).toBe(true);
    for (const word of HANDOVER_WORDS.split(" ")) expect(findWords(picture, word, "ink", bubbleBox), word).not.toBeNull();
  });

  it("paints it where its state says it is, all along the way, and nowhere once it is home", () => {
    for (const doing of ["walking urgent paperwork", "walking round the desk", "walking back to"]) {
      const state = during(doing);
      const changed = pixelsThatDiffer(pictureOf(state), pictureOf({ ...state, trips: [] }), boxOf(walker(state)));
      expect(changed.length, doing).toBeGreaterThan(80);
    }
    expect(deliverySceneOf(home).walkers).toEqual([]);
    expect(pixelsThatDiffer(pictureOf(home), pictureOf({ ...home, trips: [] }))).toEqual([]);
  });

  it("is the same robot from every side: its own stripe shows walking across, towards us and away", () => {
    for (const facing of ["right", "down", "up", "left"] as const) {
      const state = states.find((found) => walker(found)?.stride !== null && walker(found)?.facing === facing);
      if (!state) throw new Error(`It never walks ${facing}`);
      expect(coloursIn(pictureOf(state), boxOf(walker(state))), facing).toContain(agentColours[0]);
    }
  });

  it("paints its smoke over the picture, where its state says each puff is", () => {
    const smoking = states.find((state) => (walker(state)?.smoke.length ?? 0) >= 3)!;
    const picture = pictureOf(smoking);
    for (const puff of walker(smoking).smoke) {
      expect(["cloud", "mist"]).toContain(colourAt(picture, puff.at.x, puff.at.y));
    }
  });

  it("shows its arm reaching the owner's shoulder, its line over its head, and the owner looking up", () => {
    const tapping = states.filter((state) => walker(state)?.activity === "tapping the shoulder");
    const handOn = tapping.find((state) => walker(state).handOnShoulder)!;
    const handOff = tapping.find((state) => !walker(state).handOnShoulder)!;
    const { shoulderSpot } = desk;
    expect(colourAt(pictureOf(handOn), shoulderSpot.x, shoulderSpot.y)).toBe("cloud");
    expect(colourAt(pictureOf(handOff), shoulderSpot.x, shoulderSpot.y)).not.toBe("cloud");
    expect(colourAt(beforeIt, shoulderSpot.x, shoulderSpot.y)).not.toBe("cloud");
    // The arm starts at its own shoulder, with an orange joint like the arms it types with.
    const box = boxOf(walker(handOn));
    expect(colourAt(pictureOf(handOn), box.x + agentPoints.shoulder.x, box.y + agentPoints.shoulder.y)).toBe("sunset");

    const picture = pictureOf(handOn);
    const [bubble] = deliverySceneOf(handOn).speech;
    const bubbleBox = bubbleBoxFor(picture, bubble);
    expect(contains(wholeScreen, bubbleBox)).toBe(true);
    for (const word of URGENT_TAP_WORDS.split(" ")) expect(findWords(picture, word, "ink", bubbleBox), word).not.toBeNull();
    expect(deliverySceneOf(handOn).ownerIsBeingTapped).toBe(true);
  });

  it("puts the paper on the stack with its red tab, under the mark, as it steps back", () => {
    // An urgent paper's red tab, on the lowest paper of the stack.
    const tab = { x: desk.stackSpot.x + 2, y: desk.stackSpot.y - 1 };
    const markArea: Rect = {
      x: desk.markSpot.x - Math.floor(deskMark.width / 2),
      y: desk.markSpot.y - deskMark.height,
      width: deskMark.width,
      height: deskMark.height + 1,
    };
    const puttingDown = pictureOf(during("putting the paperwork"));
    expect(colourAt(puttingDown, tab.x, tab.y)).not.toBe("ember");
    expect(coloursIn(puttingDown, markArea)).not.toContain("lamp");

    const steppedBack = pictureOf(during("standing back"));
    expect(colourAt(steppedBack, tab.x, tab.y)).toBe("ember");
    expect(colourAt(steppedBack, tab.x - 2, tab.y)).toBe("cloud");
    expect(coloursIn(steppedBack, markArea)).toContain("lamp");
    expect(colourAt(pictureOf(home), tab.x, tab.y)).toBe("ember");
  });

  it("paints the same picture for the same state", () => {
    const state = during("walking urgent paperwork");
    expect(pixelsThatDiffer(pictureOf(state), pictureOf(state))).toEqual([]);
  });
});

describe("the house of an agent that is out, seen from the plaza", () => {
  const lit: ColourName = "lamp";

  it("has that agent's window dark and its door standing open, from the step out to the step back in", () => {
    const before = pictureOf(deliveryAfter(openPage, { type: "time passed", atMs: SETS_OFF_AT_MS }));
    expect(windowLights(before, approvalDeskHouse)).toEqual(["bright", "off"]);
    expect(coloursIn(before, doorway(approvalDeskHouse))).not.toContain(lit);

    for (const state of states.filter((found) => walker(found))) {
      const picture = pictureOf(state);
      expect(windowLights(picture, approvalDeskHouse), walker(state).doing).toEqual(["off", "off"]);
      expect(coloursIn(picture, doorway(approvalDeskHouse)), walker(state).doing).toContain(lit);
      // Nobody else's house changes.
      expect(windowLights(picture, teamHouse)).toEqual(["bright", "bright", "soft"]);
      expect(coloursIn(picture, doorway(teamHouse))).not.toContain(lit);
    }

    const backIn = pictureOf(states.at(-1)!);
    expect(windowLights(backIn, approvalDeskHouse)).toEqual(["bright", "off"]);
    expect(coloursIn(backIn, doorway(approvalDeskHouse))).not.toContain(lit);
  });

  it("keeps its sign lit and hangs no note on it: the house has news, its agent is only out", () => {
    const whileOut = during("walking urgent paperwork");
    const status = statusOfVillage(frozenVillage, (project) => agentsAwayFrom(whileOut, project))(approvalDeskHouse);
    expect(status).toMatchObject({ isDark: false, note: null, litWindows: 0, softWindows: 0, agentsAway: 1 });
  });

  it("turns off one window of a shared house for the one who is out, and leaves the others on", () => {
    const fromTheTeam = deliveryAfter(openPage, {
      type: "news",
      atMs: 19_400,
      waiting: [urgentFrom(TEAM_PROJECT, team[2])],
      agentsAtHome: AT_HOME,
    });
    expect(agentsAwayFrom(fromTheTeam, TEAM_PROJECT)).toEqual([team[2]]);
    const picture = pictureOf(fromTheTeam);
    expect(windowLights(picture, teamHouse).filter((light) => light === "off").length).toBe(1);
    expect(coloursIn(picture, doorway(teamHouse))).toContain(lit);
    expect(windowLights(picture, approvalDeskHouse)).toEqual(["bright", "off"]);

    const walkerOfTheTeam = deliverySceneOf(fromTheTeam).walkers[0];
    expect(walkerOfTheTeam.look).toMatchObject({ stripe: agentColours[2], isWornOut: true });
    expect(coloursIn(picture, boxOf(walkerOfTheTeam))).toContain(agentColours[2]);
  });
});

describe("an agent tapping the owner while the manager stands behind the chair", () => {
  it("still shows over his hat, stripe and all, so both can be told apart", () => {
    // Every moment an agent could set off in one round of the manager's: some of them end at the desk with him there.
    let together: DeliveryState | null = null;
    for (let setsOffAt = 0; setsOffAt < 30_000 && !together; setsOffAt += 250) {
      const start = deliveryAfter(openPage, {
        type: "news",
        atMs: setsOffAt,
        waiting: [urgentFrom(TEAM_PROJECT, team[1])],
        agentsAtHome: AT_HOME,
      });
      together =
        playedTo(start, setsOffAt + 10_000, 100).find((state) => {
          const scene = deliverySceneOf(state);
          return scene.walkers[0]?.activity === "tapping the shoulder" && scene.manager.activity === "at the desk";
        }) ?? null;
    }
    if (!together) throw new Error("The two are never at the desk together");

    const picture = pictureOf(together);
    const agent = deliverySceneOf(together).walkers[0];
    const box = agentBoxAt(agent.at, agent.facing);
    const { x, y, length } = agentPoints.stripe.side;
    for (let across = 0; across < length; across += 1) {
      expect(colourAt(picture, box.x + x + across, box.y + y)).toBe(agentColours[1]);
    }
    // And the manager's hat band is still his, below it.
    expect(coloursIn(picture, { x: box.x, y: box.y + 6, width: AGENT_WIDTH, height: 10 })).toContain("ember");
  });
});
