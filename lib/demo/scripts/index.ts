import type { DemoScript } from "../script";
import { approvalDeskScript } from "./approval-desk";
import { teamHouseScript } from "./team-house";

export { approvalDeskScript } from "./approval-desk";
export { TEAM_HOUSE_PROJECT, teamHouseScript } from "./team-house";

/** One entry per demo project. A new demo project is one more entry here. */
export const DEMO_SCRIPTS: readonly DemoScript[] = [approvalDeskScript, teamHouseScript];
