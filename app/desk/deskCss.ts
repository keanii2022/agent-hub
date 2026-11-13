import { palette } from "../../lib/village/engine/palette";

// Plain CSS for the desk, in the village's own dusk colours. It is kept as
// text and put on the page by the desk itself, so it comes and goes with the
// desk and never restyles the plaza.
export const deskCss = `
html:has(.desk) { background: ${palette.ink}; }
html:has(.desk) body { margin: 0; background: ${palette.ink}; }

.desk {
  box-sizing: border-box;
  min-height: 100vh;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 64px;
  color: ${palette.cream};
  font-family: system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}
.desk *, .desk *::before, .desk *::after { box-sizing: border-box; }

.desk a { color: ${palette.lamp}; text-underline-offset: 3px; }
.desk a:hover { color: ${palette.peach}; }
.desk :focus-visible { outline: 2px solid ${palette.lamp}; outline-offset: 3px; border-radius: 2px; }
/* The heading takes focus on arrival so reading starts at the top; it is not a control, so it wears no ring. */
.desk h1:focus { outline: none; }

.desk-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; }
.desk-top p { margin: 0; color: ${palette.mist}; font-size: 14px; }
.desk h1 { margin: 20px 0 4px; font-size: 32px; line-height: 1.2; }
.desk-lead { margin: 0; color: ${palette.cloud}; }
.desk kbd, .desk-tag {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.06em;
}
.desk kbd {
  padding: 1px 6px;
  border: 1px solid ${palette.stone};
  border-bottom-width: 2px;
  border-radius: 3px;
  color: ${palette.cream};
  background: ${palette.night};
}

.desk section { margin-top: 40px; }
.desk h2 {
  margin: 0 0 4px;
  padding-bottom: 8px;
  border-bottom: 2px solid ${palette.plum};
  font-size: 22px;
  color: ${palette.peach};
}
.desk-count { color: ${palette.mist}; font-weight: 400; }
.desk-hint { margin: 8px 0 16px; color: ${palette.mist}; font-size: 14px; }

.desk-note {
  margin: 12px 0;
  padding: 10px 14px;
  border-left: 4px solid ${palette.mauve};
  background: ${palette.night};
  color: ${palette.cloud};
}
.desk-note-trouble { border-left-color: ${palette.sunset}; }
.desk-empty {
  margin: 16px 0;
  padding: 24px 16px;
  border: 1px dashed ${palette.stone};
  border-radius: 6px;
  color: ${palette.cloud};
  text-align: center;
}

.desk-items { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.desk-item {
  padding: 16px 18px;
  border: 1px solid ${palette.dusk};
  border-left: 4px solid ${palette.mauve};
  border-radius: 6px;
  background: ${palette.night};
}
.desk-item-urgent { border-left-color: ${palette.sunset}; }
.desk-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.desk-tag {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid ${palette.stone};
  border-radius: 3px;
  color: ${palette.cloud};
  white-space: nowrap;
}
.desk-tag-urgent { border-color: ${palette.sunset}; background: ${palette.sunset}; color: ${palette.ink}; font-weight: 700; }
.desk-tag-decision { border-color: ${palette.lamp}; color: ${palette.lamp}; }
.desk-tag-result { border-color: ${palette.cyan}; color: ${palette.cyan}; }
.desk-tag-demo { border-style: dashed; }
.desk-item h3 { margin: 0 0 10px; font-size: 18px; line-height: 1.35; }
.desk-facts { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 0; }
.desk-facts div { display: flex; gap: 8px; }
.desk-facts dt { color: ${palette.mist}; }
.desk-facts dd { margin: 0; }
.desk-reference { margin: 10px 0 0; color: ${palette.mist}; font-size: 13px; }
.desk-item-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid ${palette.dusk}; }

.desk-item-actions:empty { display: none; }
.desk-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.desk-button {
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid ${palette.stone};
  border-radius: 4px;
  background: ${palette.night};
  color: ${palette.cream};
  font: inherit;
  cursor: pointer;
}
.desk-button:hover { border-color: ${palette.lamp}; }
.desk-button-main { border-color: ${palette.lamp}; color: ${palette.lamp}; font-weight: 600; }
.desk-button[aria-disabled="true"] { opacity: 0.55; cursor: progress; }
.desk-answered { margin: 0; color: ${palette.cloud}; }
.desk-note-form { display: grid; gap: 8px; width: 100%; }
.desk-note-form label { color: ${palette.mist}; font-size: 14px; }
.desk-note-form textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid ${palette.stone};
  border-radius: 4px;
  background: ${palette.ink};
  color: ${palette.cream};
  font: inherit;
  resize: vertical;
}
.desk-note-form textarea[aria-invalid="true"] { border-color: ${palette.sunset}; }
.desk-note-problem { margin: 0; color: ${palette.peach}; font-size: 14px; }
.desk-said { margin: 12px 0; padding: 10px 14px; border-left: 4px solid ${palette.lamp}; background: ${palette.night}; }
/* Kept on the page while empty: a hidden one would not be read out when its first words arrive. */
.desk-said:empty { margin: 0; padding: 0; border: 0; }
.desk-said:focus { outline: none; }

.desk-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px 20px; margin: 16px 0 8px; }
.desk-filters label { display: grid; gap: 4px; color: ${palette.mist}; font-size: 14px; }
.desk-filters select, .desk-filters button {
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid ${palette.stone};
  border-radius: 4px;
  background: ${palette.night};
  color: ${palette.cream};
  font: inherit;
}
.desk-filters select { min-width: 180px; }
.desk-filters button { cursor: pointer; }
.desk-filters button:hover { border-color: ${palette.lamp}; }

.desk-log-scroll { overflow-x: auto; }
.desk-log { width: 100%; border-collapse: collapse; font-size: 15px; }
.desk-log th {
  padding: 8px 10px;
  border-bottom: 1px solid ${palette.stone};
  color: ${palette.mist};
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}
.desk-log td { padding: 8px 10px; border-bottom: 1px solid ${palette.dusk}; vertical-align: top; }
.desk-log tbody tr:hover { background: ${palette.night}; }
.desk-log time, .desk-log-who { white-space: nowrap; }
.desk-log .desk-tag { margin-left: 8px; }
.desk-log .desk-reference { display: block; margin: 2px 0 0; }

.desk-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
