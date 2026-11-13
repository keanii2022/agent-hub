"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { PLAZA_ROUTE } from "../../lib/desk/keys";
import {
  BOARD_KEY_IN_WORDS,
  CANNOT_OPEN_FOLDER_WORDS,
  NO_PROJECTS_WORDS,
  THIS_HUB_ONLY_WORDS,
  leavesTheClipboard,
  nowWords,
  stepsDoneWords,
  watchBuildBoard,
  type BoardRow,
  type BuildBoard,
  type StepState,
} from "../../lib/village/clipboard";

/** The hub's latest good answer, and whether its newest ask got none. */
type Heard = { latest: BuildBoard | null; hubIsSilent: boolean };

const HUB_IS_SILENT = "The clipboard can't reach the hub right now. It keeps trying.";

const stepClass: Record<StepState, string> = {
  done: "board-step board-step-done",
  current: "board-step board-step-current",
  "not yet": "board-step",
};

function rowClass(row: BoardRow): string {
  if (row.plan === "missing") return "board-row";
  if (row.plan !== "read") return "board-row board-row-trouble";
  return row.done === row.total ? "board-row board-row-finished" : "board-row";
}

function ProjectRow({ row }: { row: BoardRow }) {
  const headingId = useId();
  return (
    <article className={rowClass(row)} aria-labelledby={headingId} data-project={row.project} data-plan={row.plan}>
      <div className="board-row-head">
        <h3 id={headingId}>{row.project}</h3>
        {row.plan === "read" && <p className="board-count">{stepsDoneWords(row.done, row.total)}</p>}
      </div>
      {row.plan === "read" && (
        <div
          className="board-bar"
          role="progressbar"
          aria-labelledby={headingId}
          aria-valuemin={0}
          aria-valuemax={row.total}
          aria-valuenow={row.done}
          aria-valuetext={stepsDoneWords(row.done, row.total)}
        >
          {row.steps.map((state, index) => (
            <span key={index} className={stepClass[state]} data-step={state} />
          ))}
        </div>
      )}
      <p className="board-now">{nowWords(row)}</p>
    </article>
  );
}

export function ClipboardScreen() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [heard, setHeard] = useState<Heard>({ latest: null, hubIsSilent: false });

  useEffect(
    () =>
      watchBuildBoard((news) =>
        // A silent hub never wipes the board that was already showing.
        setHeard((before) =>
          news === "unreachable" ? { latest: before.latest, hubIsSilent: true } : { latest: news, hubIsSilent: false },
        ),
      ),
    [],
  );

  // Arriving from the plaza, reading starts at the top of the board.
  useEffect(() => headingRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (leavesTheClipboard(event)) router.push(PLAZA_ROUTE);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const board = heard.latest;
  const showsABar = board?.projects.some((row) => row.plan === "read") ?? false;

  return (
    <main className="desk" data-board-from={board?.from} data-board-projects={board?.projects.length}>
      <div className="desk-top">
        <Link href={PLAZA_ROUTE}>Back to the village</Link>
        <p>
          or press <kbd>Esc</kbd>
        </p>
      </div>
      <h1 ref={headingRef} tabIndex={-1}>
        Your build board
      </h1>
      <p className="desk-lead">
        How far each project&apos;s plan has got. The hub only reads the plans: nothing here changes one.
      </p>

      <section aria-labelledby="board-projects-heading">
        <h2 id="board-projects-heading">
          Projects{board && <span className="desk-count"> ({board.projects.length})</span>}
        </h2>
        {board === null ? (
          <p className="desk-empty" role="status">
            {heard.hubIsSilent ? HUB_IS_SILENT : "Reading the plans."}
          </p>
        ) : (
          <>
            {heard.hubIsSilent && (
              <p className="desk-note desk-note-trouble" role="status">
                {HUB_IS_SILENT} This board may be out of date.
              </p>
            )}
            {board.from === "this hub only" && <p className="desk-note">{THIS_HUB_ONLY_WORDS}</p>}
            {board.cannotOpenFolder ? (
              <p className="desk-note desk-note-trouble">{CANNOT_OPEN_FOLDER_WORDS}</p>
            ) : board.projects.length === 0 ? (
              <p className="desk-empty">{NO_PROJECTS_WORDS}</p>
            ) : (
              <>
                {showsABar && <p className="desk-hint">{BOARD_KEY_IN_WORDS}</p>}
                <ul className="board-rows">
                  {board.projects.map((row) => (
                    <li key={row.project}>
                      <ProjectRow row={row} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
