import { describe, expect, it } from "vitest";
import { describeManagersRound, managerRoundFor } from "../../../lib/village/characters/manager";
import { deliveryAfter, describeDelivery, paperworkOnTheDesk } from "../../../lib/village/delivery";
import { describeHouses, villageHouses } from "../../../lib/village/houses";
import {
  PAUSED_NOTE,
  PAUSE_KEY,
  VILLAGE_SPEEDS,
  nextSpeed,
  pauseButtonWords,
  pausesTheVillage,
  speedButtonWords,
} from "../../../lib/village/plaza/controls";
import { announcementBetween, describeScene, type SceneNow } from "../../../lib/village/plaza/summary";
import { describeVillageNews } from "../../../lib/village/state";
import {
  APPROVAL_DESK,
  anOpenPageWithAnEmptyDesk,
  decisionNeeded,
  newsOf,
  playedTo,
  villageWith,
} from "../delivery/helpers";

const RULE_CODE = /\b[HQ]\d{1,2}\b/;

const asked = decisionNeeded("01:00", "ask-1");
const news = villageWith([asked], "01:01");
const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf([asked], "01:01", 1000));
const carried = playedTo(heard, 3 * managerRoundFor(villageHouses).lastsMs + 60_000).at(-1)!;

const onThePlaza: SceneNow = {
  timeMs: 4200,
  paused: false,
  speed: 1,
  news,
  delivery: heard,
  insideWords: null,
};

describe("the speed button", () => {
  it("steps through normal, 2 times and 4 times, then back to normal", () => {
    expect(VILLAGE_SPEEDS).toEqual([1, 2, 4]);
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(4);
    expect(nextSpeed(4)).toBe(1);
  });

  it("says the speed it is on in plain words", () => {
    expect(speedButtonWords(1)).toBe("Speed: normal");
    expect(speedButtonWords(2)).toBe("Speed: 2 times");
    expect(speedButtonWords(4)).toBe("Speed: 4 times");
  });
});

describe("the pause key and button", () => {
  it("says what pressing it will do", () => {
    expect(pauseButtonWords(false)).toBe("Pause");
    expect(pauseButtonWords(true)).toBe("Play");
  });

  it("is a plain press of P, in either case", () => {
    expect(PAUSE_KEY).toBe("P");
    expect(pausesTheVillage({ key: "p" })).toBe(true);
    expect(pausesTheVillage({ key: "P" })).toBe(true);
    expect(pausesTheVillage({ key: "o" })).toBe(false);
  });

  it("never fires while typing in a field, with a modifier held, on a repeat or after someone else took it", () => {
    expect(pausesTheVillage({ key: "p", target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(pausesTheVillage({ key: "p", target: { tagName: "input" } })).toBe(false);
    expect(pausesTheVillage({ key: "p", target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    expect(pausesTheVillage({ key: "p", ctrlKey: true })).toBe(false);
    expect(pausesTheVillage({ key: "p", metaKey: true })).toBe(false);
    expect(pausesTheVillage({ key: "p", altKey: true })).toBe(false);
    expect(pausesTheVillage({ key: "p", repeat: true })).toBe(false);
    expect(pausesTheVillage({ key: "p", defaultPrevented: true })).toBe(false);
  });

  it("says honestly that news is not lost while paused", () => {
    expect(PAUSED_NOTE).toMatch(/News still comes in/);
  });
});

describe("the scene in plain words", () => {
  it("comes from the state alone: the same scene always gives the same words", () => {
    expect(describeScene(onThePlaza)).toEqual(describeScene({ ...onThePlaza }));
  });

  it("tells who lives where, who is home and working, the manager's round and what he is doing now", () => {
    const words = describeScene(onThePlaza).sentences.join(" ");
    expect(words).toContain(describeHouses(villageHouses));
    expect(words).toContain(describeVillageNews(news));
    expect(words).toContain(`${APPROVAL_DESK}: 1 agent home`);
    expect(words).toContain(describeDelivery(heard));
    expect(words).toContain(describeManagersRound(villageHouses));
    expect(words).toMatch(/The manager is [^.]+\./);
  });

  it("tells what the human is doing right now", () => {
    expect(describeScene({ ...onThePlaza, timeMs: 0 }).sentences[0]).toBe(
      "The human sits at his desk in the middle, typing.",
    );
    expect(describeScene({ ...onThePlaza, timeMs: 6500 }).sentences[0]).toBe(
      "The human sits at his desk in the middle, reading the screen.",
    );
  });

  it("tells what is on the desk", () => {
    expect(paperworkOnTheDesk(carried)).toHaveLength(1);
    expect(describeScene({ ...onThePlaza, delivery: carried }).worthSaying.desk).toBe("1 paper is waiting on the desk.");
    expect(describeScene(onThePlaza).worthSaying.desk).toBe("Nothing is waiting on the desk.");
  });

  it("tells whether the village is paused, and how fast it runs", () => {
    expect(describeScene(onThePlaza).sentences.at(-1)).toBe("The village runs at normal speed.");
    expect(describeScene({ ...onThePlaza, speed: 4 }).sentences.at(-1)).toBe(
      "The village runs at 4 times the normal speed.",
    );
    expect(describeScene({ ...onThePlaza, paused: true }).sentences.at(-1)).toBe(
      "The village is paused. News still comes in, and the manager carries it once you press play.",
    );
  });

  it("inside a house, tells the room and leaves the plaza out", () => {
    const inside = "Inside the Approval Desk house (demo). One agent lives here, with a bed of its own.";
    const summary = describeScene({ ...onThePlaza, insideWords: inside });
    expect(summary.sentences).toEqual([inside, "The village runs at normal speed."]);
    expect(summary.worthSaying.place).toBe("Inside the Approval Desk house (demo)");
  });

  it("says nothing before the first news, rather than a blank sentence", () => {
    expect(describeScene({ ...onThePlaza, news: "loading" }).sentences).not.toContain("");
  });

  it("H12: holds no rule codes and no line ids", () => {
    for (const scene of [onThePlaza, { ...onThePlaza, delivery: carried, paused: true }]) {
      const words = describeScene(scene).sentences.join(" ");
      expect(words).not.toMatch(RULE_CODE);
      expect(words).not.toContain("ask-1");
    }
  });
});

describe("what is said out loud", () => {
  const before = describeScene(onThePlaza);

  it("is nothing on the first frame, and nothing when only the walking about changed", () => {
    expect(announcementBetween(null, before)).toBe("");
    const later = describeScene({ ...onThePlaza, timeMs: 6500, delivery: playedTo(heard, 6000).at(-1)! });
    expect(later.sentences).not.toEqual(before.sentences);
    expect(announcementBetween(before, later)).toBe("");
  });

  it("is the change alone when the village is paused, or its speed changes", () => {
    expect(announcementBetween(before, describeScene({ ...onThePlaza, paused: true }))).toBe(
      "The village is paused. News still comes in, and the manager carries it once you press play.",
    );
    expect(announcementBetween(before, describeScene({ ...onThePlaza, speed: 2 }))).toBe(
      "The village runs at 2 times the normal speed.",
    );
  });

  it("is the new count when paperwork lands on the desk", () => {
    expect(announcementBetween(before, describeScene({ ...onThePlaza, delivery: carried }))).toBe(
      "1 paper is waiting on the desk.",
    );
  });

  it("is the houses' news when it changes", () => {
    const quiet = describeScene({ ...onThePlaza, news: villageWith([], "01:01") });
    expect(announcementBetween(quiet, before)).toBe(describeVillageNews(news));
  });
});
