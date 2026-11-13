import { TRANSPARENT_LETTER, spriteFromRows, type ColourKey, type Sprite } from "../engine";

const colours: ColourKey = {
  k: "ink",
  S: "slate",
  t: "stone",
  i: "mist",
  u: "cloud",
  c: "cream",
  o: "sunset",
  l: "lamp",
  C: "cyan",
};

/** The box the agent at the door is drawn in. Its bottom row is the ground it stands on. It faces right. */
export const DOOR_AGENT_WIDTH = 17;
export const DOOR_AGENT_HEIGHT = 23;
/** The middle of its feet, inside its box. */
export const doorAgentFeet = { x: 6, y: DOOR_AGENT_HEIGHT - 1 } as const;

// A house robot: the same grey shell and orange joints as the broken arms
// lying about the plaza, with one bright eye.
const agentBodyRows = [
  ".....l...........",
  ".....k...........",
  "..kkkkkkkk.......",
  ".kuuiiiiiik......",
  ".kuiikkkkkk......",
  ".kiikCCCcCk......",
  ".kiikkkkkkk......",
  ".kttiiiiitk......",
  "..kkkkkkkk.......",
  "....kook.........",
  "..kkkkkkkk.......",
  ".kuuiiiiiik......",
  ".kuiiiiiiik......",
  ".kiiiiiliik......",
  ".kiiiiiiiik......",
  ".kttiiiittk......",
  "..kkkkkkkk.......",
  "...kok.kok.......",
  "...kik.kik.......",
  "...kik.kik.......",
  "..kkik.kikk......",
  "..kttkkkttk......",
  "..kkkkkkkkk......",
];

type Overlay = { readonly rows: readonly string[]; readonly x: number; readonly y: number };

const armHoldingPaperworkOut: Overlay = {
  x: 6,
  y: 10,
  rows: ["......kkkkk", ".kkkkkkccck", "koiiitkuuck", ".kkkkkkccck", "......kkkkk"],
};
const armHangingDown: Overlay = {
  x: 4,
  y: 11,
  rows: [".kk.", "kook", "kiik", "kiik", "kiik", "kttk", ".kk."],
};

function agentWith(arm: Overlay): Sprite {
  const box = agentBodyRows.map((row) => [...row]);
  arm.rows.forEach((row, rowNumber) => {
    [...row].forEach((letter, column) => {
      if (letter !== TRANSPARENT_LETTER) box[arm.y + rowNumber][arm.x + column] = letter;
    });
  });
  return spriteFromRows(
    box.map((row) => row.join("")),
    colours,
  );
}

export const doorAgentPictures = {
  holdingPaperworkOut: agentWith(armHoldingPaperworkOut),
  handsEmpty: agentWith(armHangingDown),
} as const;

/** The exclamation mark over the computer. Yellow: the red alert is kept for a blocked house. */
export const deskMark = spriteFromRows(
  [".kkkk.", "kclllk", "kllllk", "kllllk", "kllllk", ".kllk.", ".kllk.", "..kk..", ".kkkk.", ".kllk.", ".kllk.", ".kkkk."],
  colours,
);
