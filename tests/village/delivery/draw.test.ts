import { describe, expect, it } from "vitest";
import { humanStateAt } from "../../../lib/village/characters/human";
import {
  MANAGER_HEIGHT,
  MANAGER_WIDTH,
  managerPictures,
  managerPoints,
  type ManagerState,
} from "../../../lib/village/characters/manager";
import {
  DOOR_AGENT_HEIGHT,
  DOOR_AGENT_WIDTH,
  HANDOVER_WORDS,
  ROWS_OF_A_THICK_PAPER,
  SHOULDER_TAP_WORDS,
  STACK_PAPERS_SHOWN_AT_MOST,
  STACK_ROWS_AT_MOST,
  STACK_WIDTH,
  bubbleBoxFor,
  deliveryAfter,
  deliveryDrawables,
  deliverySceneOf,
  deliveryStartingAt,
  deskMark,
  doorAgentFeet,
  drawDeliveryAir,
  drawDeskMark,
  drawSpeechBubble,
  drawStack,
  stackRowsFor,
  wrappedForABubble,
  type DeliveryState,
  type StackedPaper,
} from "../../../lib/village/delivery";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  colourAt,
  createSurface,
  measureText,
  type ColourName,
  type Sprite,
  type Surface,
} from "../../../lib/village/engine";
import { drawVillage, villageHouses } from "../../../lib/village/houses";
import { HORIZON_Y, desk, plazaStateAt, type Point, type Rect } from "../../../lib/village/plaza";
import { coloursIn, contains, findWords, pixelsIn, pixelsThatDiffer, wholeScreen } from "../houses/helpers";
import {
  APPROVAL_DESK,
  anOpenPageWithAnEmptyDesk,
  approvalDeskHouse,
  invented,
  playedTo,
} from "./helpers";

const plain = (count: number): StackedPaper[] => Array.from({ length: count }, () => ({ isUrgent: false }));

/** The box around everything painted on an otherwise empty surface; null when nothing is. */
function paintedBox(surface: Surface): Rect | null {
  const painted = pixelsIn(wholeScreen).filter(({ x, y }) => colourAt(surface, x, y) !== null);
  if (painted.length === 0) return null;
  const xs = painted.map((pixel) => pixel.x);
  const ys = painted.map((pixel) => pixel.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x + 1, height: Math.max(...ys) - y + 1 };
}

function stackAlone(papers: readonly StackedPaper[]): Surface {
  const surface = createSurface();
  drawStack(surface, papers);
  return surface;
}

/** The picture the home page paints for a delivery state. */
function pictureOf(state: DeliveryState): Surface {
  const surface = createSurface();
  const scene = deliverySceneOf(state);
  drawVillage(
    surface,
    plazaStateAt(state.atMs, { ownerIsBeingTapped: scene.ownerIsBeingTapped }),
    villageHouses,
    undefined,
    deliveryDrawables(scene),
  );
  drawDeliveryAir(surface, scene);
  return surface;
}

function openedWith(count: number, atMs: number = 4200, urgent: readonly number[] = []): DeliveryState {
  return deliveryAfter(deliveryStartingAt(atMs), {
    type: "news",
    atMs,
    waiting: invented(count, APPROVAL_DESK, urgent),
  });
}

function boxOf(manager: ManagerState): Rect {
  return {
    x: Math.round(manager.at.x) - managerPoints.feet.x,
    y: Math.round(manager.at.y) - managerPoints.feet.y,
    width: MANAGER_WIDTH,
    height: MANAGER_HEIGHT,
  };
}

const markArea: Rect = {
  x: desk.markSpot.x - Math.floor(deskMark.width / 2),
  y: desk.markSpot.y - deskMark.height,
  width: deskMark.width,
  height: deskMark.height + 1,
};

/** Everywhere a stack that still fits on the desk may paint: its width with a pixel of slip each side, up to its tallest. */
const stackArea: Rect = {
  x: desk.stackSpot.x - (STACK_WIDTH - 1) / 2 - 1,
  y: desk.stackSpot.y - STACK_ROWS_AT_MOST - 2,
  width: STACK_WIDTH + 2,
  height: STACK_ROWS_AT_MOST + 3,
};

describe("the stack of paperwork", () => {
  it("is not there at all when nothing waits", () => {
    expect(paintedBox(stackAlone([]))).toBeNull();
    expect(stackRowsFor(0)).toBe(0);
  });

  it("grows with every paper until it is as tall as it gets, and never shrinks as more arrive", () => {
    let before = 0;
    for (let count = 1; count <= 60; count += 1) {
      const rows = stackRowsFor(count);
      if (before < STACK_ROWS_AT_MOST) expect(rows, `${count} papers`).toBeGreaterThan(before);
      expect(rows, `${count} papers`).toBeGreaterThanOrEqual(before);
      expect(rows, `${count} papers`).toBeLessThanOrEqual(STACK_ROWS_AT_MOST);
      before = rows;
    }
    expect(stackRowsFor(60)).toBe(STACK_ROWS_AT_MOST);
  });

  it("is painted as tall as its rows of paper, standing on its spot", () => {
    for (const count of [1, 2, 3, 4, 5, 8, STACK_PAPERS_SHOWN_AT_MOST]) {
      const box = paintedBox(stackAlone(plain(count)))!;
      // One row of shadow under it, its paper, the top sheet's face and its far edge.
      expect(box.height, `${count} papers`).toBe(stackRowsFor(count) + 3);
      expect(box.y + box.height - 1, `${count} papers`).toBe(desk.stackSpot.y);
      expect(contains(stackArea, box), `${count} papers`).toBe(true);
    }
  });

  it("looks different for every count up to its tallest, so the picture follows the number", () => {
    const pictures = new Set<string>();
    // One past the most it shows whole: the overflowing stack is a picture of its own.
    const lastCountThatShows = STACK_PAPERS_SHOWN_AT_MOST + 1;
    for (let count = 0; count <= lastCountThatShows; count += 1) {
      pictures.add(stackAlone(plain(count)).pixels.join(","));
    }
    expect(pictures.size).toBe(lastCountThatShows + 1);
  });

  it("a tall count still stands on the desk: it stops growing, leans, and sheets lie on the ground", () => {
    const tallest = paintedBox(stackAlone(plain(STACK_PAPERS_SHOWN_AT_MOST)))!;
    expect(tallest.height).toBe(STACK_ROWS_AT_MOST + 3);
    for (const count of [STACK_PAPERS_SHOWN_AT_MOST + 1, 30, 200]) {
      const surface = stackAlone(plain(count));
      const box = paintedBox(surface)!;
      expect(box.y, `${count} papers`).toBe(tallest.y);
      expect(box.y, `${count} papers`).toBeGreaterThan(HORIZON_Y);
      const onTheGround = coloursIn(surface, { x: 0, y: desk.footY, width: SCREEN_WIDTH, height: 4 });
      expect(onTheGround.has("cream"), `${count} papers`).toBe(true);
      // Nothing reaches back over the computer.
      expect(box.x, `${count} papers`).toBeGreaterThanOrEqual(stackArea.x);
    }
    const fits = stackAlone(plain(STACK_PAPERS_SHOWN_AT_MOST));
    expect(coloursIn(fits, { x: 0, y: desk.footY, width: SCREEN_WIDTH, height: 4 }).has("cream")).toBe(false);
  });

  it("marks an urgent paper with a red tab, and no other", () => {
    expect(coloursIn(stackAlone(plain(5)), wholeScreen).has("ember")).toBe(false);
    const withOneUrgent = stackAlone([{ isUrgent: false }, { isUrgent: true }, { isUrgent: false }]);
    const tabRows = new Set(
      pixelsIn(wholeScreen)
        .filter(({ x, y }) => colourAt(withOneUrgent, x, y) === "ember")
        .map((pixel) => pixel.y),
    );
    // The second paper from the bottom, and every row of it.
    const secondPaperStarts = desk.stackSpot.y - 1 - ROWS_OF_A_THICK_PAPER;
    expect([...tabRows].sort((first, second) => first - second)).toEqual(
      Array.from({ length: ROWS_OF_A_THICK_PAPER }, (_, row) => secondPaperStarts - ROWS_OF_A_THICK_PAPER + 1 + row),
    );
  });

  it("stands on the table beside the computer in the village, clear of the owner and his screen", () => {
    const empty = pictureOf(openedWith(0));
    for (const count of [1, 3, 8, STACK_PAPERS_SHOWN_AT_MOST]) {
      const changed = pixelsThatDiffer(pictureOf(openedWith(count)), empty);
      const inTheStack = changed.filter((pixel) => !contains(markArea, { ...pixel, width: 1, height: 1 }));
      expect(inTheStack.length, `${count} papers`).toBeGreaterThan(0);
      for (const pixel of inTheStack) {
        expect(contains(stackArea, { ...pixel, width: 1, height: 1 }), `${count} papers, ${pixel.x},${pixel.y}`).toBe(true);
      }
      const glass = desk.computerGlass;
      expect(changed.some((pixel) => contains(glass, { ...pixel, width: 1, height: 1 }))).toBe(false);
    }
  });
});

describe("the exclamation mark over the computer", () => {
  it("is a yellow mark with a dark edge, standing on its spot above the computer", () => {
    const surface = createSurface();
    drawDeskMark(surface, false);
    const box = paintedBox(surface)!;
    expect(box.y + box.height - 1).toBe(desk.markSpot.y);
    expect(Math.abs(box.x + (box.width - 1) / 2 - desk.markSpot.x)).toBeLessThanOrEqual(0.5);
    expect(desk.markSpot.y).toBeLessThan(desk.computerAt.y);
    expect(coloursIn(surface, box)).toEqual(new Set<ColourName | null>(["ink", "lamp", "cream", null]));
  });

  it("rides one pixel higher while it bobs", () => {
    const raised = createSurface();
    drawDeskMark(raised, true);
    expect(paintedBox(raised)!.y + paintedBox(raised)!.height - 1).toBe(desk.markSpot.y - 1);
  });

  it("shows in the village while something new is on the desk, and is gone once the desk is opened", () => {
    const waiting = openedWith(3);
    expect(coloursIn(pictureOf(waiting), markArea).has("lamp")).toBe(true);

    const opened = deliveryAfter(waiting, { type: "desk opened", atMs: waiting.atMs });
    expect(coloursIn(pictureOf(opened), markArea).has("lamp")).toBe(false);
    // Opening the desk takes the mark away and leaves the stack where it is.
    const changed = pixelsThatDiffer(pictureOf(opened), pictureOf(waiting));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((pixel) => contains(markArea, { ...pixel, width: 1, height: 1 }))).toBe(true);
  });

  it("is not there over an empty desk", () => {
    expect(coloursIn(pictureOf(openedWith(0)), markArea).has("lamp")).toBe(false);
  });
});

describe("speech bubbles", () => {
  it("keeps the owner's words exactly, only broken over short lines between words", () => {
    for (const words of [HANDOVER_WORDS, SHOULDER_TAP_WORDS]) {
      const lines = wrappedForABubble(words);
      expect(lines.join(" ")).toBe(words);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(16);
    }
    expect(wrappedForABubble(HANDOVER_WORDS)).toEqual(["oh snap, master", "has to see this"]);
    expect(wrappedForABubble(SHOULDER_TAP_WORDS)).toEqual(["here you go,", "master"]);
  });

  it("writes every word whole, dark on pale, with its tail on the speaker", () => {
    for (const words of [HANDOVER_WORDS, SHOULDER_TAP_WORDS]) {
      const surface = createSurface();
      const over = { x: 190, y: 100 };
      drawSpeechBubble(surface, { words, over });
      const box = bubbleBoxFor(surface, { words, over });
      for (const line of wrappedForABubble(words)) {
        expect(findWords(surface, line, "ink", box), line).not.toBeNull();
      }
      expect(coloursIn(surface, wholeScreen)).toEqual(new Set<ColourName | null>(["ink", "cream", null]));
      expect(colourAt(surface, over.x, over.y)).toBe("ink");
      expect(box.y + box.height).toBeLessThanOrEqual(over.y);
    }
  });

  it("stays whole inside the picture, even for a speaker at its very edge", () => {
    const corners: Point[] = [
      { x: 0, y: 0 },
      { x: SCREEN_WIDTH - 1, y: 0 },
      { x: 3, y: 120 },
      { x: SCREEN_WIDTH - 4, y: SCREEN_HEIGHT - 1 },
    ];
    for (const over of corners) {
      for (const words of [HANDOVER_WORDS, SHOULDER_TAP_WORDS]) {
        const surface = createSurface();
        drawSpeechBubble(surface, { words, over });
        const box = bubbleBoxFor(surface, { words, over });
        expect(contains(wholeScreen, box), `${words} at ${over.x},${over.y}`).toBe(true);
        for (const line of wrappedForABubble(words)) {
          expect(findWords(surface, line, "ink", box), `${line} at ${over.x},${over.y}`).not.toBeNull();
        }
      }
    }
  });

  it("is wide enough for its longest line and no wider than a third of the picture", () => {
    const surface = createSurface();
    for (const words of [HANDOVER_WORDS, SHOULDER_TAP_WORDS]) {
      const box = bubbleBoxFor(surface, { words, over: { x: 190, y: 100 } });
      expect(box.width).toBeGreaterThan(measureText(wrappedForABubble(words).join("\n")).width);
      expect(box.width).toBeLessThan(SCREEN_WIDTH / 3);
    }
  });
});

describe("the handover in the village's picture", () => {
  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), {
    type: "news",
    atMs: 100,
    waiting: invented(2, APPROVAL_DESK, [1]),
  });
  const states = [heard, ...playedTo(heard, 60_000, 100)];
  const doing = (state: DeliveryState): string => deliverySceneOf(state).manager.doing;
  const during = (what: string): DeliveryState => {
    const found = states.find((state) => doing(state).startsWith(what));
    if (!found) throw new Error(`He is never ${what}`);
    return found;
  };

  const house = approvalDeskHouse;
  const agentBox: Rect = {
    x: house.doorstep.x - 15 - doorAgentFeet.x,
    y: house.doorstep.y - doorAgentFeet.y,
    width: DOOR_AGENT_WIDTH,
    height: DOOR_AGENT_HEIGHT,
  };
  const doorwayBesideHim: Point = { x: house.door.x + 1, y: house.door.y + 12 };

  it("shows the door open and the agent out beside it, saying its line", () => {
    const knocking = pictureOf(during("knocking at"));
    expect(coloursIn(knocking, agentBox).has("cyan")).toBe(false);
    expect(colourAt(knocking, doorwayBesideHim.x, doorwayBesideHim.y)).not.toBe("lamp");

    const handover = during("being handed paperwork");
    const picture = pictureOf(handover);
    expect(coloursIn(picture, agentBox).has("cyan")).toBe(true);
    expect(colourAt(picture, doorwayBesideHim.x, doorwayBesideHim.y)).toBe("lamp");

    const [bubble] = deliverySceneOf(handover).speech;
    expect(bubble.words).toBe(HANDOVER_WORDS);
    for (const line of wrappedForABubble(HANDOVER_WORDS)) {
      expect(findWords(picture, line, "ink", bubbleBoxFor(picture, bubble)), line).not.toBeNull();
    }
    // The bubble hangs over the agent, not over the manager.
    expect(bubble.over.x).toBeLessThan(house.doorstep.x - managerPoints.feet.x);
  });

  it("shuts the door and takes the agent away once he walks off with the paperwork", () => {
    const picture = pictureOf(during("carrying paperwork"));
    expect(coloursIn(picture, agentBox).has("cyan")).toBe(false);
    expect(colourAt(picture, doorwayBesideHim.x, doorwayBesideHim.y)).not.toBe("lamp");
  });

  it("shows the paperwork in his arms and the cigarette in his mouth while he carries it", () => {
    for (const state of states.filter((found) => doing(found).startsWith("carrying paperwork"))) {
      const { manager } = deliverySceneOf(state);
      const seen = coloursIn(pictureOf(state), boxOf(manager));
      expect(seen.has("cream"), `${manager.facing} at ${state.atMs}`).toBe(true);
      if (manager.facing !== "up") expect(seen.has("ember"), `${manager.facing} at ${state.atMs}`).toBe(true);
    }
  });

  it("paints his smoke over the picture, where his state says each puff is", () => {
    const smoking = states.find((state) => (deliverySceneOf(state).manager.smoke ?? []).length >= 3)!;
    const picture = pictureOf(smoking);
    for (const puff of deliverySceneOf(smoking).manager.smoke ?? []) {
      expect(colourAt(picture, puff.at.x, puff.at.y)).toBe(puff.age === "thin" ? "mist" : "cloud");
    }
  });

  it("shows his hand on the owner's shoulder, his line over his head, and the owner looking up", () => {
    const tapping = states.filter((state) => doing(state) === "tapping the owner on the shoulder");
    const handOn = tapping.find((state) => deliverySceneOf(state).manager.handOnShoulder)!;
    const handOff = tapping.find((state) => !deliverySceneOf(state).manager.handOnShoulder)!;

    const picture = pictureOf(handOn);
    expect(colourAt(picture, desk.shoulderSpot.x, desk.shoulderSpot.y)).toBe("peach");
    expect(colourAt(pictureOf(handOff), desk.shoulderSpot.x, desk.shoulderSpot.y)).not.toBe("peach");

    const [bubble] = deliverySceneOf(handOn).speech;
    expect(bubble.words).toBe(SHOULDER_TAP_WORDS);
    for (const line of wrappedForABubble(SHOULDER_TAP_WORDS)) {
      expect(findWords(picture, line, "ink", bubbleBoxFor(picture, bubble)), line).not.toBeNull();
    }
    expect(bubble.over.x).toBe(desk.visitorSpot.x);
  });

  it("puts the stack on the desk as he steps back, with the urgent paper's tab showing", () => {
    const before = pictureOf(during("putting the paperwork on the desk"));
    expect(coloursIn(before, markArea).has("lamp")).toBe(false);

    const after = pictureOf(during("standing back from the desk"));
    expect(coloursIn(after, markArea).has("lamp")).toBe(true);
    expect(coloursIn(after, stackArea).has("ember")).toBe(true);
    expect(colourAt(after, desk.stackSpot.x, desk.stackSpot.y - 2)).toBe("cream");
  });

  it("paints the same picture for the same state", () => {
    const state = during("tapping the owner on the shoulder");
    expect(pixelsThatDiffer(pictureOf(state), pictureOf(state))).toEqual([]);
  });
});

describe("the owner, tapped on the shoulder", () => {
  it("looks up from his screen for as long as the hand is there, whatever he was doing", () => {
    for (const timeMs of [0, 4200, 7000, 12_500, 21_000, 25_500]) {
      const tapped = plazaStateAt(timeMs, { ownerIsBeingTapped: true });
      expect(tapped.human, `at ${timeMs}`).toMatchObject({
        activity: "looking around",
        head: "at the viewer",
        arms: "resting on the keys",
        holdingMug: false,
      });
      expect(tapped.computer.keyDown).toBeNull();
      expect(tapped.mugIsOnDesk).toBe(true);
      expect(plazaStateAt(timeMs).human).toEqual(humanStateAt(timeMs));
      expect(plazaStateAt(timeMs, { ownerIsBeingTapped: false }).human).toEqual(humanStateAt(timeMs));
    }
  });

  it("loses none of what he had typed", () => {
    expect(plazaStateAt(9000, { ownerIsBeingTapped: true }).computer.lines).toEqual(plazaStateAt(9000).computer.lines);
  });
});

describe("the manager's pictures with paperwork", () => {
  const carrying: readonly (readonly [string, Sprite])[] = [
    ...Object.entries(managerPictures.carrying.standing).map(([view, sprite]) => [`standing, ${view}`, sprite] as const),
    ...Object.entries(managerPictures.carrying.walking).flatMap(([view, parts]) =>
      Object.entries(parts).map(([part, sprite]) => [`walking, ${view}, part ${part}`, sprite] as const),
    ),
  ];

  it.each(carrying)("%s: fills the same box, in his own colours, with paper in it", (_, sprite) => {
    expect([sprite.width, sprite.height]).toEqual([MANAGER_WIDTH, MANAGER_HEIGHT]);
    const colours = new Set(sprite.pixels);
    for (const colour of ["ink", "ember", "mist", "cream"] as const) expect(colours.has(colour)).toBe(true);
  });

  it("holds the paperwork where his points say, and smokes where they say, seen from the side", () => {
    const sprite = managerPictures.carrying.standing.side;
    const at = (point: Point): ColourName | null => sprite.pixels[point.y * sprite.width + point.x];
    expect(["cream", "cloud"]).toContain(at(managerPoints.paperworkInArms));
    expect(at(managerPoints.cigaretteTip.side)).toBe("ember");
    expect(at(managerPoints.hatBand)).toBe("ember");
  });

  it("differs from the empty-handed picture of the same pose", () => {
    expect(managerPictures.carrying.standing.side.pixels).not.toEqual(managerPictures.standing.side.pixels);
    expect(managerPictures.carrying.walking.down[0].pixels).not.toEqual(managerPictures.walking.down[0].pixels);
    expect(managerPictures.carrying.walking.up[2].pixels).not.toEqual(managerPictures.walking.up[2].pixels);
  });
});
