import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { houses } from "../../../config/houses";
import {
  VILLAGE_ASKS_EVERY_MS,
  VILLAGE_STATE_ROUTE,
  askForVillageState,
  projectsOf,
  villageStateAt,
  watchVillageState,
  type VillageState,
} from "../../../lib/village/state";
import { A_MOMENT_IN_THE_DEMO } from "../../demo/helpers";
import { keepTheNetworkOff } from "../../demo/network-off";

keepTheNetworkOff();

const state: VillageState = villageStateAt({ projects: projectsOf(houses), lines: [], now: A_MOMENT_IN_THE_DEMO });

type Answer = () => Promise<Response>;

const answers = {
  state: () => Promise.resolve(Response.json(state)),
  serverTrouble: () => Promise.resolve(Response.json({ problem: "The hub couldn't read its own record." }, { status: 500 })),
  nonsense: () => Promise.resolve(Response.json({ hello: "there" })),
  notJson: () => Promise.resolve(new Response("<html>")),
  nothing: () => Promise.reject(new Error("no hub there")),
} satisfies Record<string, Answer>;

/** A hub that gives its answers in the order listed, then keeps giving the last one. */
function hubThatAnswers(...inOrder: Answer[]) {
  const asked: string[] = [];
  const fetcher = (address: string): Promise<Response> => {
    asked.push(address);
    return inOrder[Math.min(asked.length, inOrder.length) - 1]();
  };
  return { fetcher, asked };
}

describe("asking the hub for the village's state", () => {
  it("asks the page's own hub, and hands back the state it answers with", async () => {
    const hub = hubThatAnswers(answers.state);
    expect(await askForVillageState(hub.fetcher)).toEqual(state);
    expect(hub.asked).toEqual([VILLAGE_STATE_ROUTE]);
    expect(VILLAGE_STATE_ROUTE.startsWith("/")).toBe(true);
  });

  it.each(["serverTrouble", "nonsense", "notJson", "nothing"] as const)(
    "H9: never throws: an answer of %s counts as unreachable",
    async (trouble) => {
      expect(await askForVillageState(hubThatAnswers(answers[trouble]).fetcher)).toBe("unreachable");
    },
  );
});

describe("watching the village's state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks at once, then again a while after each answer, until it is stopped", async () => {
    const hub = hubThatAnswers(answers.state);
    const news: unknown[] = [];
    const stop = watchVillageState((latest) => news.push(latest), { fetcher: hub.fetcher });

    await vi.advanceTimersByTimeAsync(0);
    expect(news).toEqual([state]);

    await vi.advanceTimersByTimeAsync(VILLAGE_ASKS_EVERY_MS - 1);
    expect(hub.asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(hub.asked).toHaveLength(2);
    expect(news).toEqual([state, state]);

    stop();
    await vi.advanceTimersByTimeAsync(VILLAGE_ASKS_EVERY_MS * 5);
    expect(hub.asked).toHaveLength(2);
  });

  it("H9: keeps asking after trouble, and hands on the news once the hub answers again", async () => {
    const hub = hubThatAnswers(answers.nothing, answers.serverTrouble, answers.state);
    const news: unknown[] = [];
    const stop = watchVillageState((latest) => news.push(latest), { fetcher: hub.fetcher, everyMs: 100 });

    await vi.advanceTimersByTimeAsync(250);
    stop();
    expect(news).toEqual(["unreachable", "unreachable", state]);
  });

  it("hands on nothing that arrives after it was stopped", async () => {
    const hub = hubThatAnswers(answers.state);
    const news: unknown[] = [];
    watchVillageState((latest) => news.push(latest), { fetcher: hub.fetcher })();

    await vi.advanceTimersByTimeAsync(VILLAGE_ASKS_EVERY_MS * 2);
    expect(news).toEqual([]);
    expect(hub.asked).toHaveLength(1);
  });
});
