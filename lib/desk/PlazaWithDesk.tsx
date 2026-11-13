"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, type CSSProperties } from "react";
import { palette } from "../village/engine/palette";
import type { FixedFrame } from "../village/plaza/frameQuery";
import { PlazaScreen } from "../village/plaza/PlazaScreen";
import { DESK_KEY, DESK_ROUTE, opensTheDesk } from "./keys";
import { papersSeenAtTheDesk } from "./seen";

// Sits in the plaza's top bar, on the right: the bar itself is 40 pixels tall.
const wayToTheDeskStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 16,
  height: 40,
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: palette.mist,
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
};

const linkStyle: CSSProperties = { color: palette.cream };

const keyStyle: CSSProperties = {
  padding: "0 6px",
  border: `1px solid ${palette.stone}`,
  borderRadius: 3,
  color: palette.cream,
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: 12,
};

/** The plaza, with every way from it to the desk: the computer, one key, and a link that says so. */
export function PlazaWithDesk(frame: FixedFrame) {
  const router = useRouter();
  const openTheDesk = useCallback(() => router.push(DESK_ROUTE), [router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (opensTheDesk(event)) openTheDesk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTheDesk]);

  return (
    <>
      <PlazaScreen {...frame} onComputerPress={openTheDesk} papersSeenBefore={papersSeenAtTheDesk} />
      <p style={wayToTheDeskStyle}>
        <Link href={DESK_ROUTE} style={linkStyle}>
          Open the desk
        </Link>
        <span>
          or press <kbd style={keyStyle}>{DESK_KEY}</kbd>
        </span>
      </p>
    </>
  );
}
