import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ArrowRight,
  CheckCheck,
  Clock3,
  FilePlus2,
  Leaf,
  Printer,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useStudent, useRevisionRead } from "../hooks/StudentContext";
import { Card, Empty, Loading, Notice, Page } from "../components/ui";
import { JobTable } from "../components/JobPieces";
import { money, number, date } from "../utils/format";
import { useTranslation } from "../i18n/TranslationProvider";
import { HeroShader, HeroSheets } from "../components/HeroShader";

export function HomePage() {
  const { jobs, basePath, service, queue } = useStudent();
  const { t, intlLocale } = useTranslation();
  const [pointer, setPointer] = useState({ x: 0.72, y: 0.42 });
  const printerState = queue?.printer.state ?? "unknown";
  const printerInterrupted =
    printerState === "paused" || printerState === "maintenance";
  const insights = useRevisionRead(() => service.getShopInsights(), []);
  const active = jobs.filter(
    (job) => job.status === "queued" || job.status === "printing",
  );
  const outstanding = jobs.filter((job) => job.status !== "collected");
  const knownCosts = outstanding
    .map((job) => job.estimatedCost)
    .filter((cost): cost is number => cost !== null && Number.isFinite(cost));
  const cost = knownCosts.reduce((sum, value) => sum + value, 0);
  const partial = knownCosts.length !== outstanding.length;
  const stats = [
    ["active", number(active.length, intlLocale), Clock3, "activeNote"],
    [
      "ready",
      number(jobs.filter((job) => job.status === "ready").length, intlLocale),
      Printer,
      "readyNote",
    ],
    [
      "completed",
      number(
        jobs.filter((job) => job.status === "collected").length,
        intlLocale,
      ),
      CheckCheck,
      "completedNote",
    ],
    [
      "outstanding",
      money(partial && knownCosts.length === 0 ? null : cost, intlLocale),
      Wallet,
      partial ? "partial" : "notBalance",
    ],
  ] as const;
  return (
    <Page
      eyebrow={t("presentation.dashboardEyebrow")}
      title={t("presentation.dashboardTitle")}
      description={t("presentation.dashboardDescription")}
      actions={
        <Link className="pq-button" to={`${basePath}/new`}>
          <FilePlus2 size={16} aria-hidden="true" />
          {t("presentation.new")}
        </Link>
      }
    >
      <div className="pq-grid pq-grid-4">
        {stats.map(([label, value, Icon, note]) => (
          <Card key={label} className="pq-stat">
            <div className="pq-stat-icon">
              <Icon size={19} aria-hidden="true" />
            </div>
            <span className="pq-stat-label">{t(`presentation.${label}`)}</span>
            <strong className="pq-stat-value">{value}</strong>
            <span className="pq-stat-note">{t(`presentation.${note}`)}</span>
          </Card>
        ))}
      </div>
      <Card className="pq-printer-strip">
        <div className="pq-printer-strip-info">
          <span
            className={`pq-dot ${printerInterrupted ? "pq-dot-warning" : "pq-dot-live"}`}
          />
          <span>
            {t(
              printerInterrupted
                ? "presentation.printerStripOutage"
                : "presentation.printerStripReady",
              { state: t(`presentation.${printerState}`) },
            )}
          </span>
        </div>
        <Link to={`${basePath}/queue`}>{t("presentation.track")}</Link>
      </Card>
      <div className="pq-two-columns">
        <div>
          <Card
            className="pq-hero"
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return;
              setPointer({
                x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
              });
            }}
          >
            <HeroShader paused={false} pointer={pointer} />
            <div className="pq-hero-content">
              <h2>{t("presentation.heroTitle")}</h2>
              <p>{t("presentation.heroDescription")}</p>
              <div className="pq-hero-actions">
                <Link className="pq-button" to={`${basePath}/new`}>
                  {t("presentation.start")}{" "}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link className="pq-hero-link" to={`${basePath}/queue`}>
                  {t("presentation.track")}
                </Link>
              </div>
            </div>
            <HeroSheets paused={false} pointer={pointer} />
          </Card>
          <Card>
            <div className="pq-card-heading">
              <h2>{t("presentation.recent")}</h2>
              <Link to={`${basePath}/jobs`}>
                {t("presentation.viewAll")}{" "}
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
            {jobs.length ? (
              <JobTable
                jobs={[...jobs]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 4)}
              />
            ) : (
              <Empty
                title={t("presentation.fresh")}
                action={
                  <Link
                    className="pq-button pq-secondary"
                    to={`${basePath}/new`}
                  >
                    {t("presentation.first")}
                  </Link>
                }
              >
                {t("presentation.emptyDescription")}
              </Empty>
            )}
          </Card>
        </div>
        <div>
          <Card>
            <div className="pq-card-heading">
              <h2>{t("presentation.insights")}</h2>
              <span className="pq-badge">
                <span className="pq-dot" />
                {t(`presentation.${queue?.printer.state ?? "unknown"}`)}
              </span>
            </div>
            {insights.pending ? (
              <Loading label={t("presentation.loading")} />
            ) : insights.error || !insights.value ? (
              <Notice kind="warning">
                {t("presentation.insightError")}{" "}
                <button type="button" onClick={insights.retry}>
                  {t("presentation.retry")}
                </button>
              </Notice>
            ) : (
              <>
                <div className="pq-insight-row">
                  <Clock3 size={19} aria-hidden="true" />
                  <div>
                    <strong>
                      {t("presentation.pending", {
                        count: number(
                          insights.value.pendingJobCount,
                          intlLocale,
                        ),
                      })}
                    </strong>
                    <small>{t("presentation.pendingNote")}</small>
                  </div>
                </div>
                <div className="pq-insight-row">
                  <Printer size={19} aria-hidden="true" />
                  <div>
                    <strong>
                      {t("presentation.workload", {
                        minutes: number(
                          insights.value.estimatedWorkloadMinutes,
                          intlLocale,
                        ),
                      })}
                    </strong>
                    <small>{t("presentation.workloadNote")}</small>
                  </div>
                </div>
                {insights.value.congestion ? (
                  <div>
                    <h3>
                      {t("presentation.congestion")}:{" "}
                      {t(`presentation.${insights.value.congestion.level}`)}
                    </h3>
                    <small>{t("presentation.shopText")}</small>
                    <p className="pq-note">
                      {queue?.source === "shared"
                        ? insights.value.congestion.basis
                        : t(insights.value.congestion.basis)}
                    </p>
                  </div>
                ) : (
                  <p className="pq-note">{t("presentation.noTrends")}</p>
                )}
                {!!insights.value.lowerCongestionPeriods?.length && (
                  <div>
                    <h3>{t("presentation.periods")}</h3>
                    <ul>
                      {insights.value.lowerCongestionPeriods.map(
                        (period, index) => (
                          <li key={index}>
                            {date(period.startsAt, intlLocale)} –{" "}
                            {date(period.endsAt, intlLocale)}
                            <p className="pq-note">
                              {queue?.source === "shared" && (
                                <small>{t("presentation.shopText")}: </small>
                              )}
                              {queue?.source === "shared"
                                ? period.basis
                                : t(period.basis)}
                            </p>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
            <Link
              className="pq-button pq-secondary pq-wide"
              to={`${basePath}/queue#pq-token-lookup`}
            >
              {t("presentation.track")}{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Card>
          <Card>
            <h2 className="pq-inline-heading">
              <Leaf size={20} aria-hidden="true" />
              {t("presentation.ecoTitle")}
            </h2>
            <p className="pq-note">{t("presentation.ecoDescription")}</p>
            <Link to={`${basePath}/ecoprint`}>
              {t("presentation.exploreEco")}{" "}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Card>
        </div>
      </div>
      <div className="pq-grid pq-grid-3">
        {(
          [
            ["estimate", "estimate", "estimateDescription", Receipt],
            ["simulate", "simulate", "simulateDescription", Sparkles],
            ["help", "helpTitle", "helpDescription", FilePlus2],
          ] as const
        ).map(([path, title, description, Icon]) => (
          <Link key={path} className="pq-card" to={`${basePath}/${path}`}>
            <h3 className="pq-inline-heading">
              <Icon size={18} aria-hidden="true" />
              {t(`presentation.${title}`)}
            </h3>
            <p className="pq-note">{t(`presentation.${description}`)}</p>
          </Link>
        ))}
      </div>
    </Page>
  );
}
