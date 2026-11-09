import type { DemoScript, ScriptedLine } from "../script";

const REFUND_AGENT = "refund-agent";

type RefundLine = Omit<ScriptedLine, "agent">;

const refundAgentDoes = (lines: RefundLine[]): ScriptedLine[] =>
  lines.map((line) => ({ agent: REFUND_AGENT, ...line }));

// Every customer, order and amount here is invented. The steps are the kinds
// approval-desk's logbook uses, so this house looks the way the real one will.
export const approvalDeskScript: DemoScript = {
  project: "approval-desk",
  dayLength: "20:00",
  requestPrefix: "REQ",
  agents: [
    {
      name: REFUND_AGENT,
      arrives: "00:04",
      arrivesSaying: "Switched on the desk lamp and opened the refund inbox",
      leaves: "19:40",
      leavesSaying: "The inbox is empty. Lamp off, see you tomorrow",
    },
  ],
  requests: [
    refundAgentDoes([
      {
        at: "00:15",
        step: "read_request",
        what: "Reading Mira's note: her teapot arrived with a cracked lid",
        status: "working",
        details: { customer: "Mira", item: "teapot" },
      },
      {
        at: "00:50",
        step: "gate_decision",
        what: "A €18 refund is under the limit, so the gate let it through",
        status: "working",
        as: "gate",
        details: { outcome: "allow", amount: 18, currency: "EUR" },
      },
      {
        at: "01:20",
        step: "refund_done",
        what: "Paid €18 back to Mira for the cracked teapot lid",
        status: "done",
        about: "gate",
        details: { amount: 18, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "01:40",
        step: "read_request",
        what: "Reading Tobias's note: the standing desk he paid for never arrived",
        status: "working",
        details: { customer: "Tobias", item: "standing desk" },
      },
      {
        at: "02:25",
        step: "gate_decision",
        what: "A €340 refund for Tobias's missing standing desk is over the limit. OK to pay it back?",
        status: "needs_human",
        as: "gate",
        details: { outcome: "send_to_human", amount: 340, currency: "EUR" },
      },
      {
        at: "09:30",
        step: "human_decision",
        what: "The owner approved the €340 refund for Tobias",
        status: "working",
        about: "gate",
        details: { choice: "approve" },
      },
      {
        at: "09:50",
        step: "refund_done",
        what: "Paid €340 back to Tobias for the desk that never came",
        status: "done",
        details: { amount: 340, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "03:00",
        step: "read_request",
        what: "Reading Jonas's note: he wants his money back for a gift card",
        status: "working",
        details: { customer: "Jonas", item: "gift card" },
      },
      {
        at: "03:30",
        step: "gate_decision",
        what: "Gift cards can't be refunded, so the gate stopped this one",
        status: "blocked",
        details: { outcome: "block", amount: 50, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "04:10",
        step: "read_request",
        what: "Reading Anouk's note: she was charged twice for one scarf",
        status: "working",
        details: { customer: "Anouk", item: "scarf" },
      },
      {
        at: "04:40",
        step: "gate_decision",
        what: "The €24 double charge is under the limit, so the gate let it through",
        status: "working",
        as: "gate",
        details: { outcome: "allow", amount: 24, currency: "EUR" },
      },
      {
        at: "05:05",
        step: "refund_done",
        what: "Paid €24 back to Anouk for the double charge",
        status: "done",
        about: "gate",
        details: { amount: 24, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "05:40",
        step: "read_request",
        what: "Reading Pilar's note: her wedding flowers came wilted, and the wedding is on Saturday",
        status: "working",
        details: { customer: "Pilar", item: "wedding flowers" },
      },
      {
        at: "06:10",
        step: "gate_decision",
        what: "Pilar's €410 flower refund is over the limit, and she needs an answer today. OK to pay it back?",
        status: "needs_human",
        urgent: true,
        details: { outcome: "send_to_human", amount: 410, currency: "EUR" },
      },
      {
        at: "19:00",
        step: "request_closed",
        what: "The florist sent Pilar fresh flowers instead, so no refund is needed",
        status: "done",
      },
    ]),
    refundAgentDoes([
      {
        at: "07:20",
        step: "summary",
        what: "Adding up the morning's refunds",
        status: "working",
      },
      {
        at: "07:50",
        step: "summary",
        what: "Morning round-up: 2 refunds paid, 1 stopped, 2 waiting for you, €42 sent back",
        status: "result_ready",
        details: { paid: 2, stopped: 1, waiting: 2, sent_back: 42, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "08:20",
        step: "read_request",
        what: "Reading Kenji's note: he wants €95 back for headphones he has used for two months",
        status: "working",
        details: { customer: "Kenji", item: "headphones" },
      },
      {
        at: "08:55",
        step: "gate_decision",
        what: "Kenji's headphones are past the 30-day return window. Refund the €95 anyway?",
        status: "needs_human",
        as: "gate",
        details: { outcome: "send_to_human", amount: 95, currency: "EUR" },
      },
      {
        at: "13:10",
        step: "human_decision",
        what: "The owner said no to Kenji's refund: two months is too long",
        status: "working",
        about: "gate",
        details: { choice: "reject", note: "Two months is past the return window." },
      },
      {
        at: "13:30",
        step: "refund_refused",
        what: "Told Kenji kindly that the refund was turned down",
        status: "blocked",
      },
    ]),
    refundAgentDoes([
      {
        at: "10:20",
        step: "read_request",
        what: "Reading Lotte's note: one of her six glasses arrived chipped",
        status: "working",
        details: { customer: "Lotte", item: "glasses" },
      },
      {
        at: "10:50",
        step: "gate_decision",
        what: "€9 for one chipped glass is under the limit, so the gate let it through",
        status: "working",
        as: "gate",
        details: { outcome: "allow", amount: 9, currency: "EUR" },
      },
      {
        at: "11:15",
        step: "refund_done",
        what: "Paid €9 back to Lotte for the chipped glass",
        status: "done",
        about: "gate",
        details: { amount: 9, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "11:50",
        step: "read_request",
        what: "Reading Odette's note: the armchair she got is the wrong colour",
        status: "working",
        details: { customer: "Odette", item: "armchair" },
      },
      {
        at: "12:25",
        step: "gate_decision",
        what: "Odette's €275 armchair refund is over the limit. OK to pay it back?",
        status: "needs_human",
        details: { outcome: "send_to_human", amount: 275, currency: "EUR" },
      },
      {
        at: "19:15",
        step: "request_closed",
        what: "Odette decided to keep the armchair after all, so no refund is needed",
        status: "done",
      },
    ]),
    refundAgentDoes([
      {
        at: "14:10",
        step: "read_request",
        what: "Reading Emre's note: his reading lamp came without a bulb",
        status: "working",
        details: { customer: "Emre", item: "reading lamp" },
      },
      {
        at: "14:35",
        step: "gate_decision",
        what: "€6 for a missing bulb is under the limit, so the gate let it through",
        status: "working",
        as: "gate",
        details: { outcome: "allow", amount: 6, currency: "EUR" },
      },
      {
        at: "15:00",
        step: "refund_done",
        what: "Paid €6 back to Emre for the missing bulb",
        status: "done",
        about: "gate",
        details: { amount: 6, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "13:50",
        step: "read_request",
        what: "Reading Saskia's note: her bike order was cancelled, but the money never came back",
        status: "working",
        details: { customer: "Saskia", item: "bike" },
      },
      {
        at: "14:20",
        step: "gate_decision",
        what: "Saskia's €520 bike refund is over the limit. OK to pay it back?",
        status: "needs_human",
        as: "gate",
        details: { outcome: "send_to_human", amount: 520, currency: "EUR" },
      },
      {
        at: "18:45",
        step: "human_decision",
        what: "The owner approved the €520 refund for Saskia",
        status: "working",
        about: "gate",
        details: { choice: "approve" },
      },
      {
        at: "18:55",
        step: "refund_done",
        what: "Paid €520 back to Saskia for the cancelled bike",
        status: "done",
        details: { amount: 520, currency: "EUR" },
      },
    ]),
    refundAgentDoes([
      {
        at: "18:10",
        step: "summary",
        what: "Adding up the day's refunds",
        status: "working",
      },
      {
        at: "18:30",
        step: "summary",
        what: "End-of-day round-up: 5 refunds paid, 2 turned down, 3 still waiting for you, €397 sent back",
        status: "result_ready",
        details: { paid: 5, turned_down: 2, waiting: 3, sent_back: 397, currency: "EUR" },
      },
    ]),
  ],
};
