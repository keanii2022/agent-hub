// Safe for the browser: nothing here opens the hub's record. The record is
// read in `read-log.ts`, which only the hub's own route uses.
export {
  DESK_ORDER_IN_WORDS,
  choicesInWords,
  deskItemsFrom,
  housesWithNoNews,
  kindInWords,
  waitedInWords,
  type DeskItem,
  type HouseWithNoNews,
} from "./waiting";
export {
  DESK_LOG_LINES_PER_PROJECT,
  DESK_LOG_ROUTE,
  EVERYTHING,
  agentsOffered,
  emptyLogWords,
  filterWithProject,
  logCountWords,
  logShownFor,
  projectsOffered,
  statusInWords,
  type DeskLog,
  type LogEntry,
  type LogFilter,
  type ShownLog,
} from "./log";
export { DESK_LOG_ASKED_EVERY_MS, askForDeskLog, watchDeskLog, type DeskLogWatch } from "./watch-log";
export { papersSeenAtTheDesk, rememberSeenAtTheDesk, type TabMemory } from "./seen";
export {
  DESK_KEY,
  DESK_ROUTE,
  LEAVE_DESK_KEY,
  PLAZA_ROUTE,
  isInAField,
  leavesTheDesk,
  opensTheDesk,
  type KeyPress,
} from "./keys";
