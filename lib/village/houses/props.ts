import { spriteFromRows, type ColourKey, type Sprite } from "../engine";

// Things left outside a house that say what the project inside does. A new
// kind of prop is one more sprite here; the house list then names it.

const colours: ColourKey = {
  k: "ink",
  b: "bark",
  w: "wood",
  y: "clay",
  a: "sand",
  c: "cream",
  u: "cloud",
  i: "mist",
  t: "stone",
  l: "lamp",
  o: "sunset",
  E: "ember",
  L: "leaf",
  M: "moss",
};

export const propSprites = {
  // Open at the top, flaps folded out, a strip of tape down the front.
  "cardboard box": spriteFromRows(
    [
      "..kkk.........kkk..",
      ".kaaakkkkkkkkkaaak.",
      "kaayykbbbbbbbkyyaak",
      "kayykbbbbbbbbbkyyak",
      "kkkkkkkkkkkkkkkkkkk",
      ".kaaaaaaucaaaaaaak.",
      ".kayyyyyucyyyyyywk.",
      ".kayyyyyucyyyyyywk.",
      ".kayywwyyyyyyyyywk.",
      ".kayyyyyyyyykkyywk.",
      ".kayyyyyyyyyyyyywk.",
      ".kywwwwwwwwwwwwwwk.",
      ".kkkkkkkkkkkkkkkkk.",
    ],
    colours,
  ),
  // Lying in the grass: yellow handle, grey slider, the snap-off blade pushed right out.
  "box cutter": spriteFromRows(
    [
      ".kkkkkkkkkkkk......",
      "klllllkklllllkkkkk.",
      "kllllkttklllkuiuiuk",
      "kooooooooooookuiuk.",
      ".kkkkkkkkkkkkkkkk..",
    ],
    colours,
  ),
  // The kind with a round wooden handle, standing on its red rubber.
  "rubber stamp": spriteFromRows(
    [
      "...kkkkk...",
      "..kyaayyk..",
      "..kyayyyk..",
      "..kyyyywk..",
      "...kywwk...",
      "....kwk....",
      "....kwk....",
      "..kkkwkkk..",
      ".kyyywwwwk.",
      ".kywwwwwbk.",
      ".kkkkkkkkk.",
      ".kEEEEEEEk.",
      "..kkkkkkk..",
    ],
    colours,
  ),
  // A stack of paperwork, the top sheet ticked.
  "stamped papers": spriteFromRows(
    [
      "..kkkkkkkkkkkkkk.",
      ".kccccccccccLLck.",
      ".kcccccccccLLcck.",
      ".kcLLcccccLLccck.",
      ".kccLLcccLLcccck.",
      ".kcccLLcLLccccck.",
      ".kccccLLLcccccck.",
      ".kkkkkkkkkkkkkkk.",
      "kuiuiuiuiuiuiuik.",
      "kiuiuiuiuiuiuiuk.",
      "kuiuiuiuiuiuiuik.",
      "kkkkkkkkkkkkkkkk.",
    ],
    colours,
  ),
} satisfies Record<string, Sprite>;

export type PropName = keyof typeof propSprites;

export const propNames = Object.keys(propSprites) as PropName[];
