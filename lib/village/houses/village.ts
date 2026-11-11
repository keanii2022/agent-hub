import { houses as houseList } from "../../../config/houses";
import { placeHouses, type PlacedHouse } from "./place";

/** The houses of `config/houses.ts`, standing in the plaza, in list order. */
export const villageHouses: readonly PlacedHouse[] = placeHouses(houseList);

/** One plain sentence about the houses, for whoever cannot see the picture. */
export function describeHouses(houses: readonly PlacedHouse[] = villageHouses): string {
  // A demo house says so in words too, for whoever cannot see its tag.
  const projects = houses.flatMap((house) =>
    house.project === null ? [] : [house.data === "demo" ? `${house.project} (demo)` : house.project],
  );
  const forSale = houses.length - projects.length;
  const parts: string[] = [];
  if (projects.length > 0) {
    const named =
      projects.length === 1
        ? projects[0]
        : `${projects.slice(0, -1).join(", ")} and ${projects[projects.length - 1]}`;
    parts.push(`${projects.length === 1 ? "the house" : "the houses"} of ${named}`);
  }
  if (forSale > 0) parts.push(forSale === 1 ? "one house for sale" : `${forSale} houses for sale`);
  if (parts.length === 0) return "No houses stand around the plaza yet.";
  return `Around the plaza ${houses.length === 1 ? "stands" : "stand"} ${parts.join(", and ")}.`;
}
