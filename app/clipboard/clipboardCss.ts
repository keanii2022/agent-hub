import { palette } from "../../lib/village/engine/palette";

// What the build board adds to the desk's own CSS, which this page wears too.
export const clipboardCss = `
.board-rows { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 12px; }
.board-row {
  padding: 16px 18px;
  border: 1px solid ${palette.dusk};
  border-left: 4px solid ${palette.mauve};
  border-radius: 6px;
  background: ${palette.night};
}
.board-row-finished { border-left-color: ${palette.grass}; }
.board-row-trouble { border-left-color: ${palette.sunset}; }
.board-row-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 24px; }
.board-row h3 { margin: 0; font-size: 18px; line-height: 1.35; overflow-wrap: anywhere; }
.board-count { margin: 0; color: ${palette.cloud}; font-variant-numeric: tabular-nums; white-space: nowrap; }

.board-bar {
  display: flex;
  gap: 2px;
  height: 18px;
  margin: 12px 0 10px;
  padding: 3px;
  border: 2px solid ${palette.stone};
  background: ${palette.ink};
}
.board-step { flex: 1 1 0; min-width: 1px; background: ${palette.dusk}; }
.board-step-done { background: ${palette.grass}; }
.board-step-current { background: ${palette.lamp}; box-shadow: inset 0 0 0 2px ${palette.cream}; }

.board-now { margin: 0; color: ${palette.cloud}; overflow-wrap: anywhere; }
.board-row-trouble .board-now { margin-top: 8px; }
`;
