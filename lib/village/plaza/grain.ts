// Texture without luck: the same pixel always gets the same number, on every
// machine, so the ground never changes between two screenshots.

/** A number from 0 up to (not including) 1 for one pixel. `salt` gives a different pattern. */
export function grain(x: number, y: number, salt: number = 0): number {
  let mixed = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 1103515245);
  mixed ^= mixed >>> 16;
  return (mixed >>> 0) / 4294967296;
}

function eased(part: number): number {
  return part * part * (3 - 2 * part);
}

/** Like `grain`, but changing slowly from place to place, for patches instead of specks. */
export function softGrain(x: number, y: number, patchWidth: number, patchHeight: number, salt: number = 0): number {
  const across = x / patchWidth;
  const down = y / patchHeight;
  const left = Math.floor(across);
  const top = Math.floor(down);
  const partAcross = eased(across - left);
  const partDown = eased(down - top);
  const upper = grain(left, top, salt) * (1 - partAcross) + grain(left + 1, top, salt) * partAcross;
  const lower =
    grain(left, top + 1, salt) * (1 - partAcross) + grain(left + 1, top + 1, salt) * partAcross;
  return upper * (1 - partDown) + lower * partDown;
}
