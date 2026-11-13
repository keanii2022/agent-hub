import { frameFromQuery, type PageQuery } from "../lib/village/plaza";
import { PlazaWithDesk } from "../lib/desk/PlazaWithDesk";

type HubPageProps = {
  searchParams: Promise<PageQuery>;
};

// /             the plaza, running, as large as fits the window; the computer opens /desk
// /?scale=2     holds the scale at 2
// /?time=4200   starts paused 4200 ms in, so a screenshot is always the same
export default async function HubPage({ searchParams }: HubPageProps) {
  return <PlazaWithDesk {...frameFromQuery(await searchParams)} />;
}
