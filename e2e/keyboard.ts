import { expect, type Page } from "@playwright/test";

/** One place the keyboard stopped at, in the order it got there. */
export type KeyboardStop = { name: string; tag: string; workedBy: "Enter" | "its own keys" };

const MOST_STOPS = 200;

type Walk = {
  findClickables(): Element[];
  reached: Element[];
  clicked: Element[];
};

/**
 * Finds every clickable thing on the page, then proves the keyboard alone
 * gets to each one with Tab, in page order, that each has a name and a
 * visible focus mark, and that Enter works it. A control only a mouse can use
 * fails here, whatever it is made of: a mouse-only one is found by its
 * pointer cursor.
 *
 * Pressing Enter is caught before the page acts on it, so nothing is sent and
 * no page is left: the test only proves the press arrives as a click.
 */
export async function expectEveryClickableWorkedByKeyboard(page: Page): Promise<KeyboardStop[]> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => {
    const byRole =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], ' +
      '[role="checkbox"], [role="tab"], [role="menuitem"], [role="switch"], [tabindex]:not([tabindex="-1"]), [onclick]';
    const isShown = (element: Element): boolean =>
      element.checkVisibility({ visibilityProperty: true }) &&
      element.getBoundingClientRect().width > 0 &&
      element.getBoundingClientRect().height > 0;
    const findClickables = (): Element[] => {
      const found = new Set<Element>(Array.from(document.querySelectorAll(byRole)).filter(isShown));
      // A pointer cursor says "click me". The cursor is passed down to what is inside, so only where it is first set counts.
      for (const element of Array.from(document.body.querySelectorAll("*"))) {
        if (!isShown(element) || getComputedStyle(element).cursor !== "pointer") continue;
        const parent = element.parentElement;
        if (parent && getComputedStyle(parent).cursor === "pointer") continue;
        if (parent?.closest(byRole)) continue;
        found.add(element);
      }
      return [...found];
    };
    const walk: Walk = { findClickables, reached: [], clicked: [] };
    (window as unknown as { keyboardWalk: Walk }).keyboardWalk = walk;

    // Every click from here on is noted and stopped before the page sees it.
    window.addEventListener(
      "click",
      (event) => {
        walk.clicked.push(event.target as Element);
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true },
    );
    // Start from the very top of the page, whatever has the focus now.
    const start = document.createElement("span");
    start.tabIndex = -1;
    start.id = "keyboard-walk-start";
    document.body.prepend(start);
    start.focus();
  });
  // A focus mark painted in a picture goes on the next frame, and so does the one just taken away.
  await page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const picturesBefore = await canvasPictures(page);
  const stops: KeyboardStop[] = [];

  for (let pressed = 0; pressed < MOST_STOPS; pressed += 1) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body || element.id === "keyboard-walk-start") return null;
      const walk = (window as unknown as { keyboardWalk: Walk }).keyboardWalk;
      if (walk.reached.includes(element)) return null;
      walk.reached.push(element);
      const style = getComputedStyle(element);
      return {
        isClickable: walk.findClickables().some((clickable) => clickable === element || clickable.contains(element)),
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type") ?? "",
        isField: ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName),
        tabIndex: (element as HTMLElement).tabIndex,
        hasOwnMark:
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none",
      };
    });
    if (at === null) break;

    const focused = page.locator(":focus");
    const name =
      (await focused.evaluate((element) => element.getAttribute("aria-label") ?? "")) ||
      (await focused.innerText()).trim();
    await expect(focused, `a ${at.tag} the keyboard reaches has no name`).toHaveAccessibleName(/\S/);
    expect(at.isClickable, `the keyboard stops at "${name}", which is not a clickable thing`).toBe(true);
    expect(at.tabIndex, `"${name}" jumps the page order`).toBeLessThanOrEqual(0);
    if (!at.hasOwnMark) {
      // Laid over the picture: its focus mark is painted into the picture itself.
      await expect
        .poll(() => canvasPictures(page), { message: `"${name}" shows no focus mark` })
        .not.toEqual(picturesBefore);
    }

    const isTextField = at.isField && !["checkbox", "radio", "button", "submit", "reset"].includes(at.type);
    if (isTextField || at.tag === "select") {
      // A field a browser makes takes its own keys: typing, arrows.
      stops.push({ name, tag: at.tag, workedBy: "its own keys" });
      continue;
    }
    await page.evaluate(() => ((window as unknown as { keyboardWalk: Walk }).keyboardWalk.clicked.length = 0));
    await page.keyboard.press("Enter");
    const worked = await page.evaluate(() => {
      const { clicked } = (window as unknown as { keyboardWalk: Walk }).keyboardWalk;
      const element = document.activeElement;
      return clicked.some((target) => element !== null && (target === element || element.contains(target)));
    });
    expect(worked, `Enter does nothing on "${name}"`).toBe(true);
    stops.push({ name, tag: at.tag, workedBy: "Enter" });
  }

  const missed = await page.evaluate(() => {
    const walk = (window as unknown as { keyboardWalk: Walk }).keyboardWalk;
    return walk
      .findClickables()
      .filter((clickable) => !walk.reached.some((element) => element === clickable || clickable.contains(element)))
      .map(
        (element) =>
          element.getAttribute("aria-label") || (element as HTMLElement).innerText || element.outerHTML.slice(0, 80),
      );
  });
  expect(missed, "clickable things the keyboard never reaches").toEqual([]);
  return stops;
}

/** Every canvas on the page, as pictures to compare. */
function canvasPictures(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((canvas) => canvas.toDataURL()));
}
