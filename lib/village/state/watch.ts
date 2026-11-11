import type { VillageNews } from "./house-status";
import type { VillageState } from "./village-state";

export const VILLAGE_STATE_ROUTE = "/api/village";

/** How often the page asks the hub what the village is doing. */
export const VILLAGE_ASKS_EVERY_MS = 2000;

export type VillageProblem = {
  problem: string;
};

type Fetcher = (address: string, options: { cache: "no-store" }) => Promise<Response>;

function looksLikeVillageState(body: unknown): body is VillageState {
  if (typeof body !== "object" || body === null) return false;
  const { asOf, projects } = body as Partial<VillageState>;
  return typeof asOf === "string" && Array.isArray(projects);
}

/** Asks the page's own hub once. Never throws: any trouble at all is "unreachable". */
export async function askForVillageState(
  fetcher: Fetcher = (address, options) => fetch(address, options),
): Promise<VillageState | "unreachable"> {
  try {
    const response = await fetcher(VILLAGE_STATE_ROUTE, { cache: "no-store" });
    if (!response.ok) return "unreachable";
    const body: unknown = await response.json();
    return looksLikeVillageState(body) ? body : "unreachable";
  } catch {
    return "unreachable";
  }
}

export type VillageWatch = {
  fetcher?: Fetcher;
  everyMs?: number;
};

/**
 * Asks now, and again a while after each answer, handing every answer to
 * `onNews`. Returns a function that stops it.
 */
export function watchVillageState(
  onNews: (news: Exclude<VillageNews, "loading">) => void,
  { fetcher, everyMs = VILLAGE_ASKS_EVERY_MS }: VillageWatch = {},
): () => void {
  let stopped = false;
  let nextAsk: ReturnType<typeof setTimeout> | undefined;

  async function ask(): Promise<void> {
    const news = await askForVillageState(fetcher);
    if (stopped) return;
    onNews(news);
    nextAsk = setTimeout(ask, everyMs);
  }
  void ask();

  return () => {
    stopped = true;
    clearTimeout(nextAsk);
  };
}
