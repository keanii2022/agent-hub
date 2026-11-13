// A decision changes the hub's record for good, and every other browser test
// reads one shared frozen hub: its plaza is compared with screenshots and the
// papers on its desk are counted. So the decision tests get a hub of their
// own, on its own port, with its own record. Nothing they do can be seen from
// the shared hub, in any order, and each run starts from an empty record.

/** The one file that runs against the decisions hub. Its tests run one after another, in one worker. */
export const DECISION_TESTS = /decisions\.spec\.ts$/;

/**
 * Twelve and a half minutes into both scripted days, when the most requests
 * are open at once: three at approval-desk (€410 urgent, €95 and €275) and
 * two at the team house (the poster and the urgent honey price).
 */
export const DECISIONS_HUB_MOMENT = "2026-10-05T14:12:30Z";

export const DEFAULT_HUB_PORT = "4040";

/** Next to the shared hub's port, far enough away that two checkouts side by side never meet. */
export function decisionsHubPort(hubPort: string = process.env.HUB_PORT ?? DEFAULT_HUB_PORT): string {
  return String(Number(hubPort) + 1000);
}

export function decisionsHubUrl(): string {
  return `http://localhost:${decisionsHubPort()}`;
}

/** Inside the shared hub's own build folder, so it is ignored the same way. */
export const DECISIONS_HUB_BUILD_FOLDER = ".next/decisions-hub";

/** The folder the decisions hub keeps its record in. Emptied before every run. */
export function decisionsHubRecordFolder(): string {
  return `data/e2e/decisions-hub-${decisionsHubPort()}`;
}

/**
 * A file, not memory: one test has to hold the record from outside the hub, the
 * way another writer would, to see what the hub does when it can't write.
 */
export function decisionsHubRecord(): string {
  return `${decisionsHubRecordFolder()}/hub.sqlite`;
}
