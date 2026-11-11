import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import { TEAM_HOUSE_PROJECT } from "../../../lib/demo/scripts/team-house";
import {
  buildNames,
  isForSale,
  placeHouses,
  propNames,
  signStyleNames,
  villageHouses,
  type ProjectHouse,
} from "../../../lib/village/houses";
import { plazaLayout } from "../../../lib/village/plaza";

const LIST_FILE = "config/houses.ts";
const HOUSES_FOLDER = "lib/village/houses";
const housesCode = readdirSync(HOUSES_FOLDER).map((file) => join(HOUSES_FOLDER, file));

const projectHouses = houses.filter((entry): entry is ProjectHouse => !isForSale(entry));

describe("the house list", () => {
  it("holds the approval-desk house, the team house and two houses for sale", () => {
    expect(projectHouses.map((entry) => entry.project)).toEqual(["approval-desk", TEAM_HOUSE_PROJECT]);
    expect(houses.filter(isForSale)).toHaveLength(2);
    expect(houses).toHaveLength(4);
  });

  it("can be built as it stands, and is what the village shows", () => {
    expect(() => placeHouses(houses)).not.toThrow();
    expect(villageHouses).toEqual(placeHouses(houses));
  });

  it("gives every house a lot of its own from the plaza", () => {
    const lots = houses.map((entry) => entry.lot);
    expect(new Set(lots).size).toBe(lots.length);
    for (const lot of lots) expect(plazaLayout.houseLots.map((candidate) => candidate.name)).toContain(lot);
  });

  it("gives the two projects different builds, signs and props, so no two houses look alike", () => {
    const [first, second] = projectHouses;
    expect(first.build).not.toBe(second.build);
    expect(first.sign).not.toBe(second.sign);
    expect(first.props.filter((prop) => second.props.includes(prop))).toEqual([]);
  });

  it("leaves a box and a box cutter outside the team house", () => {
    const teamHouse = projectHouses.find((entry) => entry.project === TEAM_HOUSE_PROJECT);
    expect(teamHouse?.props).toEqual(["cardboard box", "box cutter"]);
  });

  it("H10: marks both projects as running on demo data", () => {
    for (const entry of projectHouses) expect(entry.data, entry.project).toBe("demo");
  });

  it("names every build, sign and prop the village can draw in its how-to note", () => {
    const note = readFileSync(LIST_FILE, "utf8");
    for (const name of [...buildNames, ...signStyleNames, ...propNames]) {
      expect(note, name).toContain(`"${name}"`);
    }
    const takenLots = new Set(houses.map((entry) => entry.lot));
    for (const lot of plazaLayout.houseLots.filter((candidate) => !takenLots.has(candidate.name))) {
      expect(note, lot.name).toContain(`"${lot.name}"`);
    }
  });

  it("never retypes the team house's name: it is written once, in the demo script", () => {
    for (const file of [LIST_FILE, ...housesCode]) {
      expect(readFileSync(file, "utf8").toLowerCase(), file).not.toContain(TEAM_HOUSE_PROJECT.toLowerCase());
    }
  });

  it("keeps the database out of the browser: house code never loads the demo player or anything of Node's", () => {
    for (const file of [LIST_FILE, ...housesCode]) {
      const imports = [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      for (const imported of imports) {
        expect(imported, file).not.toMatch(/^node:/);
        expect(imported, file).not.toMatch(/(\/demo|\/store|\/feed)(\/index)?$/);
      }
    }
  });
});
