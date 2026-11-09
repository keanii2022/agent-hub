import dgram from "node:dgram";
import dns from "node:dns";
import net from "node:net";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";

export const NETWORK_IS_OFF = "The network is off in these tests.";

export type NetworkWatch = {
  /** Every try to reach the network since the last test started. */
  attempts: string[];
};

/**
 * H11: switches the network off for every test in the file, and fails any
 * test that tried to reach it anyway.
 */
export function keepTheNetworkOff(): NetworkWatch {
  const watch: NetworkWatch = { attempts: [] };
  const refuse = (what: string) => () => {
    watch.attempts.push(what);
    throw new Error(NETWORK_IS_OFF);
  };

  beforeAll(() => {
    // Everything that opens a connection in Node (http, https, fetch, raw
    // sockets) ends up in Socket.connect, so closing that one door closes them all.
    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(
      refuse("opened a connection") as never,
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(refuse("called fetch") as never);
    vi.spyOn(dns, "lookup").mockImplementation(refuse("looked up a name") as never);
    vi.spyOn(dgram.Socket.prototype, "send").mockImplementation(
      refuse("sent a datagram") as never,
    );
  });

  afterEach(() => {
    const attempts = watch.attempts.splice(0);
    expect(attempts, "this test tried to reach the network").toEqual([]);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  return watch;
}
