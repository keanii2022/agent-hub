import { TEAM_HOUSE_PROJECT } from "../lib/demo/scripts/team-house";
import type { HouseEntry } from "../lib/village/houses/list";

// Every house in the village, and so every project the hub knows.
//
// To add a house, add one entry to the list below. That is the whole job: it
// is placed, drawn, named and joined to the desk by a path from this entry.
//
//   project  the project's name, spelled as its neon sign should spell it
//            (13 letters fit on a line; a longer name needs a hyphen or a space)
//   lot      where it stands. Free lots: "far left of the upper street",
//            "far right of the upper street". One house per lot.
//   build    "brick office", "timber workshop" or "plaster cottage"
//   sign     "green tick marquee", "blue arrow" or "pink star"
//   props    up to four things left outside: "rubber stamp", "stamped papers",
//            "cardboard box", "box cutter". A new kind of prop needs a picture
//            first, in lib/village/houses/props.ts.
//   data     "demo" while its activity is scripted, "real" once it is the
//            project's own. A demo house always says DEMO.
//
// An empty house is { forSale: true, lot: "..." }. To move a project in,
// replace that entry with the project's own.
//
// The order of the list is the order the houses are visited in.
export const houses: readonly HouseEntry[] = [
  {
    project: "approval-desk",
    lot: "left of the upper street",
    build: "brick office",
    sign: "green tick marquee",
    props: ["rubber stamp", "stamped papers"],
    data: "demo",
  },
  {
    // The team house. Its name is kept in one place until the owner confirms it.
    project: TEAM_HOUSE_PROJECT,
    lot: "right of the upper street",
    build: "timber workshop",
    sign: "blue arrow",
    props: ["cardboard box", "box cutter"],
    data: "demo",
  },
  { forSale: true, lot: "left of the lower street" },
  { forSale: true, lot: "right of the lower street" },
];
