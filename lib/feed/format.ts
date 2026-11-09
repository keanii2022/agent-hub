export const FEED_STATUSES = [
  "working",
  "needs_human",
  "result_ready",
  "done",
  "blocked",
  "failed",
] as const;

export type FeedStatus = (typeof FEED_STATUSES)[number];

export const WAITING_STATUS = "needs_human";

export const FINISH_STATUSES = [
  "done",
  "blocked",
  "failed",
] as const satisfies readonly FeedStatus[];

export const FEED_FIELDS = [
  "project",
  "agent",
  "request",
  "step",
  "what",
  "status",
  "when",
  "id",
  "refers_to",
  "choices",
  "urgent",
  "details",
  "demo",
] as const;

export type FeedField = (typeof FEED_FIELDS)[number];

export const ALWAYS_NEEDED_FEED_FIELDS = [
  "project",
  "agent",
  "request",
  "step",
  "what",
  "status",
  "when",
  "id",
  "demo",
] as const satisfies readonly FeedField[];

export const SYSTEM_AGENT = "system";

export type FeedChoice = {
  id: string;
  label: string;
};

export const CHOICE_FIELDS = ["id", "label"] as const satisfies readonly (keyof FeedChoice)[];

export const APPROVE_CHOICE_ID = "approve";
export const REJECT_CHOICE_ID = "reject";

export const STAGE_1_CHOICES: readonly FeedChoice[] = [
  { id: APPROVE_CHOICE_ID, label: "Approve" },
  { id: REJECT_CHOICE_ID, label: "Reject" },
];

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type FeedLineCommon = {
  project: string;
  agent: string;
  request: string;
  step: string;
  what: string;
  when: string;
  id: string;
  refers_to?: string;
  urgent?: boolean;
  details?: JsonValue;
  demo: boolean;
};

export type WaitingFeedLine = FeedLineCommon & {
  status: typeof WAITING_STATUS;
  choices: FeedChoice[];
};

export type PlainFeedLine = FeedLineCommon & {
  status: Exclude<FeedStatus, typeof WAITING_STATUS>;
  choices?: never;
};

export type FeedLine = WaitingFeedLine | PlainFeedLine;
