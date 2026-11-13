import { GLYPH_WIDTH, LETTER_GAP } from "../engine";

// Fitting a feed's own words into the small cards of a room. Nothing is
// reworded: text is only swapped letter for letter where the pixel font has no
// letter, broken into lines, and cut short with a mark when it runs out of room.

export const CUT_SHORT_MARK = "...";

// The pixel font has no letter for these; each has a plain spelling it does have.
const spelledWithFontLetters: Readonly<Record<string, string>> = {
  "€": "EUR ",
  "£": "GBP ",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

/** The same words with every letter the pixel font lacks spelled in letters it has, and runs of space made one. */
export function writable(text: string): string {
  return [...text]
    .map((letter) => spelledWithFontLetters[letter] ?? letter)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many letters fit side by side in `width` pixels. */
export function lettersThatFit(width: number): number {
  return Math.max(0, Math.floor((width + LETTER_GAP) / (GLYPH_WIDTH + LETTER_GAP)));
}

/** `text` on one line of at most `letters` letters; a longer text ends in the cut-short mark. */
export function cutToFit(text: string, letters: number): string {
  const all = [...text];
  if (all.length <= letters) return text;
  if (letters <= CUT_SHORT_MARK.length) return CUT_SHORT_MARK.slice(0, Math.max(0, letters));
  return all.slice(0, letters - CUT_SHORT_MARK.length).join("").trimEnd() + CUT_SHORT_MARK;
}

/**
 * `text` broken between words into lines of at most `lettersPerLine`, and at
 * most `linesAtMost` of them. A word longer than a line is broken across
 * lines. When the text needs more lines than there are, the last one ends in
 * the cut-short mark.
 */
export function wrapWords(text: string, lettersPerLine: number, linesAtMost: number): string[] {
  if (lettersPerLine < 1 || linesAtMost < 1) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter((part) => part !== "")) {
    let rest = [...word];
    while (rest.length > 0) {
      const room = lettersPerLine - (line === "" ? 0 : [...line].length + 1);
      if (rest.length <= room) {
        line = line === "" ? rest.join("") : `${line} ${rest.join("")}`;
        rest = [];
      } else if (line !== "") {
        lines.push(line);
        line = "";
      } else {
        lines.push(rest.slice(0, lettersPerLine).join(""));
        rest = rest.slice(lettersPerLine);
      }
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length <= linesAtMost) return lines;

  const kept = lines.slice(0, linesAtMost);
  const last = [...kept[linesAtMost - 1]];
  const roomForWords = Math.max(0, lettersPerLine - CUT_SHORT_MARK.length);
  kept[linesAtMost - 1] =
    last.slice(0, roomForWords).join("").trimEnd() + CUT_SHORT_MARK.slice(0, lettersPerLine);
  return kept;
}
