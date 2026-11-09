import { expect, test } from "@playwright/test";
import {
  MOST_EVENTS_AT_ONCE,
  RECENT_EVENTS_ROUTE,
  type RecentEvents,
} from "../lib/demo/recent-events";
import { DEMO_SCRIPTS } from "../lib/demo/scripts";

test("starting the hub loads the demo: every demo project already has events", async ({
  request,
}) => {
  const response = await request.get(`${RECENT_EVENTS_ROUTE}?limit=${MOST_EVENTS_AT_ONCE}`);
  expect(response.status()).toBe(200);

  const { asOf, events }: RecentEvents = await response.json();
  expect(Date.parse(asOf)).not.toBeNaN();
  expect(new Set(events.map((event) => event.line.project))).toEqual(
    new Set(DEMO_SCRIPTS.map((script) => script.project)),
  );
});

test("H10: every event the hub lists is marked demo", async ({ request }) => {
  const response = await request.get(RECENT_EVENTS_ROUTE);
  const { events }: RecentEvents = await response.json();

  expect(events.length).toBeGreaterThan(0);
  for (const event of events) expect(event.line.demo).toBe(true);
});

test("asking twice never stores an event twice", async ({ request }) => {
  await request.get(RECENT_EVENTS_ROUTE);
  const response = await request.get(`${RECENT_EVENTS_ROUTE}?limit=${MOST_EVENTS_AT_ONCE}`);
  const { events }: RecentEvents = await response.json();

  const names = events.map((event) => `${event.line.project} ${event.line.id}`);
  expect(new Set(names).size).toBe(names.length);
});

test("the list of events is read-only", async ({ request }) => {
  for (const send of [request.post, request.put, request.patch, request.delete]) {
    const response = await send.call(request, RECENT_EVENTS_ROUTE, { data: {} });
    expect(response.status()).toBe(405);
  }
});
