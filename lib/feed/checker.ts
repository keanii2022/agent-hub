import {
  CHOICE_FIELDS,
  FEED_FIELDS,
  FEED_STATUSES,
  WAITING_STATUS,
  type FeedChoice,
  type FeedField,
  type FeedLine,
  type FeedStatus,
  type JsonValue,
} from "./format";

export type FeedProblem = {
  field: string | null;
  reason: string;
};

export type FeedCheckResult =
  | { ok: true; line: FeedLine }
  | { ok: false; problems: FeedProblem[] };

type UnknownRecord = Record<string, unknown>;

type StatusAndChoices =
  | { status: typeof WAITING_STATUS; choices: FeedChoice[] }
  | { status: Exclude<FeedStatus, typeof WAITING_STATUS> };

const PLAIN_NAME: Record<FeedField, string> = {
  project: "the project name",
  agent: "the agent name",
  request: "the request name",
  step: "the step name",
  what: "the sentence saying what happened",
  status: "the status",
  when: "the time",
  id: "the line's own number",
  refers_to: "the number of the earlier line",
  choices: "the list of choices",
  urgent: "the urgent mark",
  details: "the extra details",
  demo: "the demo mark",
};

const UTC_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/;
const EXAMPLE_TIME = "2026-10-05T14:03:11Z";
const LONGEST_QUOTE = 40;

export function checkFeedLine(candidate: unknown): FeedCheckResult {
  if (!isPlainRecord(candidate)) {
    return {
      ok: false,
      problems: [
        {
          field: null,
          reason:
            "This isn't a feed line. A feed line is a group of named parts, like the project and the agent.",
        },
      ],
    };
  }

  const problems: FeedProblem[] = [];

  for (const name of Object.keys(candidate)) {
    if (!isFeedField(name)) {
      problems.push({
        field: name,
        reason: `This line has a part the hub doesn't know: ${quoted(name)}. Extra information goes in the details.`,
      });
    }
  }

  const project = readName(candidate, "project", problems) ?? "";
  const agent = readName(candidate, "agent", problems) ?? "";
  const request = readName(candidate, "request", problems) ?? "";
  const step = readStep(candidate, problems);
  const what = readText(candidate, "what", problems) ?? "";
  const statusAndChoices = readStatusAndChoices(candidate, problems);
  const when = readWhen(candidate, problems);
  const id = readName(candidate, "id", problems) ?? "";
  const refersTo = readRefersTo(candidate, id, problems);
  const urgent = readOptionalTrueOrFalse(candidate, "urgent", problems);
  const details = readDetails(candidate, problems);
  const demo = readDemo(candidate, problems);

  if (statusAndChoices === null || problems.length > 0) {
    return { ok: false, problems };
  }

  const beforeStatus = { project, agent, request, step, what };
  const afterStatus = {
    when,
    id,
    ...(refersTo !== undefined && { refers_to: refersTo }),
  };
  const afterChoices = {
    ...(urgent !== undefined && { urgent }),
    ...(details !== undefined && { details }),
    demo,
  };

  if (statusAndChoices.status === WAITING_STATUS) {
    return {
      ok: true,
      line: {
        ...beforeStatus,
        status: statusAndChoices.status,
        ...afterStatus,
        choices: statusAndChoices.choices,
        ...afterChoices,
      },
    };
  }
  return {
    ok: true,
    line: {
      ...beforeStatus,
      status: statusAndChoices.status,
      ...afterStatus,
      ...afterChoices,
    },
  };
}

export function checkFeedLineText(text: string): FeedCheckResult {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return {
      ok: false,
      problems: [
        {
          field: null,
          reason:
            "The hub can't read this line. It isn't written the way a feed line has to be.",
        },
      ],
    };
  }
  return checkFeedLine(candidate);
}

function readText(
  record: UnknownRecord,
  field: FeedField,
  problems: FeedProblem[],
): string | undefined {
  const value = record[field];
  if (value === undefined) {
    problems.push({ field, reason: `This line is missing ${PLAIN_NAME[field]}.` });
    return undefined;
  }
  return readPresentText(value, field, problems);
}

function readPresentText(
  value: unknown,
  field: FeedField,
  problems: FeedProblem[],
): string | undefined {
  if (typeof value !== "string") {
    problems.push({
      field,
      reason: `${capitalized(PLAIN_NAME[field])} has to be written as text, but this line has ${describeFound(value)} there.`,
    });
    return undefined;
  }
  if (value.trim() === "") {
    problems.push({ field, reason: `${capitalized(PLAIN_NAME[field])} is empty.` });
    return undefined;
  }
  return value;
}

function readName(
  record: UnknownRecord,
  field: FeedField,
  problems: FeedProblem[],
): string | undefined {
  const text = readText(record, field, problems);
  return text === undefined ? undefined : refuseSpacesAtTheEnds(text, field, problems);
}

// " approval-desk" and "approval-desk" would quietly become two different projects.
function refuseSpacesAtTheEnds(
  text: string,
  field: FeedField,
  problems: FeedProblem[],
): string | undefined {
  if (text !== text.trim()) {
    problems.push({
      field,
      reason: `${capitalized(PLAIN_NAME[field])} has a space at the start or the end.`,
    });
    return undefined;
  }
  return text;
}

function readStep(record: UnknownRecord, problems: FeedProblem[]): string {
  const step = readText(record, "step", problems);
  if (step === undefined) return "";
  if (/\s/.test(step)) {
    problems.push({
      field: "step",
      reason: "The step name has to be one short word with no spaces, like gate_decision.",
    });
    return "";
  }
  return step;
}

function readStatusAndChoices(
  record: UnknownRecord,
  problems: FeedProblem[],
): StatusAndChoices | null {
  const status = readStatus(record, problems);
  const choices = readChoices(record, problems);
  if (status === null) return null;

  if (status === WAITING_STATUS) {
    if (choices === undefined) {
      problems.push({
        field: "choices",
        reason:
          "This line is waiting for the owner, but it doesn't list what the owner can choose.",
      });
      return null;
    }
    return { status, choices };
  }

  if (choices !== undefined) {
    problems.push({
      field: "choices",
      reason: "Only a line that is waiting for the owner can list choices.",
    });
    return null;
  }
  return { status };
}

function readStatus(record: UnknownRecord, problems: FeedProblem[]): FeedStatus | null {
  const text = readText(record, "status", problems);
  if (text === undefined) return null;
  const status = FEED_STATUSES.find((known) => known === text);
  if (status === undefined) {
    problems.push({
      field: "status",
      reason: `${quoted(text)} isn't a status the hub knows. It has to be one of: ${FEED_STATUSES.join(", ")}.`,
    });
    return null;
  }
  return status;
}

function readChoices(
  record: UnknownRecord,
  problems: FeedProblem[],
): FeedChoice[] | undefined {
  const value = record.choices;
  if (value === undefined) return undefined;

  const noted = (reason: string): FeedChoice[] => {
    problems.push({ field: "choices", reason });
    return [];
  };

  if (!Array.isArray(value)) {
    return noted(
      `The list of choices has to be a list, but this line has ${describeFound(value)} there.`,
    );
  }
  if (value.length === 0) return noted("The list of choices is empty.");

  const choices: FeedChoice[] = [];
  value.forEach((entry: unknown, index) => {
    const choice = readChoice(entry, `Choice ${index + 1}`, noted);
    if (choice === undefined) return;
    if (choices.some((earlier) => earlier.id === choice.id)) {
      noted(`Two choices have the same short name: ${quoted(choice.id)}.`);
      return;
    }
    choices.push(choice);
  });
  return choices;
}

function readChoice(
  entry: unknown,
  called: string,
  noted: (reason: string) => unknown,
): FeedChoice | undefined {
  if (!isPlainRecord(entry)) {
    noted(
      `${called} has to have a short name and a button text, but this line has ${describeFound(entry)} there.`,
    );
    return undefined;
  }

  let complete = true;
  for (const name of Object.keys(entry)) {
    if (!CHOICE_FIELDS.some((known) => known === name)) {
      noted(`${called} has a part the hub doesn't know: ${quoted(name)}.`);
      complete = false;
    }
  }

  const readPart = (part: keyof FeedChoice, plainName: string): string => {
    const value = entry[part];
    if (value === undefined) {
      noted(`${called} is missing its ${plainName}.`);
    } else if (typeof value !== "string") {
      noted(
        `${called}'s ${plainName} has to be written as text, but this line has ${describeFound(value)} there.`,
      );
    } else if (value.trim() === "") {
      noted(`${called}'s ${plainName} is empty.`);
    } else if (part === "id" && value !== value.trim()) {
      noted(`${called}'s ${plainName} has a space at the start or the end.`);
    } else {
      return value;
    }
    complete = false;
    return "";
  };

  const id = readPart("id", "short name");
  const label = readPart("label", "button text");
  return complete ? { id, label } : undefined;
}

function readWhen(record: UnknownRecord, problems: FeedProblem[]): string {
  const text = readText(record, "when", problems);
  if (text === undefined) return "";

  const parts = UTC_TIME.exec(text);
  if (parts === null) {
    problems.push({
      field: "when",
      reason: `The time ${quoted(text)} isn't written in a way the hub can read. It has to look like ${EXAMPLE_TIME}.`,
    });
    return "";
  }

  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const moment = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date.UTC rolls impossible times over (30 February becomes 2 March), so a real time reads back unchanged.
  const isRealTime =
    moment.getUTCFullYear() === year &&
    moment.getUTCMonth() === month - 1 &&
    moment.getUTCDate() === day &&
    moment.getUTCHours() === hour &&
    moment.getUTCMinutes() === minute &&
    moment.getUTCSeconds() === second;
  if (!isRealTime) {
    problems.push({
      field: "when",
      reason: `The time ${quoted(text)} isn't a real date and time.`,
    });
    return "";
  }
  return text;
}

function readRefersTo(
  record: UnknownRecord,
  id: string,
  problems: FeedProblem[],
): string | undefined {
  const value = record.refers_to;
  if (value === undefined) return undefined;
  const text = readPresentText(value, "refers_to", problems);
  if (text === undefined) return undefined;
  const refersTo = refuseSpacesAtTheEnds(text, "refers_to", problems);
  if (refersTo !== undefined && refersTo === id) {
    problems.push({
      field: "refers_to",
      reason: "This line says it is about itself. It can only point at an earlier line.",
    });
    return undefined;
  }
  return refersTo;
}

function readOptionalTrueOrFalse(
  record: UnknownRecord,
  field: FeedField,
  problems: FeedProblem[],
): boolean | undefined {
  const value = record[field];
  if (value === undefined || typeof value === "boolean") return value;
  problems.push({
    field,
    reason: `${capitalized(PLAIN_NAME[field])} has to be true or false, but this line has ${describeFound(value)} there.`,
  });
  return undefined;
}

function readDemo(record: UnknownRecord, problems: FeedProblem[]): boolean {
  if (record.demo === undefined) {
    problems.push({
      field: "demo",
      reason: "This line doesn't say whether it is demo data or real.",
    });
    return false;
  }
  return readOptionalTrueOrFalse(record, "demo", problems) ?? false;
}

function readDetails(
  record: UnknownRecord,
  problems: FeedProblem[],
): JsonValue | undefined {
  const value = record.details;
  if (value === undefined) return undefined;
  if (!isJsonValue(value, new Set())) {
    problems.push({
      field: "details",
      reason: "The extra details hold something that can't be saved as plain data.",
    });
    return undefined;
  }
  return structuredClone(value);
}

function isJsonValue(value: unknown, insideOf: Set<object>): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) && !isPlainRecord(value)) return false;
  if (insideOf.has(value)) return false;

  insideOf.add(value);
  const parts: unknown[] = Array.isArray(value) ? value : Object.values(value);
  const allPartsAreJson = parts.every((part) => isJsonValue(part, insideOf));
  insideOf.delete(value);
  return allPartsAreJson;
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFeedField(name: string): name is FeedField {
  return FEED_FIELDS.some((field) => field === name);
}

function describeFound(value: unknown): string {
  if (value === null) return "an empty value";
  if (Array.isArray(value)) return "a list";
  switch (typeof value) {
    case "string":
      return "text";
    case "number":
      return "a number";
    case "boolean":
      return "true or false";
    case "object":
      return "a group of parts";
    default:
      return "something the hub can't read";
  }
}

function quoted(text: string): string {
  const shown =
    text.length > LONGEST_QUOTE ? `${text.slice(0, LONGEST_QUOTE)}…` : text;
  return `"${shown}"`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
