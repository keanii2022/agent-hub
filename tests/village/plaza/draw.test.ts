import { describe, expect, it } from "vitest";
import { KEY_PRESS_MS, humanPoints } from "../../../lib/village/characters/human";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  colourAt,
  createSurface,
  fillRect,
  type ColourName,
  type Surface,
} from "../../../lib/village/engine";
import {
  HORIZON_Y,
  desk,
  drawFocusMark,
  drawInDepthOrder,
  drawPlaza,
  drawPlazaGround,
  groundKindAt,
  isInsideRect,
  liesFlat,
  plazaDrawables,
  plazaLayout,
  plazaStateAt,
  type PlazaInput,
  type Point,
  type Rect,
} from "../../../lib/village/plaza";

// The moment the saved screenshot is taken at: the human is typing.
const TYPING_MS = 4200;
const MUG_AT_MOUTH_MS = 12800;

function plazaAt(timeMs: number, input: PlazaInput = {}): Surface {
  const surface = createSurface();
  drawPlaza(surface, plazaStateAt(timeMs, input));
  return surface;
}

function everyPixel(): Point[] {
  const pixels: Point[] = [];
  for (let y = 0; y < SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < SCREEN_WIDTH; x += 1) pixels.push({ x, y });
  }
  return pixels;
}

function pixelsThatDiffer(first: Surface, second: Surface): Point[] {
  return everyPixel().filter(({ x, y }) => colourAt(first, x, y) !== colourAt(second, x, y));
}

function coloursIn(surface: Surface, area: Rect): Set<ColourName | null> {
  const colours = new Set<ColourName | null>();
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) colours.add(colourAt(surface, x, y));
  }
  return colours;
}

function grownBy(area: Rect, margin: number): Rect {
  return {
    x: area.x - margin,
    y: area.y - margin,
    width: area.width + 2 * margin,
    height: area.height + 2 * margin,
  };
}

const typing = plazaAt(TYPING_MS);

describe("the picture of the plaza", () => {
  it("paints every pixel of the screen in a palette colour", () => {
    for (const { x, y } of everyPixel()) {
      expect(colourAt(typing, x, y), `${x},${y}`).not.toBeNull();
    }
  });

  it("is the same picture for the same time, every time", () => {
    expect(pixelsThatDiffer(typing, plazaAt(TYPING_MS))).toEqual([]);
  });

  it("is dusk: a dark sky at the top, a warm glow on the horizon, the sun going down", () => {
    expect(colourAt(typing, 100, 0)).toBe("night");
    const horizonGlow = coloursIn(typing, { x: 0, y: HORIZON_Y - 6, width: SCREEN_WIDTH, height: 6 });
    expect(horizonGlow).toContain("sunset");
    expect(horizonGlow).toContain("peach");
    expect(colourAt(typing, plazaLayout.sunAt.x, plazaLayout.sunAt.y - 3)).toBe("cream");
  });

  it("paints grass green, paths as earth and the square as stone", () => {
    const grassTones: (ColourName | null)[] = ["pine", "moss", "leaf", "grass", "night"];
    const earthTones: (ColourName | null)[] = ["bark", "wood", "clay", "sand"];
    // Weeds grow in the joints between the slabs, so a few green pixels belong to the paving.
    const stoneTones: (ColourName | null)[] = ["ink", "night", "dusk", "slate", "stone", "mist"];
    const weedTones: (ColourName | null)[] = ["pine", "moss", "leaf"];
    const ground = createSurface();
    drawPlazaGround(ground, plazaStateAt(TYPING_MS));
    const butts = plazaLayout.clutter.filter((piece) => liesFlat(piece.kind));
    const isLittered = (x: number, y: number): boolean =>
      butts.some((butt) => Math.abs(x - butt.at.x) <= 3 && Math.abs(y - butt.at.y) <= 2);

    for (const { x, y } of everyPixel().filter((pixel) => !isLittered(pixel.x, pixel.y))) {
      const kind = groundKindAt(x, y);
      const colour = colourAt(ground, x, y);
      // Edges are ragged on purpose: a path's rim may be grass, so only its middle is checked.
      if (kind === "grass") expect(grassTones, `grass at ${x},${y}`).toContain(colour);
      if (kind === "paving") {
        expect([...stoneTones, ...weedTones], `paving at ${x},${y}`).toContain(colour);
      }
      const wellInsidePath =
        kind === "path" &&
        groundKindAt(x - 1, y) === "path" &&
        groundKindAt(x + 1, y) === "path" &&
        groundKindAt(x, y - 1) !== "grass" &&
        groundKindAt(x, y + 1) !== "grass";
      if (wellInsidePath) expect(earthTones, `path at ${x},${y}`).toContain(colour);
    }
  });

  it("leaves every house lot clear: nothing but ground and sky in it", () => {
    const ground = createSurface();
    drawPlazaGround(ground, plazaStateAt(TYPING_MS));
    const tallThings = createSurface();
    drawPlazaGround(tallThings, plazaStateAt(TYPING_MS));
    drawInDepthOrder(tallThings, plazaDrawables(plazaStateAt(TYPING_MS)));
    const covered = pixelsThatDiffer(ground, tallThings);
    for (const lot of plazaLayout.houseLots) {
      // A treetop or a bush may lean a little over the edge of a lot; the middle must stay clear.
      const middleOfLot = grownBy(lot.area, -10);
      const inTheWay = covered.filter(({ x, y }) => isInsideRect(middleOfLot, x, y));
      expect(inTheWay, lot.name).toEqual([]);
    }
  });
});

describe("clutter in the picture", () => {
  const ground = createSurface();
  drawPlazaGround(ground, plazaStateAt(TYPING_MS));

  it("draws every cigarette butt with its orange filter and white paper", () => {
    for (const butt of plazaLayout.clutter.filter((piece) => liesFlat(piece.kind))) {
      const colours = coloursIn(ground, { x: butt.at.x - 3, y: butt.at.y - 2, width: 7, height: 3 });
      expect(colours, `butt at ${butt.at.x},${butt.at.y}`).toContain("sunset");
      expect(colours, `butt at ${butt.at.x},${butt.at.y}`).toContain("cream");
    }
  });

  it("lights the tip of one butt, at the end of its paper, where the smoke starts", () => {
    const tip = plazaLayout.smoulderingButt;
    expect(colourAt(ground, tip.x, tip.y)).toBe("ember");
    expect(colourAt(ground, tip.x + 1, tip.y)).toBe("cream");
    for (const puff of plazaStateAt(TYPING_MS).smoke) expect(puff.at.y).toBeLessThan(tip.y);
  });

  it("sparks at the loose wires of a robot arm, not in mid-air", () => {
    const wires = plazaLayout.sparkingWires;
    const around = coloursIn(typing, { x: wires.x - 1, y: wires.y - 1, width: 3, height: 3 });
    expect(around).toContain("ember");
    expect(around).toContain("lamp");
  });

  it("draws every robot arm in metal with a coloured joint and loose wires", () => {
    const arms = plazaLayout.clutter.filter((piece) => !liesFlat(piece.kind));
    expect(arms.length).toBeGreaterThanOrEqual(2);
    for (const arm of arms) {
      const colours = coloursIn(typing, { x: arm.at.x - 20, y: arm.at.y - 26, width: 40, height: 27 });
      for (const needed of ["mist", "cloud", "sunset", "ember"] as const) {
        expect(colours, `${arm.kind}: ${needed}`).toContain(needed);
      }
    }
  });
});

describe("the desk in the picture", () => {
  const deskArea: Rect = {
    x: desk.chairAt.x - 4,
    y: desk.humanAt.y - 2,
    width: desk.dropOffSpot.x - desk.chairAt.x + 4,
    height: desk.footY - desk.humanAt.y + 4,
  };

  it("shows a person at a wooden table with a computer", () => {
    const colours = coloursIn(typing, deskArea);
    for (const needed of ["peach", "teal", "clay", "wood", "mist", "lime"] as const) {
      expect(colours, needed).toContain(needed);
    }
  });

  it("shows on the glass exactly the letters the state says", () => {
    for (const timeMs of [0, 3 * KEY_PRESS_MS, TYPING_MS, 6500]) {
      const state = plazaStateAt(timeMs);
      const surface = plazaAt(timeMs);
      const glass = desk.computerGlass;
      state.computer.lines.forEach((letters, line) => {
        for (let column = 0; column < glass.width; column += 1) {
          const colour = colourAt(surface, glass.x + column, glass.y + line * 2);
          const isCursor =
            state.computer.cursor.showing &&
            state.computer.cursor.line === line &&
            state.computer.cursor.column === column;
          const expected = isCursor ? "cream" : column < letters ? "lime" : "pine";
          expect(colour, `time ${timeMs}, line ${line}, column ${column}`).toBe(expected);
        }
      });
    }
  });

  it("moves between two key presses, and only at the desk and the small moving things", () => {
    const nextKey = plazaAt(TYPING_MS + KEY_PRESS_MS);
    const changed = pixelsThatDiffer(typing, nextKey);
    const atTheDesk = changed.filter(({ x, y }) => isInsideRect(deskArea, x, y));
    expect(atTheDesk.length).toBeGreaterThan(0);

    const elsewhere = changed.filter(({ x, y }) => !isInsideRect(deskArea, x, y));
    // Away from the desk only single pixels move: a star, a firefly, a puff of smoke.
    expect(elsewhere.length).toBeLessThanOrEqual(40);
  });

  it("takes the mug off the desk while the human drinks from it", () => {
    const mugBody = { x: desk.mugAt.x + 2, y: desk.mugAt.y + 2 };
    expect(colourAt(typing, mugBody.x, mugBody.y)).toBe("ember");
    expect(colourAt(plazaAt(MUG_AT_MOUTH_MS), mugBody.x, mugBody.y)).not.toBe("ember");
  });

  it("stands the human's shoes and the table's feet on the paving", () => {
    const shoes = { x: desk.humanAt.x + humanPoints.feet.x, y: desk.humanAt.y + humanPoints.feet.y };
    expect(groundKindAt(shoes.x, shoes.y)).toBe("paving");
    expect(colourAt(typing, shoes.x, shoes.y)).toBe("ink");
    expect(colourAt(typing, shoes.x, shoes.y - 1)).toBe("cream");
    expect(groundKindAt(desk.tableAt.x + 40, desk.footY)).toBe("paving");
  });
});

describe("the focus mark", () => {
  const focused = plazaAt(TYPING_MS, { computerHasFocus: true });
  const mark = pixelsThatDiffer(typing, focused);

  it("is drawn only when the computer has the keyboard", () => {
    expect(mark.length).toBeGreaterThan(0);
  });

  it("is four bright corners just outside the computer, covering none of it", () => {
    const outer = grownBy(desk.computerBounds, 2);
    const withDarkEdge = grownBy(outer, 1);
    for (const { x, y } of mark) {
      expect(["lamp", "ink"]).toContain(colourAt(focused, x, y));
      expect(isInsideRect(withDarkEdge, x, y), `${x},${y}`).toBe(true);
      expect(isInsideRect(desk.computerBounds, x, y), `${x},${y}`).toBe(false);
    }
    const corners = [
      { x: outer.x, y: outer.y },
      { x: outer.x + outer.width - 1, y: outer.y },
      { x: outer.x, y: outer.y + outer.height - 1 },
      { x: outer.x + outer.width - 1, y: outer.y + outer.height - 1 },
    ];
    for (const corner of corners) expect(colourAt(focused, corner.x, corner.y)).toBe("lamp");
  });

  it("stands out from whatever is behind it: every bright pixel is edged in the darkest colour", () => {
    const bright = mark.filter(({ x, y }) => colourAt(focused, x, y) === "lamp");
    expect(bright.length).toBeGreaterThan(0);
    for (const { x, y } of bright) {
      for (const [besideX, besideY] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        expect(["lamp", "ink"], `beside the mark at ${besideX},${besideY}`).toContain(
          colourAt(focused, besideX, besideY),
        );
      }
    }
  });

  it("can be drawn around any area", () => {
    const surface = createSurface(20, 20);
    drawFocusMark(surface, { x: 6, y: 6, width: 8, height: 8 });
    expect(colourAt(surface, 4, 4)).toBe("lamp");
    expect(colourAt(surface, 15, 15)).toBe("lamp");
    expect(colourAt(surface, 10, 4)).toBeNull();
    expect(colourAt(surface, 10, 10)).toBeNull();
  });
});

describe("depth", () => {
  it("draws what stands further back first, whatever order it is given in", () => {
    const order: string[] = [];
    const surface = createSurface(4, 4);
    drawInDepthOrder(surface, [
      { footY: 30, draw: () => order.push("near") },
      { footY: 10, draw: () => order.push("far") },
      { footY: 20, draw: () => order.push("middle") },
    ]);
    expect(order).toEqual(["far", "middle", "near"]);
  });

  it("lists the desk once, standing where the layout says", () => {
    const drawables = plazaDrawables(plazaStateAt(TYPING_MS));
    expect(drawables.filter((drawable) => drawable.footY === desk.footY)).toHaveLength(1);
    expect(drawables.length).toBe(
      1 +
        plazaLayout.trees.length +
        plazaLayout.plants.length +
        plazaLayout.lampPosts.length +
        plazaLayout.clutter.filter((piece) => !liesFlat(piece.kind)).length,
    );
  });

  it("lets a later step add something of its own between the plaza's things", () => {
    const surface = createSurface();
    const state = plazaStateAt(TYPING_MS);
    drawPlazaGround(surface, state);
    const inFrontOfDesk = { x: desk.tableAt.x + 10, y: desk.tableAt.y + 3 };
    drawInDepthOrder(surface, [
      ...plazaDrawables(state),
      {
        footY: desk.footY + 1,
        draw: (target) => fillRect(target, inFrontOfDesk.x, inFrontOfDesk.y, 4, 4, "pink"),
      },
    ]);
    expect(colourAt(surface, inFrontOfDesk.x, inFrontOfDesk.y)).toBe("pink");
  });
});
