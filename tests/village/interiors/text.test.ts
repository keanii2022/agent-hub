import { describe, expect, it } from "vitest";
import { DEMO_SCRIPTS } from "../../../lib/demo/scripts";
import { hasGlyph, measureText } from "../../../lib/village/engine";
import { CUT_SHORT_MARK, cutToFit, lettersThatFit, wrapWords, writable } from "../../../lib/village/interiors";

const everythingTheDemoSays = DEMO_SCRIPTS.flatMap((script) => [
  script.project,
  ...script.agents.flatMap((agent) => [agent.name, agent.arrivesSaying, agent.leavesSaying]),
  ...script.requests.flatMap((request) => request.flatMap((line) => [line.step, line.what])),
]);

describe("writing a feed's words in the pixel font", () => {
  it("every word of the scripted days can be written: no letter comes out as a hollow box", () => {
    expect(everythingTheDemoSays.length).toBeGreaterThan(50);
    for (const words of everythingTheDemoSays) {
      const missing = [...writable(words)].filter((letter) => !hasGlyph(letter));
      expect(missing, words).toEqual([]);
    }
  });

  it("a letter the font lacks is spelled in letters it has, and nothing else changes", () => {
    expect(writable("Pilar's €410 refund")).toBe("Pilar's EUR 410 refund");
    expect(writable("“Done” – she said…")).toBe('"Done" - she said...');
    expect(writable("Adding up the morning's refunds")).toBe("Adding up the morning's refunds");
  });

  it("runs of space become one, so words never drift apart on a card", () => {
    expect(writable("  two   words\n here ")).toBe("two words here");
  });
});

describe("fitting words on a line", () => {
  it("counts the letters that fit in a width", () => {
    expect(lettersThatFit(measureText("refund-agent").width)).toBe(12);
    expect(lettersThatFit(measureText("refund-agent").width - 1)).toBe(11);
    expect(lettersThatFit(0)).toBe(0);
  });

  it("leaves a text that fits alone and ends a longer one in the cut-short mark", () => {
    expect(cutToFit("planner", 12)).toBe("planner");
    expect(cutToFit("refund-agent", 12)).toBe("refund-agent");
    expect(cutToFit("a-very-long-agent-name", 12)).toBe(`a-very-lo${CUT_SHORT_MARK}`);
    expect([...cutToFit("a-very-long-agent-name", 12)]).toHaveLength(12);
  });
});

describe("breaking words into lines", () => {
  it("breaks between words and never makes a line longer than asked", () => {
    const lines = wrapWords("Splitting the spring market poster into three parts", 19, 6);
    expect(lines).toEqual(["Splitting the", "spring market", "poster into three", "parts"]);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(19);
  });

  it("keeps every word, in order, when there is room for them all", () => {
    for (const words of everythingTheDemoSays.map(writable)) {
      expect(wrapWords(words, 12, 100).join(" ").replaceAll(" ", ""), words).toBe(words.replaceAll(" ", ""));
    }
  });

  it("ends the last line in the cut-short mark when the words need more lines than there are", () => {
    const lines = wrapWords("Reading the long letter about the missing garden gnome", 12, 3);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Reading the");
    expect(lines[2].endsWith(CUT_SHORT_MARK)).toBe(true);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(12);
  });

  it("does not mark a text that just fits", () => {
    expect(wrapWords("Sweeping up", 12, 1)).toEqual(["Sweeping up"]);
  });

  it("breaks a word longer than a line across lines", () => {
    expect(wrapWords("an extraordinarily long word", 8, 6)).toEqual(["an", "extraord", "inarily", "long", "word"]);
  });

  it("gives no lines when there is no room at all", () => {
    expect(wrapWords("anything", 0, 3)).toEqual([]);
    expect(wrapWords("anything", 12, 0)).toEqual([]);
    expect(wrapWords("", 12, 3)).toEqual([]);
  });
});
