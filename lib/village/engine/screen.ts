export const SCREEN_WIDTH = 384;
export const SCREEN_HEIGHT = 216;

export function wholeScaleThatFits(
  availableWidth: number,
  availableHeight: number,
  screenWidth: number = SCREEN_WIDTH,
  screenHeight: number = SCREEN_HEIGHT,
): number {
  const scale = Math.floor(Math.min(availableWidth / screenWidth, availableHeight / screenHeight));
  return Number.isFinite(scale) && scale >= 1 ? scale : 1;
}
