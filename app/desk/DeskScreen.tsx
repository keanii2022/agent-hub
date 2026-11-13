"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DESK_ORDER_IN_WORDS,
  EVERYTHING,
  PLAZA_ROUTE,
  agentsOffered,
  choicesInWords,
  deskItemsFrom,
  emptyLogWords,
  filterWithProject,
  housesWithNoNews,
  kindInWords,
  leavesTheDesk,
  logCountWords,
  logShownFor,
  projectsOffered,
  rememberSeenAtTheDesk,
  statusInWords,
  waitedInWords,
  watchDeskLog,
  type DeskItem,
  type DeskLog,
  type LogEntry,
  type LogFilter,
} from "../../lib/desk";
import type { VillageState } from "../../lib/village/state/village-state";
import { watchVillageState } from "../../lib/village/state/watch";

/** The hub's latest good answer, and whether its newest ask got none. */
type Heard<Answer> = { latest: Answer | null; hubIsSilent: boolean };

const NOTHING_HEARD = { latest: null, hubIsSilent: false };

function heardAfter<Answer>(heard: Heard<Answer>, news: Answer | "unreachable"): Heard<Answer> {
  // A silent hub never wipes what was already on the desk.
  return news === "unreachable" ? { latest: heard.latest, hubIsSilent: true } : { latest: news, hubIsSilent: false };
}

const HUB_IS_SILENT = "The desk can't reach the hub right now. It keeps trying.";

type WaitingCardProps = {
  item: DeskItem;
  /**
   * The item's own controls, shown at its foot. Empty for now: the desk only
   * shows. `item.project` and `item.lineId` say what an answer is about.
   */
  actions?: ReactNode;
};

function WaitingCard({ item, actions }: WaitingCardProps) {
  const headingId = useId();
  const choices = choicesInWords(item.line.choices);
  return (
    <article
      className={item.isUrgent ? "desk-item desk-item-urgent" : "desk-item"}
      aria-labelledby={headingId}
      data-project={item.project}
      data-line-id={item.lineId}
      data-kind={item.kind}
    >
      <p className="desk-tags">
        {item.isUrgent && <span className="desk-tag desk-tag-urgent">URGENT</span>}
        <span className={`desk-tag desk-tag-${item.kind}`}>{kindInWords(item.kind)}</span>
        {item.isDemo && <span className="desk-tag desk-tag-demo">DEMO</span>}
      </p>
      <h3 id={headingId}>{item.line.what}</h3>
      <dl className="desk-facts">
        <div>
          <dt>From</dt>
          <dd>
            {item.line.agent} at {item.project}
          </dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd>{waitedInWords(item.waitedMs)}</dd>
        </div>
        {choices !== "" && (
          <div>
            <dt>You can answer</dt>
            <dd>{choices}</dd>
          </div>
        )}
      </dl>
      <p className="desk-reference">Request {item.line.request}</p>
      {actions !== undefined && <div className="desk-item-actions">{actions}</div>}
    </article>
  );
}

function isSameDay(first: Date, second: Date): boolean {
  return first.toDateString() === second.toDateString();
}

/** The owner's own clock time, with the day when it isn't the hub's today. */
function timeOnTheOwnersClock(when: string, hubNow: string): string {
  const moment = new Date(when);
  if (Number.isNaN(moment.getTime())) return "";
  const time = moment.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isSameDay(moment, new Date(hubNow))) return time;
  return `${moment.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

function LogRow({ entry, hubNow }: { entry: LogEntry; hubNow: string }) {
  return (
    <tr data-project={entry.project} data-agent={entry.agent}>
      <td>
        <time dateTime={entry.when}>{timeOnTheOwnersClock(entry.when, hubNow)}</time>
      </td>
      <td className="desk-log-who">
        {entry.project}
        {entry.isDemo && <span className="desk-tag desk-tag-demo">DEMO</span>}
      </td>
      <td className="desk-log-who">{entry.agent}</td>
      <td>
        {entry.what}
        <span className="desk-reference">Request {entry.request}</span>
      </td>
      <td>{statusInWords(entry.status)}</td>
    </tr>
  );
}

export function DeskScreen() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [village, setVillage] = useState<Heard<VillageState>>(NOTHING_HEARD);
  const [log, setLog] = useState<Heard<DeskLog>>(NOTHING_HEARD);
  const [filter, setFilter] = useState<LogFilter>(EVERYTHING);

  useEffect(() => watchVillageState((news) => setVillage((heard) => heardAfter(heard, news))), []);
  useEffect(() => watchDeskLog((news) => setLog((heard) => heardAfter(heard, news))), []);

  // Arriving from the plaza, reading starts at the top of the desk.
  useEffect(() => headingRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (leavesTheDesk(event)) router.push(PLAZA_ROUTE);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const items = useMemo(() => (village.latest ? deskItemsFrom(village.latest) : null), [village.latest]);
  const silentHouses = useMemo(() => (village.latest ? housesWithNoNews(village.latest) : []), [village.latest]);

  // Whatever the desk has shown, the owner has seen: the plaza's mark stays away for these.
  useEffect(() => {
    if (items) rememberSeenAtTheDesk(items.map((item) => item.key));
  }, [items]);

  const shown = useMemo(() => (log.latest ? logShownFor(log.latest, filter) : null), [log.latest, filter]);
  const villageProjects = useMemo(
    () => village.latest?.projects.map((project) => project.project) ?? [],
    [village.latest],
  );
  const projects = projectsOffered(villageProjects, log.latest);
  const agents = agentsOffered(log.latest, filter.project);
  const isFiltered = filter.project !== null || filter.agent !== null;
  const showsDemo = (items ?? []).some((item) => item.isDemo) || (shown?.entries ?? []).some((entry) => entry.isDemo);

  return (
    <main className="desk" data-desk-as-of={village.latest?.asOf} data-log-as-of={log.latest?.asOf}>
      <div className="desk-top">
        <Link href={PLAZA_ROUTE}>Back to the village</Link>
        <p>
          or press <kbd>Esc</kbd>
        </p>
      </div>
      <h1 ref={headingRef} tabIndex={-1}>
        Your desk
      </h1>
      <p className="desk-lead">Everything your agents are waiting on you for, and everything they have done.</p>
      {showsDemo && (
        <p className="desk-note">
          <span className="desk-tag desk-tag-demo">DEMO</span> marks a scripted example. It is not real activity.
        </p>
      )}

      <section aria-labelledby="desk-waiting-heading">
        <h2 id="desk-waiting-heading">
          Waiting for you{items && <span className="desk-count"> ({items.length})</span>}
        </h2>
        {items === null ? (
          <p className="desk-empty" role="status">
            {village.hubIsSilent ? HUB_IS_SILENT : "Looking at what is on the desk."}
          </p>
        ) : (
          <>
            {village.hubIsSilent && (
              <p className="desk-note desk-note-trouble" role="status">
                {HUB_IS_SILENT} This list may be out of date.
              </p>
            )}
            {silentHouses.map((house) => (
              <p key={house.project} className="desk-note desk-note-trouble" data-no-news-from={house.project}>
                {house.note}
              </p>
            ))}
            {items.length === 0 ? (
              <p className="desk-empty">Nothing is waiting for you.</p>
            ) : (
              <>
                <p className="desk-hint">{DESK_ORDER_IN_WORDS}</p>
                <ul className="desk-items">
                  {items.map((item) => (
                    <li key={item.key}>
                      <WaitingCard item={item} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="desk-log-heading">
        <h2 id="desk-log-heading">Everything that happened</h2>
        <div className="desk-filters" role="group" aria-label="Show only">
          <label>
            Project
            <select
              value={filter.project ?? ""}
              onChange={(event) =>
                setFilter(filterWithProject(filter, event.target.value === "" ? null : event.target.value, log.latest))
              }
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agent
            <select
              value={filter.agent ?? ""}
              onChange={(event) =>
                setFilter({ ...filter, agent: event.target.value === "" ? null : event.target.value })
              }
            >
              <option value="">All agents</option>
              {agents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </label>
          {isFiltered && (
            <button type="button" onClick={() => setFilter(EVERYTHING)}>
              Show everything
            </button>
          )}
        </div>
        {shown === null || log.latest === null ? (
          <p className="desk-empty" role="status">
            {log.hubIsSilent ? HUB_IS_SILENT : "Opening the log."}
          </p>
        ) : (
          <>
            {log.hubIsSilent && (
              <p className="desk-note desk-note-trouble" role="status">
                {HUB_IS_SILENT} This log may be out of date.
              </p>
            )}
            {log.latest.unreadable.map((project) => (
              <p key={project} className="desk-note desk-note-trouble" data-no-log-from={project}>
                The hub can&apos;t read what {project} has done right now. The others are all here.
              </p>
            ))}
            {shown.entries.length === 0 ? (
              <p className="desk-empty" role="status">
                {emptyLogWords(filter)}
              </p>
            ) : (
              <>
                <p className="desk-hint" role="status">
                  {logCountWords(shown.entries.length, filter)}
                  {shown.olderLeftOut && " Older ones are kept in the hub's record and not shown here."}
                </p>
                <div className="desk-log-scroll">
                  <table className="desk-log">
                    <caption className="desk-sr-only">What every agent did, newest first</caption>
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Project</th>
                        <th scope="col">Agent</th>
                        <th scope="col">What happened</th>
                        <th scope="col">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.entries.map((entry) => (
                        <LogRow key={entry.key} entry={entry} hubNow={log.latest?.asOf ?? entry.when} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
