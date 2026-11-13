import {
  DESK_DECISIONS_ROUTE,
  DESK_SEEN_ROUTE,
  type DecisionOutcome,
  type DeskDecisionRequest,
  type DeskDecisions,
  type DeskSeenRequest,
  type SeenOutcome,
} from "./words";

// The desk page's side of the two writing routes, and of the read-only list
// of decisions. Nothing here ever throws: any trouble at all is "unreachable".

type Sender = (address: string, options: RequestInit) => Promise<Response>;

const ownFetch: Sender = (address, options) => fetch(address, options);

function saysHowItEnded(body: unknown): body is { outcome: string; words: string } {
  if (typeof body !== "object" || body === null) return false;
  const { outcome, words } = body as { outcome?: unknown; words?: unknown };
  return typeof outcome === "string" && typeof words === "string";
}

async function send<Outcome>(address: string, body: unknown, sender: Sender): Promise<Outcome | "unreachable"> {
  try {
    const response = await sender(address, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    // A refusal is an answer too: the hub says in plain words how it ended, whatever the status.
    const answer: unknown = await response.json();
    return saysHowItEnded(answer) ? (answer as Outcome) : "unreachable";
  } catch {
    return "unreachable";
  }
}

/** Sends the one answer a choice's button stands for. */
export function sendDeskDecision(
  request: DeskDecisionRequest,
  sender: Sender = ownFetch,
): Promise<DecisionOutcome | "unreachable"> {
  return send<DecisionOutcome>(DESK_DECISIONS_ROUTE, request, sender);
}

export function sendSeenAtTheDesk(
  request: DeskSeenRequest,
  sender: Sender = ownFetch,
): Promise<SeenOutcome | "unreachable"> {
  return send<SeenOutcome>(DESK_SEEN_ROUTE, request, sender);
}

function looksLikeDeskDecisions(body: unknown): body is DeskDecisions {
  if (typeof body !== "object" || body === null) return false;
  const { answers, canAnswer } = body as Partial<DeskDecisions>;
  return Array.isArray(answers) && Array.isArray(canAnswer);
}

export async function askForDeskDecisions(sender: Sender = ownFetch): Promise<DeskDecisions | "unreachable"> {
  try {
    const response = await sender(DESK_DECISIONS_ROUTE, { cache: "no-store" });
    if (!response.ok) return "unreachable";
    const body: unknown = await response.json();
    return looksLikeDeskDecisions(body) ? body : "unreachable";
  } catch {
    return "unreachable";
  }
}

/** How often the desk asks the hub which answers are on record. */
export const DESK_DECISIONS_ASKED_EVERY_MS = 4000;

export type DeskDecisionsWatch = {
  sender?: Sender;
  everyMs?: number;
};

/** Asks now, and again a while after each answer. Returns a function that stops it. */
export function watchDeskDecisions(
  onNews: (news: DeskDecisions | "unreachable") => void,
  { sender, everyMs = DESK_DECISIONS_ASKED_EVERY_MS }: DeskDecisionsWatch = {},
): () => void {
  let stopped = false;
  let nextAsk: ReturnType<typeof setTimeout> | undefined;

  async function ask(): Promise<void> {
    const news = await askForDeskDecisions(sender);
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
