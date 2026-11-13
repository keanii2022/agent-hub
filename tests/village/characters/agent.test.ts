import { describe, expect, it } from "vitest";
import {
  AGENT_HEIGHT,
  AGENT_PACE,
  AGENT_STRIDE_PART_PIXELS,
  AGENT_WIDTH,
  agentBoxAt,
  agentLookAt,
  agentOnLeg,
  agentPicturesFor,
  agentPoints,
  agentSmokeOn,
  agentWalkLeg,
  colourOfAgentAt,
  drawWalkingAgent,
  routeThrough,
  type AgentLook,
  type WalkingAgent,
} from "../../../lib/village/characters/agent";
import type { StandingLeg } from "../../../lib/village/characters/manager";
import { colourAt, createSurface, type ColourName, type Sprite } from "../../../lib/village/engine";
import { villageHouses } from "../../../lib/village/houses";
import { agentColours, stationStateAt, type InsideAgent } from "../../../lib/village/interiors";
import { robotSprite } from "../../../lib/village/interiors/sprites";
import { routeBetween } from "../../../lib/village/routes";

const [house] = villageHouses;

const fresh: AgentLook = { stripe: "pink", isWornOut: false, bulb: "stone" };
const wornOut: AgentLook = { stripe: "violet", isWornOut: true, bulb: "stone" };
const views = ["side", "down", "up"] as const;

function pixelOf(sprite: Sprite, x: number, y: number): ColourName | null {
  return sprite.pixels[y * sprite.width + x];
}

function everyPictureOf(look: AgentLook): Sprite[] {
  const pictures = agentPicturesFor(look);
  return [pictures.emptyHanded, pictures.carrying].flatMap((poses) =>
    views.flatMap((view) => [poses.standing[view], ...Object.values(poses.walking[view])]),
  );
}

function differ(first: Sprite, second: Sprite): boolean {
  return first.pixels.some((colour, index) => colour !== second.pixels[index]);
}

describe("the pictures of an agent out of its house", () => {
  it("fills its box and stands on its bottom row, in every picture", () => {
    for (const look of [fresh, wornOut]) {
      for (const picture of everyPictureOf(look)) {
        expect(picture).toMatchObject({ width: AGENT_WIDTH, height: AGENT_HEIGHT });
        const bottomRow = picture.pixels.slice(-AGENT_WIDTH);
        expect(bottomRow.some((colour) => colour === "ink")).toBe(true);
        const firstPainted = picture.pixels.findIndex((colour) => colour !== null);
        expect(Math.floor(firstPainted / AGENT_WIDTH)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("wears its own colour as a stripe across the top of its head, from every side", () => {
    for (const stripe of agentColours) {
      const pictures = agentPicturesFor({ ...fresh, stripe });
      for (const poses of [pictures.emptyHanded, pictures.carrying]) {
        for (const view of views) {
          const { x, y, length } = agentPoints.stripe[view];
          for (let across = 0; across < length; across += 1) {
            expect(pixelOf(poses.standing[view], x + across, y), `${stripe} from ${view}`).toBe(stripe);
          }
        }
      }
    }
  });

  it("is the robot that sits at its station inside: seen from the side, the very same head", () => {
    for (const look of [fresh, wornOut]) {
      const seated = robotSprite({
        isWornOut: look.isWornOut,
        eye: look.isWornOut ? "half shut" : "wide open",
        bulb: look.bulb,
        stripe: look.stripe,
      });
      const standing = agentPicturesFor(look).emptyHanded.standing.side;
      const headRows = 10;
      let compared = 0;
      for (let y = 0; y < headRows; y += 1) {
        for (let x = 0; x < seated.width; x += 1) {
          const inside = pixelOf(seated, x, y);
          if (inside === null) continue;
          expect(pixelOf(standing, x + 2, y), `head pixel ${x},${y}`).toBe(inside);
          compared += 1;
        }
      }
      expect(compared).toBeGreaterThan(60);
    }
  });

  it("is built of the same metal as inside, with the same orange joints, and no other colours", () => {
    const metal: ColourName[] = ["ink", "slate", "stone", "mist", "cloud", "sunset", "lamp", "cyan"];
    const colours = new Set(everyPictureOf(fresh).flatMap((picture) => picture.pixels.filter((colour) => colour !== null)));
    for (const colour of ["ink", "stone", "mist", "cloud", "sunset", "cyan"] as const) expect(colours).toContain(colour);
    const allowed = new Set<ColourName>([...metal, fresh.stripe, "cream", "ember"]);
    for (const colour of colours) expect(allowed, colour).toContain(colour);
  });

  it("shows the long hours of an agent that shares its house, as it does inside", () => {
    const tidy = agentPicturesFor(fresh).emptyHanded.standing;
    const tired = agentPicturesFor({ ...fresh, isWornOut: true }).emptyHanded.standing;
    for (const view of views) {
      expect(differ(tidy[view], tired[view]), view).toBe(true);
      // The plaster over its dent.
      expect(tired[view].pixels).toContain("sand");
      expect(tidy[view].pixels).not.toContain("sand");
    }
  });

  it("lights the bulb on its antenna in the colour its look says", () => {
    for (const bulb of ["ember", "stone"] as const) {
      const pictures = agentPicturesFor({ ...fresh, bulb }).carrying.standing;
      for (const view of views) expect(pixelOf(pictures[view], agentPoints.bulb.x, agentPoints.bulb.y)).toBe(bulb);
    }
    expect(agentPicturesFor({ ...fresh, bulb: "stone" }).emptyHanded.standing.side.pixels).not.toContain("ember");
  });

  it("holds the paperwork where its points say, and smokes where they say", () => {
    const { carrying, emptyHanded } = agentPicturesFor(fresh);
    const { paperworkInHand, cigaretteTip } = agentPoints;
    expect(pixelOf(carrying.standing.side, paperworkInHand.x, paperworkInHand.y)).toBe("cloud");
    expect(pixelOf(emptyHanded.standing.side, paperworkInHand.x, paperworkInHand.y)).toBeNull();
    expect(pixelOf(carrying.standing.side, cigaretteTip.side.x, cigaretteTip.side.y)).toBe("ember");
    expect(pixelOf(carrying.standing.down, cigaretteTip.down.x, cigaretteTip.down.y)).toBe("ember");
    // From behind the cigarette is hidden by its head.
    expect(carrying.standing.up.pixels).not.toContain("ember");
    for (const view of views) {
      expect(emptyHanded.standing[view].pixels).not.toContain("ember");
      expect(emptyHanded.standing[view].pixels).not.toContain("cream");
      expect(carrying.standing[view].pixels).toContain("cream");
      expect(differ(carrying.standing[view], emptyHanded.standing[view])).toBe(true);
    }
  });

  it("moves its legs through a walk cycle of four parts, in every view", () => {
    for (const poses of Object.values(agentPicturesFor(fresh))) {
      for (const view of views) {
        const cycle = poses.walking[view];
        expect(differ(cycle[0], cycle[1]), view).toBe(true);
        expect(differ(cycle[1], cycle[2]), view).toBe(true);
        expect(differ(cycle[0], poses.standing[view]), view).toBe(true);
      }
      expect(differ(poses.walking.down[0], poses.walking.down[2])).toBe(true);
    }
    // Empty-handed and seen from the side, its arm swings back on one stride and forward on the next.
    const { side } = agentPicturesFor(fresh).emptyHanded.walking;
    expect(differ(side[0], side[2])).toBe(true);
  });

  it("paints each look once and hands the same pictures back", () => {
    expect(agentPicturesFor({ ...fresh })).toBe(agentPicturesFor({ ...fresh }));
    expect(agentPicturesFor(fresh)).not.toBe(agentPicturesFor(wornOut));
  });
});

describe("an agent's colour and look outside its house", () => {
  const agent: InsideAgent = { name: "helper", step: "water", what: "Watering", isWorking: true, isAway: false };

  it("is the colour of its station inside, place for place", () => {
    for (let place = 0; place < agentColours.length + 3; place += 1) {
      expect(colourOfAgentAt(place)).toBe(stationStateAt(0, place, agent, false).colour);
    }
  });

  it("flashes its bulb red four times a second while it carries, and keeps it dark when it does not", () => {
    expect(agentLookAt(0, 1, true, true)).toEqual({ stripe: agentColours[1], isWornOut: true, bulb: "ember" });
    expect(agentLookAt(250, 1, true, true).bulb).toBe("stone");
    expect(agentLookAt(500, 1, true, true).bulb).toBe("ember");
    for (const timeMs of [0, 250, 500, 750]) expect(agentLookAt(timeMs, 0, false, false).bulb).toBe("stone");
  });
});

describe("where an agent is on a leg of its walk", () => {
  const from = { x: 100, y: 100 };
  const walk = agentWalkLeg(routeThrough([from, { x: 140, y: 100 }]), "walking somewhere", null);
  const standing: StandingLeg = {
    activity: "tapping the shoulder",
    doing: "tapping the owner on the shoulder",
    atHouse: null,
    at: { x: 100, y: 100 },
    facing: "right",
    lastsMs: 2400,
  };

  it("walks at its own pace, in whole milliseconds, and arrives exactly as the leg ends", () => {
    expect(walk).toMatchObject({ activity: "walking", headingFor: null, lastsMs: Math.ceil((40 / AGENT_PACE) * 1000) });
    expect(agentOnLeg(walk, 0).at).toEqual(from);
    expect(agentOnLeg(walk, 1000).at.x).toBeCloseTo(from.x + AGENT_PACE);
    expect(agentOnLeg(walk, walk.lastsMs).at).toEqual({ x: 140, y: 100 });
    expect(agentOnLeg(walk, 500)).toMatchObject({ facing: "right", handOnShoulder: false });

    const home = agentWalkLeg(routeBetween({ x: house.doorstep.x + 40, y: house.doorstep.y }, house.doorstep), "walking home", house);
    expect(home.headingFor).toBe(house);
    expect(agentOnLeg(home, home.lastsMs).at).toEqual(house.doorstep);
  });

  it("moves its legs with the ground it covers, so its feet never slide", () => {
    const msPerPart = (AGENT_STRIDE_PART_PIXELS / AGENT_PACE) * 1000;
    expect([0, 1, 2, 3, 4].map((part) => agentOnLeg(walk, part * msPerPart + 1).stride)).toEqual([0, 1, 2, 3, 0]);
    expect(agentOnLeg(standing, 500).stride).toBeNull();
  });

  it("puts its hand on the shoulder and takes it off again, tap after tap", () => {
    expect(agentOnLeg(standing, 0)).toMatchObject({ at: standing.at, facing: "right", handOnShoulder: true });
    expect(agentOnLeg(standing, 300).handOnShoulder).toBe(false);
    expect(agentOnLeg(standing, 400).handOnShoulder).toBe(true);
  });

  it("breathes smoke from the end of its cigarette, and leaves it hanging where it was", () => {
    // A fresh leg starts with clear air: nothing but the puff being breathed out.
    expect(agentSmokeOn(walk, 0).length).toBeLessThanOrEqual(1);
    const puffs = agentSmokeOn(walk, 1300);
    expect(puffs.length).toBeGreaterThanOrEqual(2);
    const box = agentBoxAt(agentOnLeg(walk, 1300).at, "right");
    for (const puff of puffs) {
      expect(puff.at.y).toBeLessThan(box.y + agentPoints.cigaretteTip.side.y);
      expect(puff.at.x).toBeLessThanOrEqual(box.x + agentPoints.cigaretteTip.side.x + 1);
    }
  });

  it("keeps its feet on the same spot whichever way it faces", () => {
    const at = { x: 120.4, y: 90.6 };
    expect(agentBoxAt(at, "right")).toEqual({ x: 120 - agentPoints.feet.x, y: 91 - agentPoints.feet.y });
    expect(agentBoxAt(at, "down")).toEqual(agentBoxAt(at, "right"));
    expect(agentBoxAt(at, "left").x + (AGENT_WIDTH - 1 - agentPoints.feet.x)).toBe(120);

    const look = agentLookAt(250, 0, false, false);
    const facing = (way: "left" | "right"): WalkingAgent => ({
      ...agentOnLeg({ ...standing, facing: way, at: { x: 40, y: 40 } }, 0),
      name: "helper",
      home: house,
      carriesPaperwork: true,
      smoke: [],
      look,
    });
    const right = createSurface(80, 60);
    const left = createSurface(80, 60);
    drawWalkingAgent(right, facing("right"));
    drawWalkingAgent(left, facing("left"));
    // Facing left is the same picture turned about the middle of its feet.
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 80; x += 1) expect(colourAt(left, 80 - x, y)).toBe(colourAt(right, x, y));
    }
    expect(colourAt(right, 40, 40)).not.toBeNull();
  });
});

describe("a walk through corners of its own", () => {
  it("is as long as its runs, corner to corner", () => {
    const route = routeThrough([
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 45, y: 30 },
    ]);
    expect(route.length).toBe(55);
    expect(route.points.length).toBe(3);
  });

  it("refuses, in plain words, a run that is neither level nor upright, or that goes nowhere", () => {
    expect(() => routeThrough([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toThrow(/cannot go straight from 0,0 to 5,5/);
    expect(() => routeThrough([{ x: 3, y: 3 }, { x: 3, y: 3 }])).toThrow(/cannot go straight/);
  });
});
