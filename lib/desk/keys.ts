export const DESK_ROUTE = "/desk";
export const PLAZA_ROUTE = "/";

/** The one key that opens the desk from the plaza. */
export const DESK_KEY = "D";
/** The one key that leaves the desk for the plaza. */
export const LEAVE_DESK_KEY = "Escape";

export type KeyPress = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
};

const FIELDS_THAT_TAKE_KEYS = ["INPUT", "TEXTAREA", "SELECT"];

/** True when the key was pressed in something the owner types or picks in: that key belongs to the field. */
export function isInAField(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const { tagName, isContentEditable } = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    isContentEditable === true ||
    (typeof tagName === "string" && FIELDS_THAT_TAKE_KEYS.includes(tagName.toUpperCase()))
  );
}

function isAPlainPressOf(key: string, press: KeyPress): boolean {
  return (
    press.key.toLowerCase() === key.toLowerCase() &&
    !press.ctrlKey &&
    !press.metaKey &&
    !press.altKey &&
    !press.repeat &&
    !press.defaultPrevented &&
    !isInAField(press.target)
  );
}

export function opensTheDesk(press: KeyPress): boolean {
  return isAPlainPressOf(DESK_KEY, press);
}

export function leavesTheDesk(press: KeyPress): boolean {
  return isAPlainPressOf(LEAVE_DESK_KEY, press);
}
