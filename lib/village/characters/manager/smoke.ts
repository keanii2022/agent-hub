import { managerOnLeg, type RoundLeg, type SmokePuff } from "./round";
import { MANAGER_WIDTH, managerPoints } from "./sprites";

// He smokes while he carries paperwork. Each puff is born at the end of his
// cigarette and rises from where he was then, so a walking manager leaves a
// thin trail behind him. Like everything else about him it comes from the leg
// and the time into it, never from a count kept between frames.

const PUFFS = 4;
const PUFF_LIFE_MS = 2000;
const PUFF_RISE_MS = 200;
const PUFF_IS_FRESH_BELOW_ROWS = 3;
const PUFF_THINS_ABOVE_ROWS = 7;
const puffDrift = [0, 0, 1, 1, 0, -1, -1, 0, 0, 1] as const;

function cigaretteTipAt(leg: RoundLeg, msIntoLeg: number): { x: number; y: number } {
  const { at, facing } = managerOnLeg(leg, msIntoLeg);
  const tip = managerPoints.cigaretteTip[facing === "up" || facing === "down" ? facing : "side"];
  const acrossBox = facing === "left" ? MANAGER_WIDTH - 1 - tip.x : tip.x;
  return {
    x: Math.round(at.x) - managerPoints.feet.x + acrossBox,
    y: Math.round(at.y) - managerPoints.feet.y + tip.y,
  };
}

/** The puffs in the air `msIntoLeg` after he started a leg with a lit cigarette. A fresh leg starts with clear air. */
export function managerSmokeOn(leg: RoundLeg, msIntoLeg: number): SmokePuff[] {
  const puffs: SmokePuff[] = [];
  for (let puff = 0; puff < PUFFS; puff += 1) {
    const age = (msIntoLeg + (puff * PUFF_LIFE_MS) / PUFFS) % PUFF_LIFE_MS;
    const bornAtMs = msIntoLeg - age;
    if (bornAtMs < 0) continue;
    const tip = cigaretteTipAt(leg, bornAtMs);
    const risen = Math.floor(age / PUFF_RISE_MS);
    puffs.push({
      at: { x: tip.x + puffDrift[risen % puffDrift.length], y: tip.y - 1 - risen },
      age: risen < PUFF_IS_FRESH_BELOW_ROWS ? "fresh" : risen < PUFF_THINS_ABOVE_ROWS ? "rising" : "thin",
    });
  }
  return puffs;
}
