import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock3, Printer } from "lucide-react";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { Card, Empty, Loading, Notice, Page } from "../components/ui";
import { PickupSuggestion } from "../components/PickupSuggestion";
import { UrgentRequest } from "../urgent/UrgentRequest";
import { date, money, number } from "../utils/format";

export function QueuePage() {
  const { jobs, queue, basePath, refresh, connection } = useStudent();
  const { t, intlLocale } = useTranslation();
  const [token, setToken] = useState("");
  const [notFound, setNotFound] = useState(false);
  const navigate = useNavigate();
  const visible = jobs
    .filter((job) => job.status !== "collected")
    .sort((a, b) => {
      if (a.queuePosition !== null && b.queuePosition !== null)
        return a.queuePosition - b.queuePosition;
      if (a.queuePosition !== null) return -1;
      if (b.queuePosition !== null) return 1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  const printer = queue?.printer;
  const outage =
    printer?.state === "paused" || printer?.state === "maintenance";

  return (
    <Page
      eyebrow={t("queue.eyebrow")}
      title={t("queue.title")}
      description={t("queue.description")}
      actions={
        <>
          <Link className="pq-button pq-secondary" to={`${basePath}/estimate`}>
            {t("queue.estimate.link")}
          </Link>
          <Link className="pq-button pq-secondary" to={`${basePath}/simulate`}>
            {t("queue.simulate.link")}
          </Link>
        </>
      }
    >
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = token.trim().toUpperCase();
            const match = jobs.find(
              (job) => job.token.toUpperCase() === normalized,
            );
            if (match)
              navigate(`${basePath}/jobs/${encodeURIComponent(match.id)}`);
            else setNotFound(true);
          }}
        >
          <div className="pq-filter-bar">
            <div className="pq-field">
              <label htmlFor="pq-token-lookup">{t("queue.token.label")}</label>
              <input
                id="pq-token-lookup"
                value={token}
                maxLength={160}
                autoComplete="off"
                aria-invalid={notFound}
                aria-describedby={notFound ? "pq-token-error" : "pq-token-help"}
                onChange={(event) => {
                  setToken(event.target.value);
                  setNotFound(false);
                }}
              />
              <small id="pq-token-help">{t("queue.token.help")}</small>
            </div>
            <button className="pq-button" type="submit">
              {t("queue.token.find")}
            </button>
          </div>
          {notFound && (
            <p id="pq-token-error" className="pq-field-error" role="alert">
              {t("queue.token.notFound")}
            </p>
          )}
        </form>
      </Card>
      {!queue && (
        <>
          <Loading label={t("queue.loading")} />
          {(connection.state === "unavailable" ||
            connection.state === "disconnected") && (
            <Notice kind="warning">
              <p>{t("queue.loadFailed")}</p>
              <button
                type="button"
                className="pq-button pq-secondary"
                onClick={refresh}
              >
                {t("queue.retry")}
              </button>
            </Notice>
          )}
        </>
      )}
      {queue && (
        <>
          {queue.stale && <Notice kind="warning">{t("queue.stale")}</Notice>}
          <Card>
            <div className="pq-card-heading">
              <Printer aria-hidden="true" />
              <h2>{t("queue.printer.title")}</h2>
            </div>
            <p>{t(`queue.printer.${printer?.state ?? "unknown"}`)}</p>
            {outage && (
              <Notice kind="warning">
                {printer?.downtime?.kind === "known" ? (
                  <>
                    <p>
                      {t("queue.printer.resumeAt", {
                        time: date(
                          printer.downtime.expectedResumeAt,
                          intlLocale,
                        ),
                      })}
                    </p>
                    {Date.parse(printer.downtime.expectedResumeAt) <=
                      Date.now() && <p>{t("queue.printer.resumeElapsed")}</p>}
                  </>
                ) : (
                  t("queue.printer.unknownDowntime")
                )}
              </Notice>
            )}
            {printer?.reason && (
              <p>
                {queue.source === "local-demo" ? (
                  t(printer.reason)
                ) : (
                  <>
                    <strong>{t("queue.shopProvided")}</strong> {printer.reason}
                  </>
                )}
              </p>
            )}
            <p className="pq-muted">
              {t("queue.printer.changedAt", {
                time: date(printer?.changedAt ?? null, intlLocale),
              })}
            </p>
            <p className="pq-muted">{t("queue.printer.noAutomaticProgress")}</p>
          </Card>
          <div className="pq-section-heading">
            <div>
              <h2>{t("queue.requests")}</h2>
              <p>{t("queue.privacy")}</p>
            </div>
            <span className="pq-muted">
              <Clock3 size={15} aria-hidden="true" />{" "}
              {t("queue.asOf", { time: date(queue.observedAt, intlLocale) })}
            </span>
          </div>
          <p className="pq-muted">
            {t(
              queue.source === "local-demo"
                ? "queue.source.local"
                : "queue.source.shared",
            )}
          </p>
          {queue.entries === null && (
            <Notice kind="warning">{t("queue.unknownQueue")}</Notice>
          )}
          {queue.policy && (
            <Notice>
              <strong>{t("queue.policy")}</strong>
              <p>
                {queue.source === "local-demo" ? (
                  t(queue.policy)
                ) : (
                  <>
                    <strong>{t("queue.shopProvided")}</strong> {queue.policy}
                  </>
                )}
              </p>
            </Notice>
          )}
          {visible.length === 0 && (
            <Empty
              title={t("queue.empty.title")}
              action={
                <Link className="pq-button" to={`${basePath}/new`}>
                  {t("queue.newPrint")}
                </Link>
              }
            >
              {t("queue.empty.description")}
            </Empty>
          )}
          <div className="pq-stack">
            {visible.map((job) => {
              const entry = queue.entries?.find(
                (candidate) => candidate.jobId === job.id,
              );
              const optimization = entry?.optimizationChange;
              const active =
                job.status === "queued" || job.status === "printing";
              const position =
                queue.entries === null && active ? null : job.queuePosition;
              const readyAt =
                queue.entries === null && active ? null : job.estimatedPickupAt;
              return (
                <Card key={job.id}>
                  <div className="pq-card-heading">
                    <div>
                      <Link
                        to={`${basePath}/jobs/${encodeURIComponent(job.id)}`}
                      >
                        <h3>{job.documentName}</h3>
                      </Link>
                      <p className="pq-token-small">{job.token}</p>
                    </div>
                    <span className={`pq-status pq-status-${job.status}`}>
                      {t(`queue.status.${job.status}`)}
                    </span>
                  </div>
                  {job.dataOrigin === "demo-fixture" && (
                    <p className="pq-muted">{t("queue.fixture")}</p>
                  )}
                  <dl className="pq-definition-grid">
                    <div>
                      <dt>{t("queue.position")}</dt>
                      <dd>{number(position, intlLocale)}</dd>
                    </div>
                    <div>
                      <dt>{t("queue.jobsAhead")}</dt>
                      <dd>
                        {number(
                          position === null ? null : Math.max(0, position - 1),
                          intlLocale,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("queue.wait")}</dt>
                      <dd>
                        {t("queue.minutes", {
                          value: number(
                            queue.entries === null && active
                              ? null
                              : job.estimatedWaitMinutes,
                            intlLocale,
                          ),
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("queue.duration")}</dt>
                      <dd>
                        {t("queue.minutes", {
                          value: number(
                            job.estimatedDurationMinutes,
                            intlLocale,
                          ),
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("queue.readyAt")}</dt>
                      <dd>{date(readyAt, intlLocale)}</dd>
                    </div>
                    <div>
                      <dt>{t("queue.cost")}</dt>
                      <dd>{money(job.estimatedCost, intlLocale)}</dd>
                    </div>
                    {job.status === "printing" && (
                      <div>
                        <dt>{t("queue.remaining")}</dt>
                        <dd>
                          {t("queue.minutes", {
                            value: number(
                              entry?.remainingMinutes ?? null,
                              intlLocale,
                            ),
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {active && readyAt && Date.parse(readyAt) < Date.now() && (
                    <Notice kind="warning">{t("queue.estimateElapsed")}</Notice>
                  )}
                  {job.status === "ready" && (
                    <Notice kind="success">{t("queue.readyMessage")}</Notice>
                  )}
                  {optimization && (
                    <Notice>
                      <h4>{t("queue.optimization.title")}</h4>
                      <p>{t(`queue.optimization.${optimization.reason}`)}</p>
                      <p>
                        {t("queue.optimization.position", {
                          previous: number(
                            optimization.previousQueuePosition,
                            intlLocale,
                          ),
                          current: number(position, intlLocale),
                        })}
                      </p>
                      <p>
                        {t("queue.optimization.pickup", {
                          previous: date(
                            optimization.previousEstimatedPickupAt,
                            intlLocale,
                          ),
                          current: date(readyAt, intlLocale),
                        })}
                      </p>
                      <p>
                        {t("queue.asOf", {
                          time: date(optimization.occurredAt, intlLocale),
                        })}
                      </p>
                      {optimization.explanation && (
                        <p>
                          {queue.source === "local-demo" ? (
                            t(optimization.explanation)
                          ) : (
                            <>
                              <strong>{t("queue.shopProvided")}</strong>{" "}
                              {optimization.explanation}
                            </>
                          )}
                        </p>
                      )}
                    </Notice>
                  )}
                  <PickupSuggestion job={job} />
                  <UrgentRequest job={job} />
                  <div className="pq-actions">
                    <Link
                      className="pq-button pq-secondary"
                      to={`${basePath}/jobs/${encodeURIComponent(job.id)}`}
                    >
                      {t("queue.details")}
                    </Link>
                    {job.status === "queued" && (
                      <Link
                        className="pq-button pq-secondary"
                        to={`${basePath}/simulate?job=${encodeURIComponent(job.id)}`}
                      >
                        {t("queue.simulate.link")}
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </Page>
  );
}
