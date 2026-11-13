export { AWAY_WORDS, BACK_PLATE_WORDS, demoTagBounds, drawInside, type InsideInput } from "./draw";
export {
  AGENTS_PER_BUNK,
  BED_SIZE,
  BUNK_BED_SIZE,
  HEADER_HEIGHT,
  STATIONS_AT_MOST,
  STATIONS_PER_ROW_AT_MOST,
  STATION_SIZE,
  backButtonBounds,
  layoutInside,
  type BedPlace,
  type InsideLayout,
  type StationPlace,
} from "./layout";
export {
  AGENTS_SHARING_BUNKS_FROM,
  BACK_TO_PLAZA_WORDS,
  describeInside,
  insideOf,
  insideSentences,
  openHouseWords,
  stepInPlainWords,
  type InsideAgent,
  type InsideKind,
  type InsideOptions,
  type InsideState,
} from "./state";
export {
  KEY_PRESS_MS,
  LONGEST_SCREEN_LINE,
  agentColours,
  stationStateAt,
  type StationArm,
  type StationState,
} from "./stations";
export { CUT_SHORT_MARK, cutToFit, lettersThatFit, wrapWords, writable } from "./text";
