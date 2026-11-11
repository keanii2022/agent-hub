import {
  colourAt,
  drawSprite,
  drawText,
  fillRect,
  measureText,
  setPixel,
  type ColourName,
  type Surface,
} from "../engine";
import {
  drawInDepthOrder,
  drawPlazaAir,
  drawPlazaGround,
  plazaDrawables,
  type Drawable,
} from "../plaza/draw";
import type { Rect } from "../plaza/layout";
import type { PlazaState } from "../plaza/state";
import { DOOR_LIGHT, ROWS_ABOVE_ROOF, bodySprite, glassOfWindow, paintWindowBars } from "./builds";
import { villageHouses } from "./village";
import { FOR_SALE_WORDS, type PlacedHouse } from "./place";
import { propSprites } from "./props";
import { drawPlate, drawSign, plateSizeFor, type PlateColours } from "./signs";
import { defaultHouseStatus, houseStateAt, type HouseState, type StatusOf } from "./state";

const shadedGround: Partial<Record<ColourName, ColourName>> = {
  grass: "leaf",
  leaf: "moss",
  moss: "pine",
  pine: "night",
};

/** The house keeps the last light off the grass right in front of its wall. */
function drawShadowOnYard(surface: Surface, house: PlacedHouse): void {
  const top = house.body.y + house.body.height;
  for (let y = top; y < top + 2; y += 1) {
    for (let x = house.body.x + 1; x < house.body.x + house.body.width - 1; x += 1) {
      if (y > top && (x + y) % 2 !== 0) continue;
      const colour = colourAt(surface, x, y);
      const darker = colour ? shadedGround[colour] : undefined;
      if (darker) setPixel(surface, x, y, darker);
    }
  }
}

function drawLitGlass(surface: Surface, glass: Rect): void {
  fillRect(surface, glass.x, glass.y, glass.width, glass.height, "lamp");
  fillRect(surface, glass.x, glass.y, glass.width, 1, "cream");
  fillRect(surface, glass.x, glass.y + glass.height - 2, glass.width, 2, "sunset");
}

/** A lamp turned low: someone is in, but not at work. No yellow in it, so it is never taken for a working window. */
function drawSoftGlass(surface: Surface, glass: Rect): void {
  fillRect(surface, glass.x, glass.y, glass.width, glass.height, "sunset");
  fillRect(surface, glass.x, glass.y + glass.height - 2, glass.width, 2, "clay");
}

function drawStep(surface: Surface, step: Rect): void {
  fillRect(surface, step.x, step.y, step.width, step.height, "ink");
  fillRect(surface, step.x + 1, step.y, step.width - 2, 1, "mist");
  fillRect(surface, step.x + 1, step.y + 1, step.width - 2, step.height - 1, "stone");
}

const FOR_SALE_LINE_STEP = 9;
const FOR_SALE_POST_WIDTH = 3;

function drawForSaleSign(surface: Surface, board: Rect, footY: number): void {
  const postLeft = board.x + (board.width - FOR_SALE_POST_WIDTH) / 2;
  const postTop = board.y - 2;
  fillRect(surface, postLeft, postTop, FOR_SALE_POST_WIDTH, footY - postTop + 1, "ink");
  fillRect(surface, postLeft + 1, postTop + 1, 1, footY - postTop - 1, "clay");

  fillRect(surface, board.x, board.y, board.width, board.height, "ink");
  fillRect(surface, board.x + 1, board.y + 1, board.width - 2, board.height - 2, "cream");
  fillRect(surface, board.x + 1, board.y + board.height - 2, board.width - 2, 1, "sand");
  FOR_SALE_WORDS.forEach((word, line) => {
    const left = board.x + Math.floor((board.width - measureText(word).width) / 2);
    drawText(surface, word, left, board.y + 3 + line * FOR_SALE_LINE_STEP, "ember");
  });
}

const tagColours: PlateColours = { paper: "sand", words: "ember" };
const noteColours: PlateColours = { paper: "cloud", words: "slate" };

export function drawHouse(surface: Surface, house: PlacedHouse, state: HouseState): void {
  drawShadowOnYard(surface, house);
  drawSprite(surface, bodySprite(house.build, state.isDark), house.body.x, house.body.y - ROWS_ABOVE_ROOF);

  if (!state.isDark) {
    drawLitGlass(surface, { ...DOOR_LIGHT, x: DOOR_LIGHT.x + house.body.x, y: DOOR_LIGHT.y + house.body.y });
    house.windows.slice(0, state.litWindows + state.softWindows).forEach((window, index) => {
      const glass = glassOfWindow(house.build, window);
      if (index < state.litWindows) drawLitGlass(surface, glass);
      else drawSoftGlass(surface, glass);
      paintWindowBars(surface, glass, "wood");
    });
  }
  drawStep(surface, house.step);

  if (house.sign && state.sign) {
    drawSign(surface, house.sign, state.sign);
    if (state.tag) {
      const plate = plateSizeFor(state.tag);
      drawPlate(
        surface,
        state.tag,
        house.tagSpot.x - plate.width + 1,
        house.tagSpot.y - plate.height + 1,
        tagColours,
      );
    }
  }
  if (state.note) {
    const plate = plateSizeFor(state.note);
    drawPlate(surface, state.note, house.noteSpot.x - (plate.width - 1) / 2, house.noteSpot.y, noteColours);
  }

  for (const prop of house.props) {
    const sprite = propSprites[prop.kind];
    drawSprite(surface, sprite, prop.at.x - Math.floor(sprite.width / 2), prop.at.y - sprite.height + 1);
  }
  if (house.forSaleBoard) drawForSaleSign(surface, house.forSaleBoard, house.footY);
}

/** One thing to draw per house, to mix in with everything else standing in the plaza. */
export function houseDrawables(
  houses: readonly PlacedHouse[],
  timeMs: number,
  statusOf: StatusOf = defaultHouseStatus,
): Drawable[] {
  return houses.map((house) => ({
    footY: house.footY,
    draw: (surface: Surface) => drawHouse(surface, house, houseStateAt(house, timeMs, statusOf(house))),
  }));
}

/** The plaza with its houses standing in it: the picture on the home page. */
export function drawVillage(
  surface: Surface,
  plaza: PlazaState,
  houses: readonly PlacedHouse[] = villageHouses,
  statusOf: StatusOf = defaultHouseStatus,
): void {
  drawPlazaGround(surface, plaza);
  drawInDepthOrder(surface, [
    ...plazaDrawables(plaza),
    ...houseDrawables(houses, plaza.timeMs, statusOf),
  ]);
  drawPlazaAir(surface, plaza);
}
