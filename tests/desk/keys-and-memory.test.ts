import { describe, expect, it } from "vitest";
import {
  DESK_KEY,
  isInAField,
  leavesTheDesk,
  opensTheDesk,
  papersSeenAtTheDesk,
  rememberSeenAtTheDesk,
  type TabMemory,
} from "../../lib/desk";

describe("the key that opens the desk", () => {
  it("is D, in either case", () => {
    expect(DESK_KEY).toBe("D");
    expect(opensTheDesk({ key: "d" })).toBe(true);
    expect(opensTheDesk({ key: "D" })).toBe(true);
    expect(opensTheDesk({ key: "e" })).toBe(false);
  });

  it("leaves the browser's own shortcuts alone", () => {
    expect(opensTheDesk({ key: "d", metaKey: true })).toBe(false);
    expect(opensTheDesk({ key: "d", ctrlKey: true })).toBe(false);
    expect(opensTheDesk({ key: "d", altKey: true })).toBe(false);
  });

  it("does nothing while the key is held down, or when something else already took it", () => {
    expect(opensTheDesk({ key: "d", repeat: true })).toBe(false);
    expect(opensTheDesk({ key: "d", defaultPrevented: true })).toBe(false);
  });

  it("never fires while the owner is typing or picking in a field", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "textarea"]) {
      expect(opensTheDesk({ key: "d", target: { tagName } })).toBe(false);
    }
    expect(opensTheDesk({ key: "d", target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    expect(opensTheDesk({ key: "d", target: { tagName: "BUTTON" } })).toBe(true);
    expect(isInAField(null)).toBe(false);
  });

  it("Escape leaves the desk, by the same rules", () => {
    expect(leavesTheDesk({ key: "Escape" })).toBe(true);
    expect(leavesTheDesk({ key: "Escape", target: { tagName: "SELECT" } })).toBe(false);
    expect(leavesTheDesk({ key: "d" })).toBe(false);
  });
});

function memoryHolding(start: Record<string, string> = {}): TabMemory & { held: Record<string, string> } {
  const held = { ...start };
  return {
    held,
    getItem: (name) => held[name] ?? null,
    setItem: (name, value) => {
      held[name] = value;
    },
  };
}

describe("what the owner has seen at the desk", () => {
  it("is remembered and read back", () => {
    const memory = memoryHolding();
    expect(papersSeenAtTheDesk(memory)).toEqual([]);

    rememberSeenAtTheDesk(["garden/g1", "bakery/b1"], memory);
    expect(papersSeenAtTheDesk(memory)).toEqual(["garden/g1", "bakery/b1"]);
  });

  it("is exactly the latest list: what no longer waits is forgotten", () => {
    const memory = memoryHolding();
    rememberSeenAtTheDesk(["garden/g1", "bakery/b1"], memory);
    rememberSeenAtTheDesk(["bakery/b1"], memory);
    expect(papersSeenAtTheDesk(memory)).toEqual(["bakery/b1"]);
  });

  it("is empty when the memory holds something else, or there is no memory at all", () => {
    const [name] = Object.keys(
      (() => {
        const memory = memoryHolding();
        rememberSeenAtTheDesk([], memory);
        return memory.held;
      })(),
    );
    expect(papersSeenAtTheDesk(memoryHolding({ [name]: "not a list" }))).toEqual([]);
    expect(papersSeenAtTheDesk(memoryHolding({ [name]: '{"a":1}' }))).toEqual([]);
    expect(papersSeenAtTheDesk(memoryHolding({ [name]: '["kept",7,null]' }))).toEqual(["kept"]);
    expect(papersSeenAtTheDesk(null)).toEqual([]);
    expect(() => rememberSeenAtTheDesk(["a"], null)).not.toThrow();
  });

  it("a memory that refuses to be written or read never breaks the page", () => {
    const refusing: TabMemory = {
      getItem: () => {
        throw new Error("refused");
      },
      setItem: () => {
        throw new Error("refused");
      },
    };
    expect(() => rememberSeenAtTheDesk(["a"], refusing)).not.toThrow();
    expect(papersSeenAtTheDesk(refusing)).toEqual([]);
  });
});
