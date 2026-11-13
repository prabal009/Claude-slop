import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, FilePlus2, Check, Receipt, Sparkles } from "lucide-react";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { useGuide } from "../demo/GuideContext";
import { Card, Empty, Notice, Page } from "../components/ui";
import { StatusBadge } from "../components/JobPieces";
import { DocumentView } from "../components/DocumentView";
import { PickupToken } from "../qr/PickupToken";
import { PickupSuggestion } from "../components/PickupSuggestion";
import { UrgentRequest } from "../urgent/UrgentRequest";
import { money, date, number } from "../utils/format";

export function JobDetailsPage({ success = false }: { success?: boolean }) {
  const { jobId } = useParams();
  const { jobs, basePath, queue } = useStudent();
  const { t, intlLocale } = useTranslation();
  const guide = useGuide();
  const job = jobs.find((item) => item.id === jobId);
  useEffect(() => {
    if (success && job && guide.jobId === job.id) guide.record(7);
  }, [success, job?.id, guide.jobId, guide.record]);
  if (!job)
    return (
      <Page title={t("job.notFoundTitle")}>
        <Empty
          title={t("job.notFound")}
          action={
            <Link className="pq-button" to={`${basePath}/jobs`}>
              {t("common.backJobs")}
            </Link>
          }
        >
          {t("job.notFoundDescription")}
        </Empty>
      </Page>
    );
  const statusIndex = ["queued", "printing", "ready", "collected"].indexOf(
    job.status,
  );
  const jobPath = `${basePath}/jobs/${encodeURIComponent(job.id)}`;
  return (
    <Page
      eyebrow={t(success ? "job.requestSaved" : "job.eyebrow")}
      title={success ? t("job.successTitle") : job.documentName}
      description={t(success ? "job.successDescription" : "job.description")}
      actions={
        <Link className="pq-button pq-secondary" to={`${basePath}/new`}>
          <FilePlus2 size={16} />
          {t("job.newPrint")}
        </Link>
      }
    >
      {success && (
        <div className="pq-success-heading">
          <div className="pq-success-icon">
            <Check size={30} />
          </div>
          <h2>{t("job.submitted")}</h2>
          <p>
            {t(
              job.documentLocation === "device"
                ? "job.deviceFile"
                : job.documentLocation === "shared"
                  ? "job.sharedDelivery"
                  : "job.noFile",
            )}
          </p>
        </div>
      )}
      <div className="pq-two-columns">
        <div>
          <Card>
            <div className="pq-card-heading">
              <h2>{job.documentName}</h2>
              <StatusBadge status={job.status} />
            </div>
            <ol className="pq-timeline" aria-label={t("job.progress")}>
              {["Submitted", "Queued", "Printing", "Ready", "Collected"].map(
                (step, index) => (
                  <li
                    key={step}
                    className={index <= statusIndex + 1 ? "complete" : ""}
                    aria-current={
                      index === statusIndex + 1 ? "step" : undefined
                    }
                  >
                    {t(`job.timeline${step}`)}
                  </li>
                ),
              )}
            </ol>
            <div className="pq-divider" />
            <dl className="pq-definition">
              <dt>{t("job.pagesCopies")}</dt>
              <dd>
                {number(job.pageCount, intlLocale)} /{" "}
                {number(job.copies, intlLocale)}
              </dd>
              <dt>{t("job.mode")}</dt>
              <dd>{t(job.colorMode === "bw" ? "new.bw" : "new.colour")}</dd>
              <dt>{t("job.sidedness")}</dt>
              <dd>
                {t(job.duplex ? "new.doubleSided" : "new.singleSided")} · A4
              </dd>
              <dt>{t("job.pageSource")}</dt>
              <dd>{t(`job.${job.pageCountSource}`)}</dd>
              <dt>{t("job.cost")}</dt>
              <dd>{money(job.estimatedCost, intlLocale)}</dd>
              <dt>{t("job.created")}</dt>
              <dd>{date(job.createdAt, intlLocale)}</dd>
              <dt>{t("job.updated")}</dt>
              <dd>{date(job.updatedAt, intlLocale)}</dd>
              <dt>{t("job.source")}</dt>
              <dd>
                {t(
                  job.dataOrigin === "demo-fixture"
                    ? "common.fixture"
                    : job.dataOrigin === "local-user"
                      ? "common.localRequest"
                      : "common.sharedRecord",
                )}
              </dd>
            </dl>
            {job.instructions && (
              <>
                <div className="pq-divider" />
                <h3>{t("job.instructions")}</h3>
                <p>{job.instructions}</p>
                {queue?.source === "shared" && (
                  <small className="pq-hint">{t("common.sourceShop")}</small>
                )}
              </>
            )}
          </Card>
          <Card>
            <h2>{t("job.queuePickup")}</h2>
            {job.status === "ready" ? (
              <Notice kind="success">{t("job.ready")}</Notice>
            ) : job.status === "collected" ? (
              <Notice kind="success">{t("job.collected")}</Notice>
            ) : null}
            <dl className="pq-definition">
              <dt>{t("job.position")}</dt>
              <dd>{number(job.queuePosition, intlLocale)}</dd>
              <dt>{t("job.ahead")}</dt>
              <dd>
                {job.queuePosition === null
                  ? "—"
                  : number(job.queuePosition - 1, intlLocale)}
              </dd>
              <dt>{t("job.wait")}</dt>
              <dd>
                {t("common.minutes", {
                  value: number(job.estimatedWaitMinutes, intlLocale),
                })}
              </dd>
              <dt>{t("job.processing")}</dt>
              <dd>
                {t("common.minutes", {
                  value: number(job.estimatedDurationMinutes, intlLocale),
                })}
              </dd>
              <dt>{t("job.readyEstimate")}</dt>
              <dd>{date(job.estimatedPickupAt, intlLocale)}</dd>
              <dt>{t("job.asOf")}</dt>
              <dd>{date(queue?.observedAt ?? null, intlLocale)}</dd>
            </dl>
            {job.estimatedPickupAt &&
              Date.parse(job.estimatedPickupAt) < Date.now() &&
              !["ready", "collected"].includes(job.status) && (
                <p className="pq-note">{t("job.elapsed")}</p>
              )}
            <div className="pq-divider" />
            <PickupSuggestion job={job} />
            <div className="pq-actions">
              <Link className="pq-button pq-secondary" to={`${basePath}/queue`}>
                {t("job.openQueue")}
                <ArrowRight size={15} />
              </Link>
              {job.status === "queued" && (
                <Link
                  className="pq-button pq-secondary"
                  to={`${basePath}/simulate?job=${encodeURIComponent(job.id)}`}
                >
                  <Sparkles size={15} />
                  {t("job.simulate")}
                </Link>
              )}
            </div>
          </Card>
          <UrgentRequest job={job} />
          <div id="pq-document">
            <DocumentView job={job} />
          </div>
        </div>
        <aside>
          <PickupToken job={job} />
          <Card>
            <h2>{t("job.receipt")}</h2>
            <p className="pq-note">{t("common.noPayment")}</p>
            <div className="pq-actions">
              <Link className="pq-button pq-wide" to={`${jobPath}/receipt`}>
                <Receipt size={16} />
                {t("job.receipt")}
              </Link>
              <Link
                className="pq-button pq-secondary pq-wide"
                to={`${jobPath}/pickup`}
              >
                {t("job.pickup")}
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
