export { BODY_HEIGHT, BODY_WIDTH, buildNames, glassOfWindow, type BuildName } from "./builds";
export { drawHouse, drawVillage, houseDrawables } from "./draw";
export { isForSale, type HouseData, type HouseEntry, type HouseForSale, type ProjectHouse } from "./list";
export {
  FOR_SALE_WORDS,
  PROPS_AT_MOST,
  housesToVisit,
  placeHouses,
  type PlacedHouse,
  type PlacedProp,
} from "./place";
export { propNames, propSprites, type PropName } from "./props";
export {
  BULBS_IN_A_RUN,
  LETTERS_PER_SIGN_LINE,
  SIGN_LINES_AT_MOST,
  drawPlate,
  drawSign,
  placeSign,
  plateSizeFor,
  signLinesFor,
  signStateAt,
  signStyleNames,
  signStyles,
  type PlacedSign,
  type SignState,
  type SignStyle,
  type SignStyleName,
} from "./signs";
export {
  DEMO_TAG,
  defaultHouseStatus,
  houseStateAt,
  type HouseState,
  type HouseStatus,
  type StatusOf,
} from "./state";
export { describeHouses, villageHouses } from "./village";
