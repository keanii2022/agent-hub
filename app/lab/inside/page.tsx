import type { Metadata } from "next";
import { frameFromQuery, type PageQuery } from "../../../lib/village/plaza";
import { InsideLabScreen } from "./InsideLabScreen";
import { INVENTED_AGENTS_AT_MOST, inventedInside } from "./inventedInside";

export const metadata: Metadata = {
  title: "Inside of a house, lab",
};

type InsideLabPageProps = {
  searchParams: Promise<PageQuery>;
};

const AGENTS_WHEN_NOT_SAID = 10;

function agentCountFrom(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return AGENTS_WHEN_NOT_SAID;
  return Math.min(Number(value), INVENTED_AGENTS_AT_MOST);
}

// A throwaway page for looking at the inside of a house with any number of invented agents.
// /lab/inside               ten agents, running, as large as fits the window
// /lab/inside?agents=3      three agents (0 to 12)
// /lab/inside?scale=2       holds the scale at 2
// /lab/inside?time=4200     starts paused 4200 ms in, so a screenshot is always the same
export default async function InsideLabPage({ searchParams }: InsideLabPageProps) {
  const query = await searchParams;
  return <InsideLabScreen inside={inventedInside(agentCountFrom(query.agents))} {...frameFromQuery(query)} />;
}
