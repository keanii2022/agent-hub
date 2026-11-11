import { SCREEN_WIDTH } from "../engine";
import { plazaLayout, type HouseLot, type Point, type Rect } from "../plaza/layout";
import { BODY_HEIGHT, BODY_WIDTH, DOOR, buildNames, windowsOf, type BuildName } from "./builds";
import { isForSale, type HouseData, type HouseEntry } from "./list";
import { propNames, propSprites, type PropName } from "./props";
import { placeSign, signStyleNames, type PlacedSign } from "./signs";

// Turns the house list into houses standing in the plaza: for each entry, its
// lot, and from the lot every spot later steps need. Nothing here is drawn.

/** Rows of grass between the front wall and the street, where the props and the doorstep are. */
const FRONT_YARD_ROWS = 3;
/** How far the sign's board comes down over the roof ridge. */
const SIGN_OVERLAPS_ROOF_ROWS = 5;
const BUILD_OF_AN_EMPTY_HOUSE: BuildName = "plaster cottage";

export const FOR_SALE_WORDS = ["FOR", "SALE"] as const;
const FOR_SALE_BOARD = { width: 29, height: 22 };
const FOR_SALE_POST_ROWS = 6;

/** Where each prop stands, measured across from the door's middle, in the order the list gives them. */
const propOffsets = [17, 31, -17, -31] as const;
export const PROPS_AT_MOST = propOffsets.length;

export type PlacedProp = {
  readonly kind: PropName;
  /** The middle of the prop's foot. */
  readonly at: Point;
};

export type PlacedHouse = {
  /** Its place in the list, counted from 0. A round of the village visits houses in this order. */
  readonly listOrder: number;
  /** The project living here; null when the house is for sale. */
  readonly project: string | null;
  readonly isForSale: boolean;
  /** Whether the project's activity is scripted or its own; null when the house is for sale. */
  readonly data: HouseData | null;
  /** Plain words for a label or a screen reader. */
  readonly name: string;
  readonly lot: HouseLot;
  readonly build: BuildName;
  /** The roof and walls. */
  readonly body: Rect;
  readonly door: Rect;
  /** In the order they light up. */
  readonly windows: readonly Rect[];
  /** On the street, right in front of the door: where a visitor's feet stand to knock. */
  readonly doorstep: Point;
  /** The spot on the door a visitor's knuckles reach. */
  readonly knockSpot: Point;
  /** The slab between the door and the street. */
  readonly step: Rect;
  /** Things standing nearer than this are drawn in front of the house and everything in its yard. */
  readonly footY: number;
  /** The neon sign; null when the house is for sale. */
  readonly sign: PlacedSign | null;
  /** The board of the for-sale sign in the yard; null when a project lives here. */
  readonly forSaleBoard: Rect | null;
  readonly props: readonly PlacedProp[];
  /** The bottom right corner of a tag such as "DEMO", riding on the sign's top edge. */
  readonly tagSpot: Point;
  /** The middle of the top of a note such as "no news", hung under the sign. */
  readonly noteSpot: Point;
  /** The area a click or the keyboard reaches: the house and its sign. */
  readonly clickBounds: Rect;
};

function listed(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

function union(first: Rect, second: Rect): Rect {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(first.x + first.width, second.x + second.width) - x,
    height: Math.max(first.y + first.height, second.y + second.height) - y,
  };
}

function shifted(rect: Rect, by: Point): Rect {
  return { ...rect, x: rect.x + by.x, y: rect.y + by.y };
}

function placeHouse(entry: HouseEntry, listOrder: number, lot: HouseLot): PlacedHouse {
  const forSale = isForSale(entry);
  const build = forSale ? (entry.build ?? BUILD_OF_AN_EMPTY_HOUSE) : entry.build;
  const { doorstep } = lot;
  const wallBottom = doorstep.y - 1 - FRONT_YARD_ROWS;
  const body: Rect = {
    x: doorstep.x - (BODY_WIDTH - 1) / 2,
    y: wallBottom - BODY_HEIGHT + 1,
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
  };
  const door = shifted(DOOR, body);
  const yardFoot = doorstep.y - 1;
  const signBottom = body.y + SIGN_OVERLAPS_ROOF_ROWS - 1;

  const sign = forSale ? null : placeSign(entry.project, entry.sign, doorstep.x, signBottom);
  // The for-sale sign stands on the side of the yard nearer the square, facing whoever walks up.
  const forSaleSide = doorstep.x < SCREEN_WIDTH / 2 ? 1 : -1;
  const forSaleBoard: Rect | null = forSale
    ? {
        x: doorstep.x + forSaleSide * 24 - (FOR_SALE_BOARD.width - 1) / 2,
        y: yardFoot - FOR_SALE_POST_ROWS - FOR_SALE_BOARD.height + 1,
        ...FOR_SALE_BOARD,
      }
    : null;

  return {
    listOrder,
    project: forSale ? null : entry.project,
    isForSale: forSale,
    data: forSale ? null : entry.data,
    name: forSale ? "House for sale" : entry.project,
    lot,
    build,
    body,
    door,
    windows: windowsOf(build).map((window) => shifted(window, body)),
    doorstep,
    knockSpot: { x: doorstep.x + 2, y: door.y + 10 },
    step: { x: door.x - 1, y: wallBottom + 1, width: door.width + 2, height: FRONT_YARD_ROWS },
    footY: yardFoot,
    sign,
    forSaleBoard,
    props: forSale
      ? []
      : entry.props.map((kind, index) => ({
          kind,
          at: { x: doorstep.x + propOffsets[index], y: yardFoot },
        })),
    tagSpot: sign
      ? { x: sign.board.x + sign.board.width - 1, y: sign.board.y }
      : { x: body.x + body.width - 1, y: body.y },
    noteSpot: { x: doorstep.x, y: signBottom + 2 },
    clickBounds: sign ? union(body, sign.board) : body,
  };
}

/**
 * Stands every house of the list on its lot. Throws, in plain words, when the
 * list cannot be built: an unknown lot, two houses on one lot, a project
 * listed twice, a name its sign cannot spell, or something the village has no
 * picture for.
 */
export function placeHouses(list: readonly HouseEntry[]): PlacedHouse[] {
  const lotNames = plazaLayout.houseLots.map((lot) => lot.name);
  const takenLots = new Set<string>();
  const projects = new Set<string>();

  return list.map((entry, listOrder) => {
    const who = isForSale(entry) ? `The house for sale at place ${listOrder + 1}` : `"${entry.project}"`;
    const lot = plazaLayout.houseLots.find((candidate) => candidate.name === entry.lot);
    if (!lot) {
      throw new Error(`${who} asks for the lot "${entry.lot}", which is not in the plaza. The lots are: ${listed(lotNames)}`);
    }
    if (takenLots.has(lot.name)) {
      throw new Error(`${who} asks for the lot "${lot.name}", which already has a house on it`);
    }
    takenLots.add(lot.name);

    const build = isForSale(entry) ? (entry.build ?? BUILD_OF_AN_EMPTY_HOUSE) : entry.build;
    if (!buildNames.includes(build)) {
      throw new Error(`${who} asks for the build "${build}". The builds are: ${listed(buildNames)}`);
    }

    if (!isForSale(entry)) {
      if (projects.has(entry.project)) {
        throw new Error(`"${entry.project}" is in the house list twice. One project, one house`);
      }
      projects.add(entry.project);
      if (!signStyleNames.includes(entry.sign)) {
        throw new Error(`${who} asks for the sign "${entry.sign}". The signs are: ${listed(signStyleNames)}`);
      }
      const unknownProp = entry.props.find((prop) => !(prop in propSprites));
      if (unknownProp) {
        throw new Error(`${who} asks for the prop "${unknownProp}". The props are: ${listed(propNames)}`);
      }
      if (entry.props.length > PROPS_AT_MOST) {
        throw new Error(`${who} has ${entry.props.length} props outside; there is room for ${PROPS_AT_MOST}`);
      }
      if (entry.data !== "demo" && entry.data !== "real") {
        throw new Error(`${who} must say whether its data is "demo" or "real"`);
      }
    }
    return placeHouse(entry, listOrder, lot);
  });
}

/** The houses a round of the village calls at, in list order: every house with a project in it. */
export function housesToVisit(houses: readonly PlacedHouse[]): PlacedHouse[] {
  return houses.filter((house) => !house.isForSale);
}
