export const palette = {
  ink: "#0d0b1a",
  night: "#1b1632",
  dusk: "#2d2350",
  plum: "#4b2e6e",
  mauve: "#7d4a8f",
  rose: "#c5608a",
  sunset: "#f0875a",
  peach: "#f8c27d",
  cream: "#fdf1d6",
  slate: "#353a57",
  stone: "#5a6182",
  mist: "#97a0bf",
  cloud: "#d3d8ea",
  teal: "#2f8f9d",
  pine: "#1c3a3a",
  moss: "#2c5c49",
  leaf: "#4c8b58",
  grass: "#8cc06c",
  bark: "#3b2730",
  wood: "#6c4436",
  clay: "#a56a4b",
  sand: "#cba57c",
  lamp: "#ffd166",
  ember: "#e2453c",
  pink: "#ff4fa8",
  cyan: "#3ddcf0",
  lime: "#b6f24a",
  violet: "#b26bff",
} as const;

export type ColourName = keyof typeof palette;

export type Rgb = readonly [red: number, green: number, blue: number];

export const colourNames = Object.keys(palette) as ColourName[];

function rgbFromHex(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function packed(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue;
}

const rgbByName = new Map<ColourName, Rgb>(
  colourNames.map((name) => [name, rgbFromHex(palette[name])]),
);

const nameByPackedRgb = new Map<number, ColourName>(
  colourNames.map((name) => [packed(...rgbOf(name)), name]),
);

export function rgbOf(colour: ColourName): Rgb {
  const rgb = rgbByName.get(colour);
  if (!rgb) throw new Error(`"${colour}" is not a palette colour`);
  return rgb;
}

export function colourNameOf(red: number, green: number, blue: number): ColourName | null {
  return nameByPackedRgb.get(packed(red, green, blue)) ?? null;
}
