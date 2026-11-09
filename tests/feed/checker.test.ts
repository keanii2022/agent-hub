import { describe, expect, it } from "vitest";
import {
  ALWAYS_NEEDED_FEED_FIELDS,
  FEED_FIELDS,
  FEED_STATUSES,
  STAGE_1_CHOICES,
  SYSTEM_AGENT,
  checkFeedLine,
  checkFeedLineText,
  type FeedCheckResult,
} from "../../lib/feed";

const workingLine = {
  project: "approval-desk",
  agent: "refund-agent",
  request: "REQ-014",
  step: "read_request",
  what: "Read the refund request",
  status: "working",
  when: "2026-10-05T14:03:11Z",
  id: "40",
  demo: true,
};

const waitingLine = {
  ...workingLine,
  step: "gate_decision",
  what: "Over the limit, sent to a person",
  status: "needs_human",
  id: "41",
  refers_to: "40",
  choices: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ],
  urgent: true,
  details: { amount: 250, currency: "EUR", history: [null, 1.5, "note", false] },
};

function without(line: Record<string, unknown>, field: string) {
  const { [field]: _removed, ...rest } = line;
  return rest;
}

function reasonsOf(result: FeedCheckResult): string[] {
  if (result.ok) throw new Error("expected the line to be refused, but it was accepted");
  return result.problems.map((problem) => problem.reason);
}

function fieldsOf(result: FeedCheckResult): (string | null)[] {
  if (result.ok) throw new Error("expected the line to be refused, but it was accepted");
  return result.problems.map((problem) => problem.field);
}

describe("feed checker: good lines", () => {
  it("accepts a line with only the parts every line needs", () => {
    expect(checkFeedLine(workingLine)).toEqual({ ok: true, line: workingLine });
  });

  it("accepts a waiting line with every optional part", () => {
    expect(checkFeedLine(waitingLine)).toEqual({ ok: true, line: waitingLine });
  });

  it.each(FEED_STATUSES.filter((status) => status !== "needs_human"))(
    "accepts the status %s",
    (status) => {
      expect(checkFeedLine({ ...workingLine, status }).ok).toBe(true);
    },
  );

  it("accepts a real line, marked as not demo", () => {
    expect(checkFeedLine({ ...workingLine, demo: false })).toEqual({
      ok: true,
      line: { ...workingLine, demo: false },
    });
  });

  it("accepts a time with parts of a second", () => {
    expect(checkFeedLine({ ...workingLine, when: "2026-10-05T14:03:11.250Z" }).ok).toBe(true);
  });

  it("accepts a leap day in a leap year", () => {
    expect(checkFeedLine({ ...workingLine, when: "2028-02-29T00:00:00Z" }).ok).toBe(true);
  });

  it("accepts a line written as one line of text in a feed file", () => {
    expect(checkFeedLineText(JSON.stringify(waitingLine))).toEqual({
      ok: true,
      line: waitingLine,
    });
  });

  it("gives back the parts in the same order every time", () => {
    const shuffled = Object.fromEntries(Object.entries(waitingLine).reverse());
    const result = checkFeedLine(shuffled);
    if (!result.ok) throw new Error("expected the line to be accepted");
    expect(Object.keys(result.line)).toEqual([...FEED_FIELDS]);
  });

  it("gives back its own copy, so later changes to the original can't reach it", () => {
    const original = structuredClone(waitingLine);
    const result = checkFeedLine(original);
    original.details.amount = 999_999;
    original.choices[0].label = "Changed";
    expect(result).toEqual({ ok: true, line: waitingLine });
  });
});

describe("feed checker: bad lines", () => {
  const missingFieldReasons: [string, string][] = [
    ["project", "This line is missing the project name."],
    ["agent", "This line is missing the agent name."],
    ["request", "This line is missing the request name."],
    ["step", "This line is missing the step name."],
    ["what", "This line is missing the sentence saying what happened."],
    ["status", "This line is missing the status."],
    ["when", "This line is missing the time."],
    ["id", "This line is missing the line's own number."],
    ["demo", "This line doesn't say whether it is demo data or real."],
  ];

  it.each(missingFieldReasons)(
    "H8: a line with a missing %s is refused with a plain reason",
    (field, reason) => {
      expect(checkFeedLine(without(workingLine, field))).toEqual({
        ok: false,
        problems: [{ field, reason }],
      });
    },
  );

  it("H8: every part a line always needs is covered by the missing-field tests", () => {
    expect(missingFieldReasons.map(([field]) => field)).toEqual([
      ...ALWAYS_NEEDED_FEED_FIELDS,
    ]);
  });

  it.each([
    [
      "project",
      7,
      "The project name has to be written as text, but this line has a number there.",
    ],
    [
      "agent",
      ["refund-agent"],
      "The agent name has to be written as text, but this line has a list there.",
    ],
    [
      "request",
      null,
      "The request name has to be written as text, but this line has an empty value there.",
    ],
    [
      "step",
      true,
      "The step name has to be written as text, but this line has true or false there.",
    ],
    [
      "what",
      { text: "Read the request" },
      "The sentence saying what happened has to be written as text, but this line has a group of parts there.",
    ],
    [
      "status",
      3,
      "The status has to be written as text, but this line has a number there.",
    ],
    [
      "when",
      1791122591000,
      "The time has to be written as text, but this line has a number there.",
    ],
    [
      "id",
      41,
      "The line's own number has to be written as text, but this line has a number there.",
    ],
    [
      "refers_to",
      40,
      "The number of the earlier line has to be written as text, but this line has a number there.",
    ],
    [
      "refers_to",
      null,
      "The number of the earlier line has to be written as text, but this line has an empty value there.",
    ],
    [
      "urgent",
      "yes",
      "The urgent mark has to be true or false, but this line has text there.",
    ],
    [
      "demo",
      "true",
      "The demo mark has to be true or false, but this line has text there.",
    ],
    [
      "demo",
      1,
      "The demo mark has to be true or false, but this line has a number there.",
    ],
  ])(
    "H8: a line with the wrong type in %s (%j) is refused with a plain reason",
    (field, value, reason) => {
      expect(checkFeedLine({ ...workingLine, [field]: value })).toEqual({
        ok: false,
        problems: [{ field, reason }],
      });
    },
  );

  it.each([
    ["only a date", "2026-10-05"],
    ["no Z at the end", "2026-10-05T14:03:11"],
    ["a local time zone", "2026-10-05T16:03:11+02:00"],
    ["a space instead of T", "2026-10-05 14:03:11Z"],
    ["everyday words", "5 Oct 2026, 2pm"],
    ["not a time at all", "soon"],
  ])("H8: a line with a bad time (%s) is refused with a plain reason", (_kind, when) => {
    expect(checkFeedLine({ ...workingLine, when })).toEqual({
      ok: false,
      problems: [
        {
          field: "when",
          reason: `The time "${when}" isn't written in a way the hub can read. It has to look like 2026-10-05T14:03:11Z.`,
        },
      ],
    });
  });

  it.each([
    ["30 February", "2026-02-30T10:00:00Z"],
    ["29 February outside a leap year", "2026-02-29T10:00:00Z"],
    ["month 13", "2026-13-01T10:00:00Z"],
    ["hour 24", "2026-10-05T24:00:00Z"],
    ["minute 60", "2026-10-05T14:60:00Z"],
  ])("H8: a line with a time that can't exist (%s) is refused with a plain reason", (_kind, when) => {
    expect(checkFeedLine({ ...workingLine, when })).toEqual({
      ok: false,
      problems: [
        { field: "when", reason: `The time "${when}" isn't a real date and time.` },
      ],
    });
  });

  it("H8: a line with an unknown status is refused with a plain reason", () => {
    expect(checkFeedLine({ ...workingLine, status: "paused" })).toEqual({
      ok: false,
      problems: [
        {
          field: "status",
          reason:
            '"paused" isn\'t a status the hub knows. It has to be one of: working, needs_human, result_ready, done, blocked, failed.',
        },
      ],
    });
  });

  it("H8: a status in the wrong letter case is not guessed", () => {
    expect(fieldsOf(checkFeedLine({ ...workingLine, status: "Working" }))).toEqual(["status"]);
  });

  it.each(["project", "agent", "request", "step", "what", "status", "when", "id"])(
    "H8: a line with an empty %s is refused",
    (field) => {
      expect(fieldsOf(checkFeedLine({ ...workingLine, [field]: "   " }))).toEqual([field]);
    },
  );

  it("H8: a name with a space at the start or the end is refused, not trimmed", () => {
    expect(checkFeedLine({ ...workingLine, project: " approval-desk" })).toEqual({
      ok: false,
      problems: [
        {
          field: "project",
          reason: "The project name has a space at the start or the end.",
        },
      ],
    });
  });

  it("H8: a step of more than one word is refused", () => {
    expect(checkFeedLine({ ...workingLine, step: "gate decision" })).toEqual({
      ok: false,
      problems: [
        {
          field: "step",
          reason: "The step name has to be one short word with no spaces, like gate_decision.",
        },
      ],
    });
  });

  it("H8: a part the hub doesn't know is refused, not ignored", () => {
    expect(checkFeedLine({ ...workingLine, urgnt: true })).toEqual({
      ok: false,
      problems: [
        {
          field: "urgnt",
          reason:
            'This line has a part the hub doesn\'t know: "urgnt". Extra information goes in the details.',
        },
      ],
    });
  });

  it("H8: a line that points at itself is refused", () => {
    expect(checkFeedLine({ ...workingLine, refers_to: workingLine.id })).toEqual({
      ok: false,
      problems: [
        {
          field: "refers_to",
          reason: "This line says it is about itself. It can only point at an earlier line.",
        },
      ],
    });
  });

  it.each([
    ["a date object", { seen: new Date(0) }],
    ["a number that isn't one", { amount: Number.NaN }],
    ["a function", { run: () => 1 }],
    ["a missing value inside a list", [undefined]],
  ])("H8: details holding %s are refused", (_kind, details) => {
    expect(checkFeedLine({ ...workingLine, details })).toEqual({
      ok: false,
      problems: [
        {
          field: "details",
          reason: "The extra details hold something that can't be saved as plain data.",
        },
      ],
    });
  });

  it("H8: details that loop back into themselves are refused", () => {
    const details: Record<string, unknown> = {};
    details.self = details;
    expect(fieldsOf(checkFeedLine({ ...workingLine, details }))).toEqual(["details"]);
  });

  it("H8: every problem in a line is reported, not just the first", () => {
    const result = checkFeedLine({
      ...without(workingLine, "agent"),
      status: "paused",
      when: "yesterday",
    });
    expect(fieldsOf(result)).toEqual(["agent", "status", "when"]);
  });

  it.each([
    ["text", "a line of text"],
    ["a number", 41],
    ["a list", [workingLine]],
    ["nothing", null],
    ["nothing at all", undefined],
  ])("H8: %s instead of a line is refused with a plain reason", (_kind, candidate) => {
    expect(checkFeedLine(candidate)).toEqual({
      ok: false,
      problems: [
        {
          field: null,
          reason:
            "This isn't a feed line. A feed line is a group of named parts, like the project and the agent.",
        },
      ],
    });
  });

  it.each([
    ["cut off halfway", '{"project":"approval-desk","agent":'],
    ["empty", ""],
    ["plain words", "the refund agent did a thing"],
  ])("H8: a line of feed-file text that is %s is refused with a plain reason", (_kind, text) => {
    expect(checkFeedLineText(text)).toEqual({
      ok: false,
      problems: [
        {
          field: null,
          reason:
            "The hub can't read this line. It isn't written the way a feed line has to be.",
        },
      ],
    });
  });

  it("H8: a line of feed-file text goes through the same checks", () => {
    const text = JSON.stringify({ ...workingLine, status: "paused" });
    expect(fieldsOf(checkFeedLineText(text))).toEqual(["status"]);
  });
});

describe("feed checker: choices", () => {
  it("H8: a waiting line with no choices is refused, the hub doesn't make them up", () => {
    expect(checkFeedLine(without(waitingLine, "choices"))).toEqual({
      ok: false,
      problems: [
        {
          field: "choices",
          reason:
            "This line is waiting for the owner, but it doesn't list what the owner can choose.",
        },
      ],
    });
  });

  it("H8: a waiting line with an empty list of choices is refused", () => {
    expect(reasonsOf(checkFeedLine({ ...waitingLine, choices: [] }))).toEqual([
      "The list of choices is empty.",
    ]);
  });

  it.each(FEED_STATUSES.filter((status) => status !== "needs_human"))(
    "H8: choices on a %s line are refused",
    (status) => {
      expect(checkFeedLine({ ...workingLine, status, choices: STAGE_1_CHOICES })).toEqual({
        ok: false,
        problems: [
          {
            field: "choices",
            reason: "Only a line that is waiting for the owner can list choices.",
          },
        ],
      });
    },
  );

  it.each([
    [
      "is not a list",
      "approve, reject",
      "The list of choices has to be a list, but this line has text there.",
    ],
    [
      "holds a bare word",
      ["approve"],
      "Choice 1 has to have a short name and a button text, but this line has text there.",
    ],
    [
      "has a choice with no short name",
      [{ label: "Approve" }],
      "Choice 1 is missing its short name.",
    ],
    [
      "has a choice with no button text",
      [{ id: "approve", label: "Approve" }, { id: "reject" }],
      "Choice 2 is missing its button text.",
    ],
    [
      "has a choice with an empty button text",
      [{ id: "approve", label: "" }],
      "Choice 1's button text is empty.",
    ],
    [
      "has a choice with a number as its short name",
      [{ id: 1, label: "Approve" }],
      "Choice 1's short name has to be written as text, but this line has a number there.",
    ],
    [
      "has a choice with a space around its short name",
      [{ id: "approve ", label: "Approve" }],
      "Choice 1's short name has a space at the start or the end.",
    ],
    [
      "has a choice with a part the hub doesn't know",
      [{ id: "approve", label: "Approve", colour: "green" }],
      'Choice 1 has a part the hub doesn\'t know: "colour".',
    ],
    [
      "has the same choice twice",
      [
        { id: "approve", label: "Approve" },
        { id: "approve", label: "Approve again" },
      ],
      'Two choices have the same short name: "approve".',
    ],
  ])("H8: a list of choices that %s is refused with a plain reason", (_kind, choices, reason) => {
    expect(checkFeedLine({ ...waitingLine, choices })).toEqual({
      ok: false,
      problems: [{ field: "choices", reason }],
    });
  });

  it("accepts choices other than approve and reject, so the desk can show any list", () => {
    const choices = [
      { id: "pay_in_full", label: "Pay in full" },
      { id: "pay_half", label: "Pay half" },
      { id: "reject", label: "Reject" },
    ];
    expect(checkFeedLine({ ...waitingLine, choices })).toEqual({
      ok: true,
      line: { ...waitingLine, choices },
    });
  });
});

describe("feed checker: the words a person sees", () => {
  const badLines: unknown[] = [
    null,
    {},
    { ...workingLine, status: "paused", when: "soon", id: 41, refers_to: 40 },
    { ...workingLine, project: " x", step: "two words", urgent: "yes", demo: "no" },
    { ...workingLine, details: { amount: Number.NaN }, choices: STAGE_1_CHOICES },
    { ...waitingLine, choices: [{ id: 1 }, "reject", { id: "a", label: "A", extra: 1 }] },
    without(waitingLine, "choices"),
  ];
  const reasons = [
    ...badLines.flatMap((line) => reasonsOf(checkFeedLine(line))),
    ...reasonsOf(checkFeedLineText("{")),
  ];

  it("H8: every refusal comes with at least one reason", () => {
    for (const line of badLines) {
      expect(reasonsOf(checkFeedLine(line)).length).toBeGreaterThan(0);
    }
  });

  it("H12: no reason shows a rule code", () => {
    for (const reason of reasons) expect(reason).not.toMatch(/\bH\d{1,2}\b/);
  });

  it("H12: no reason uses programmer words", () => {
    const programmerWords =
      /\b(undefined|null|NaN|object|array|string|boolean|JSON|typeof|refers_to|field|schema|parse)\b/i;
    for (const reason of reasons) expect(reason).not.toMatch(programmerWords);
  });

  it("H12: every reason is a full sentence", () => {
    for (const reason of reasons) expect(reason).toMatch(/^["A-Z].*\.$/);
  });
});

describe("feed format: one agent or ten", () => {
  const tenAgents = Array.from({ length: 10 }, (_unused, index) => `agent-${index + 1}`);

  function linesFor(project: string, agents: string[]) {
    return agents.flatMap((agent, index) => [
      {
        project,
        agent,
        request: `JOB-${index + 1}`,
        step: "start",
        what: "Started the job",
        status: "working",
        when: `2026-10-05T09:${String(index).padStart(2, "0")}:00Z`,
        id: `${index * 2 + 1}`,
        demo: true,
      },
      {
        project,
        agent,
        request: `JOB-${index + 1}`,
        step: "finish",
        what: "Finished the job",
        status: "done",
        when: `2026-10-05T10:${String(index).padStart(2, "0")}:00Z`,
        id: `${index * 2 + 2}`,
        refers_to: `${index * 2 + 1}`,
        demo: true,
      },
    ]);
  }

  it("the same format carries a project with one agent", () => {
    const lines = linesFor("solo-house", ["only-agent"]);
    const results = lines.map(checkFeedLine);
    expect(results).toEqual(lines.map((line) => ({ ok: true, line })));
  });

  it("the same format carries a project with ten agents", () => {
    const lines = linesFor("team-house", tenAgents);
    const results = lines.map(checkFeedLine);
    expect(results).toEqual(lines.map((line) => ({ ok: true, line })));

    const agentsSeen = new Set(
      results.flatMap((result) => (result.ok ? [result.line.agent] : [])),
    );
    expect([...agentsSeen]).toEqual(tenAgents);
  });

  it("one-agent and ten-agent lines have exactly the same parts", () => {
    const partsOf = (project: string, agents: string[]) =>
      new Set(linesFor(project, agents).flatMap((line) => Object.keys(line)));
    expect(partsOf("solo-house", ["only-agent"])).toEqual(partsOf("team-house", tenAgents));
  });

  it("plain code, like a gate, is an agent called system in either kind of project", () => {
    expect(checkFeedLine({ ...workingLine, agent: SYSTEM_AGENT }).ok).toBe(true);
  });
});
