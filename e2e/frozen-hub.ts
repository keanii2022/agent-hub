import { expect, type Locator } from "@playwright/test";

/**
 * The one moment the hub is frozen at for every browser test. Half past seven
 * minutes into both scripted days: approval-desk's agent is adding up the
 * morning's refunds with two requests waiting (one urgent), and the team house
 * has all three agents in, two working and one waiting for an answer.
 */
export const FROZEN_HUB_MOMENT = "2026-10-05T14:07:30Z";

/**
 * Waits until the picture shows the frozen hub's news. Fails in plain words
 * when the hub is running live, which happens when a hub was already up on
 * this port before the tests started.
 */
export async function expectTheFrozenVillage(canvas: Locator): Promise<void> {
  await expect(
    canvas,
    "The village is not showing the frozen moment. Stop any hub already running on this port, so the tests can start their own frozen one.",
  ).toHaveAttribute("data-village-as-of", FROZEN_HUB_MOMENT);
}
