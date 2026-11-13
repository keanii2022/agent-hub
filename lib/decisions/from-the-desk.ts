import { NOT_FROM_THE_DESK_WORDS, NOT_UNDERSTOOD_WORDS } from "./words";

// The hub's writing routes take one thing only: what a button on the hub's own
// desk sends. Anything else is turned away here, before it is looked at.

/** Far more than any desk button sends. */
export const LONGEST_DESK_REQUEST = 4096;

export type DeskRequestReading =
  | { ok: true; sent: unknown }
  | { ok: false; status: number; words: string };

/**
 * False for a request another website made a browser send. A browser always
 * says where such a request comes from; the desk's own page comes from the
 * hub itself.
 */
export function isFromTheHubItself(request: Pick<Request, "headers">): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function readDeskRequest(request: Request): Promise<DeskRequestReading> {
  if (!isFromTheHubItself(request)) return { ok: false, status: 403, words: NOT_FROM_THE_DESK_WORDS };

  const kind = request.headers.get("content-type") ?? "";
  if (kind.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { ok: false, status: 415, words: NOT_UNDERSTOOD_WORDS };
  }
  try {
    const text = await request.text();
    if (text.length > LONGEST_DESK_REQUEST) return { ok: false, status: 413, words: NOT_UNDERSTOOD_WORDS };
    return { ok: true, sent: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, words: NOT_UNDERSTOOD_WORDS };
  }
}
