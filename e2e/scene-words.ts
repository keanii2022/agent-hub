import type { Locator } from "@playwright/test";

/**
 * The plaza's summary of the scene, as a screen reader gets it: the picture's
 * description. The picture's own name only says where you are.
 */
export function sceneWords(canvas: Locator): Promise<string> {
  return canvas.evaluate((element) =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" "),
  );
}

/** Matches words that start with exactly these, whatever follows. */
export function startingWith(words: string): RegExp {
  return new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
}
