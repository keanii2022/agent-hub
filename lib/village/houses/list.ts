import type { BuildName } from "./builds";
import type { PropName } from "./props";
import type { SignStyleName } from "./signs";

// The shape of one line of the house list in `config/houses.ts`. Everything
// about a house that a person chooses is here; where its pixels go is worked
// out from this by `placeHouses`.

/** Scripted, invented activity, or the project's own. */
export type HouseData = "demo" | "real";

export type ProjectHouse = {
  /** The project's name, exactly as its neon sign spells it. */
  readonly project: string;
  /** The name of a free lot in the plaza, for example "left of the upper street". */
  readonly lot: string;
  readonly build: BuildName;
  readonly sign: SignStyleName;
  /** Left outside, set out from the door: two to its right, nearest first, then two to its left. */
  readonly props: readonly PropName[];
  readonly data: HouseData;
};

export type HouseForSale = {
  readonly forSale: true;
  readonly lot: string;
  readonly build?: BuildName;
};

export type HouseEntry = ProjectHouse | HouseForSale;

export function isForSale(entry: HouseEntry): entry is HouseForSale {
  return "forSale" in entry;
}
