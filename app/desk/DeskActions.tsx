"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  NOTE_MAX_LENGTH,
  NO_DOOR_NOTE,
  answerOnRecordWords,
  labelOfChoice,
  noteNeededWords,
  type DeskAnswer,
} from "../../lib/decisions";
import type { DeskItem } from "../../lib/desk";
import { REJECT_CHOICE_ID, type FeedChoice } from "../../lib/feed/format";

type ActionButtonProps = {
  label: string;
  /** The id of the item's own heading, so the button is read out with what it is about. */
  describedBy: string;
  isBusy: boolean;
  isMain?: boolean;
  onPress(): void;
};

// `aria-disabled`, not `disabled`: a disabled button drops the keyboard's
// place on the page while the hub answers.
function ActionButton({ label, describedBy, isBusy, isMain = false, onPress }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={isMain ? "desk-button desk-button-main" : "desk-button"}
      aria-describedby={describedBy}
      aria-disabled={isBusy}
      onClick={() => {
        if (!isBusy) onPress();
      }}
    >
      {label}
    </button>
  );
}

type NoteFormProps = {
  choice: FeedChoice;
  describedBy: string;
  isBusy: boolean;
  onSend(note: string): void;
  onCancel(): void;
  /** Says a sentence out loud, in the desk's own voice. */
  onSay(words: string): void;
};

function NoteForm({ choice, describedBy, isBusy, onSend, onCancel, onSay }: NoteFormProps) {
  const noteId = useId();
  const problemId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => fieldRef.current?.focus(), []);

  function send(event: FormEvent): void {
    event.preventDefault();
    if (isBusy) return;
    if (note.trim() === "") {
      // H7: refused here, before anything leaves the page. The hub checks again.
      const words = noteNeededWords(choice.label);
      setProblem(words);
      onSay(words);
      fieldRef.current?.focus();
      return;
    }
    onSend(note);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    // Escape closes the note, and stops there: it doesn't also leave the desk.
    event.stopPropagation();
    onCancel();
  }

  return (
    <form className="desk-note-form" noValidate onSubmit={send} onKeyDown={onKey}>
      <label htmlFor={noteId}>Your note saying why (needed)</label>
      <textarea
        id={noteId}
        ref={fieldRef}
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        value={note}
        aria-required="true"
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? describedBy : `${problemId} ${describedBy}`}
        onChange={(event) => {
          setNote(event.target.value);
          setProblem(null);
        }}
      />
      {problem !== null && (
        <p id={problemId} className="desk-note-problem">
          {problem}
        </p>
      )}
      <div className="desk-buttons">
        <button type="submit" className="desk-button desk-button-main" aria-describedby={describedBy} aria-disabled={isBusy}>
          {choice.label} with this note
        </button>
        <button type="button" className="desk-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export type DecisionActionsProps = {
  item: DeskItem;
  describedBy: string;
  /** The decision the hub has on record for this request, if there is one. */
  answer: DeskAnswer | null;
  /** null until the hub has said which houses can take an answer. */
  canAnswer: boolean | null;
  isBusy: boolean;
  onAnswer(choice: FeedChoice, note?: string): void;
  onSay(words: string): void;
};

/** One button for each choice the request itself lists. A reject asks for its note first. */
export function DecisionActions({ item, describedBy, answer, canAnswer, isBusy, onAnswer, onSay }: DecisionActionsProps) {
  const [noteFor, setNoteFor] = useState<FeedChoice | null>(null);
  const buttonsRef = useRef<HTMLSpanElement>(null);
  const choices = item.line.choices ?? [];

  if (answer !== null) {
    return <p className="desk-answered">{answerOnRecordWords(answer, labelOfChoice(choices, answer.choice))}</p>;
  }
  if (canAnswer === null) return null;
  if (!canAnswer) return <p className="desk-answered">{NO_DOOR_NOTE}</p>;

  if (noteFor !== null) {
    return (
      <NoteForm
        choice={noteFor}
        describedBy={describedBy}
        isBusy={isBusy}
        onSend={(note) => onAnswer(noteFor, note)}
        onCancel={() => {
          setNoteFor(null);
          // The buttons come back on the next paint; the keyboard returns to where it was.
          requestAnimationFrame(() =>
            buttonsRef.current?.querySelector<HTMLButtonElement>("[data-opens-note] button")?.focus(),
          );
        }}
        onSay={onSay}
      />
    );
  }

  return (
    <span className="desk-buttons" ref={buttonsRef}>
      {choices.map((choice) =>
        choice.id === REJECT_CHOICE_ID ? (
          <span key={choice.id} data-opens-note>
            <ActionButton label={choice.label} describedBy={describedBy} isBusy={isBusy} onPress={() => setNoteFor(choice)} />
          </span>
        ) : (
          <ActionButton
            key={choice.id}
            label={choice.label}
            describedBy={describedBy}
            isBusy={isBusy}
            isMain
            onPress={() => onAnswer(choice)}
          />
        ),
      )}
    </span>
  );
}

export const MARK_AS_SEEN_LABEL = "Mark as seen";

export type ResultActionsProps = {
  describedBy: string;
  isBusy: boolean;
  onSeen(): void;
};

export function ResultActions({ describedBy, isBusy, onSeen }: ResultActionsProps) {
  return (
    <span className="desk-buttons">
      <ActionButton label={MARK_AS_SEEN_LABEL} describedBy={describedBy} isBusy={isBusy} onPress={onSeen} />
    </span>
  );
}
