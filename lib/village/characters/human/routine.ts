export type HumanActivity =
  | "typing"
  | "reading the screen"
  | "sipping coffee"
  | "looking around"
  | "leaning back";

export type HumanHead = "at the screen" | "at the viewer" | "tipped back";
export type HumanEyes = "open" | "closed";
export type HumanArms =
  | "near hand on the keys"
  | "far hand on the keys"
  | "resting on the keys"
  | "reaching for the mug"
  | "mug at the mouth"
  | "behind his head";

/** Everything the human is doing at one moment, as plain data. Drawing reads this and nothing else. */
export type HumanState = {
  readonly activity: HumanActivity;
  readonly head: HumanHead;
  readonly eyes: HumanEyes;
  readonly arms: HumanArms;
  readonly holdingMug: boolean;
  /** Every key he has pressed since time zero. The computer shows its text from this. */
  readonly keysPressed: number;
};

export type RoutineStep = { readonly activity: HumanActivity; readonly lastsMs: number };

// He is always at his computer. Typing fills most of the round; the short
// breaks between are the idle moves, in an order that never changes.
export const humanRoutine: readonly RoutineStep[] = [
  { activity: "typing", lastsMs: 6000 },
  { activity: "reading the screen", lastsMs: 1400 },
  { activity: "typing", lastsMs: 4400 },
  { activity: "sipping coffee", lastsMs: 2400 },
  { activity: "typing", lastsMs: 3600 },
  { activity: "looking around", lastsMs: 1600 },
  { activity: "typing", lastsMs: 5000 },
  { activity: "leaning back", lastsMs: 1800 },
];

export const KEY_PRESS_MS = 140;
export const BLINK_EVERY_MS = 3300;
export const BLINK_LASTS_MS = 150;
// Shifts the blinks so the very first frame is not one.
const BLINK_HEAD_START_MS = 1000;

const MUG_PICK_UP_MS = 350;
const MUG_PUT_DOWN_MS = 350;
const LEAN_BACK_WIND_UP_MS = 250;

export const ROUTINE_ROUND_MS = humanRoutine.reduce((total, step) => total + step.lastsMs, 0);

function keyPressesIn(step: RoutineStep, msIntoStep: number = step.lastsMs): number {
  return step.activity === "typing" ? Math.floor(msIntoStep / KEY_PRESS_MS) : 0;
}

const KEY_PRESSES_PER_ROUND = humanRoutine.reduce((total, step) => total + keyPressesIn(step), 0);

type Pose = Pick<HumanState, "head" | "eyes" | "arms" | "holdingMug">;

function poseFor(step: RoutineStep, msIntoStep: number, blinking: boolean): Pose {
  const eyes: HumanEyes = blinking ? "closed" : "open";
  const msLeft = step.lastsMs - msIntoStep;

  switch (step.activity) {
    case "typing": {
      const nearHandDown = keyPressesIn(step, msIntoStep) % 2 === 0;
      return {
        head: "at the screen",
        eyes,
        arms: nearHandDown ? "near hand on the keys" : "far hand on the keys",
        holdingMug: false,
      };
    }
    case "reading the screen":
      return { head: "at the screen", eyes, arms: "resting on the keys", holdingMug: false };
    case "sipping coffee": {
      const mugIsUp = msIntoStep >= MUG_PICK_UP_MS && msLeft > MUG_PUT_DOWN_MS;
      return {
        head: "at the screen",
        eyes,
        arms: mugIsUp ? "mug at the mouth" : "reaching for the mug",
        holdingMug: mugIsUp,
      };
    }
    case "looking around":
      return { head: "at the viewer", eyes, arms: "resting on the keys", holdingMug: false };
    case "leaning back": {
      const armsAreUp = msIntoStep >= LEAN_BACK_WIND_UP_MS && msLeft > LEAN_BACK_WIND_UP_MS;
      return armsAreUp
        ? { head: "tipped back", eyes: "closed", arms: "behind his head", holdingMug: false }
        : { head: "at the screen", eyes, arms: "resting on the keys", holdingMug: false };
    }
  }
}

export function humanStateAt(timeMs: number): HumanState {
  const time = Math.max(0, timeMs);
  const roundsDone = Math.floor(time / ROUTINE_ROUND_MS);
  let msIntoStep = time % ROUTINE_ROUND_MS;
  let keysPressed = roundsDone * KEY_PRESSES_PER_ROUND;
  const blinking = (time + BLINK_HEAD_START_MS) % BLINK_EVERY_MS < BLINK_LASTS_MS;

  for (const step of humanRoutine) {
    if (msIntoStep < step.lastsMs) {
      return {
        activity: step.activity,
        ...poseFor(step, msIntoStep, blinking),
        keysPressed: keysPressed + keyPressesIn(step, msIntoStep),
      };
    }
    msIntoStep -= step.lastsMs;
    keysPressed += keyPressesIn(step);
  }
  throw new Error("The human's routine has no steps");
}
