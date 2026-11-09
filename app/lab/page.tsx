import type { Metadata } from "next";
import { LabScreen } from "./LabScreen";

export const metadata: Metadata = {
  title: "Pixel engine lab",
};

type LabPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function wholeNumberFrom(value: string | string[] | undefined, smallest: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number >= smallest ? number : null;
}

// A throwaway page for trying the pixel engine.
// /lab               runs freely and fits the window
// /lab?scale=3       holds the scale at 3
// /lab?time=4200     starts paused 4200 ms in, so a screenshot is always the same
export default async function LabPage({ searchParams }: LabPageProps) {
  const { time, scale } = await searchParams;
  return <LabScreen fixedTimeMs={wholeNumberFrom(time, 0)} pixelScale={wholeNumberFrom(scale, 1)} />;
}
