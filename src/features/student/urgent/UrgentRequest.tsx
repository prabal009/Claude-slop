import { useEffect, useRef, useState } from "react";
import type { PrintJob } from "../contracts/jobs";
import { Loading, Modal, Notice } from "../components/ui";
import { useRevisionRead, useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { useGuide } from "../demo/GuideContext";
import { useErrorText } from "../hooks/useErrorText";
import { date, number } from "../utils/format";

function UrgentConfirmation({
  jobId,
  onClose,
  onRequested,
}: {
  jobId: string;
  onClose: () => void;
  onRequested: (job: PrintJob) => void;
}) {
  const { service, jobs, queue, connection } = useStudent();
  const { t, intlLocale } = useTranslation();
  const guide = useGuide();
  const errorText = useErrorText();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const lock = useRef(false);
  const current = jobs.find((candidate) => candidate.id === jobId);
  const eligible =
    current?.status === "queued" &&
    current.urgentRequestStatus === "none" &&
    !!queue;
  const disconnected =
    connection.mode === "shared" && connection.state !== "connected";
  const impact = useRevisionRead(
    () =>
      eligible ? service.getUrgentImpactPreview(jobId) : Promise.resolve(null),
    [service, jobId, eligible],
  );
  const value =
    impact.value?.revision === queue?.revision ? impact.value : null;
  const cannotSend =
    submitting ||
    !eligible ||
    disconnected ||
    !!queue?.stale ||
    impact.pending ||
    !!value?.stale;
  useEffect(() => {
    if (!impact.pending && guide.active && guide.jobId === jobId)
      guide.record(10, jobId);
  }, [
    impact.pending,
    value,
    impact.error,
    guide.active,
    guide.jobId,
    guide.record,
    jobId,
  ]);

  async function confirm() {
    if (lock.current || cannotSend) return;
    lock.current = true;
    setSubmitting(true);
    setFailed(null);
    try {
      const requested = await service.requestUrgent(jobId);
      if (
        requested.urgentRequestStatus === "pending" &&
        guide.active &&
        guide.jobId === jobId
      )
        guide.record(11, jobId);
      onRequested(requested);
    } catch (error) {
      setFailed(error);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={t("queue.urgent.title")}
      closeLabel={t("queue.cancel")}
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <p>{t("queue.urgent.fairness")}</p>
      <p>{t("queue.urgent.noPromise")}</p>
      {!eligible && (
        <Notice kind="warning">{t("queue.urgent.ineligible")}</Notice>
      )}
      {(disconnected || queue?.stale) && (
        <Notice kind="warning">{t("queue.urgent.connectionRequired")}</Notice>
      )}
      {impact.pending && <Loading label={t("queue.urgent.loading")} />}
      {!impact.pending && (!value || !!impact.error) && (
        <Notice kind="warning">{t("queue.urgent.unavailable")}</Notice>
      )}
      {value && !value.stale && (
        <dl className="pq-definition-grid">
          <div>
            <dt>{t("queue.urgent.currentWait")}</dt>
            <dd>
              {t("queue.minutes", {
                value: number(value.currentWaitMinutes, intlLocale),
              })}
            </dd>
          </div>
          <div>
            <dt>{t("queue.urgent.proposedWait")}</dt>
            <dd>
              {t("queue.minutes", {
                value: number(value.proposedWaitMinutes, intlLocale),
              })}
            </dd>
          </div>
          <div>
            <dt>{t("queue.urgent.timeSaved")}</dt>
            <dd>
              {t("queue.minutes", {
                value: number(value.timeSavedMinutes, intlLocale),
              })}
            </dd>
          </div>
          <div>
            <dt>{t("queue.urgent.affected")}</dt>
            <dd>{number(value.affectedJobCount, intlLocale)}</dd>
          </div>
          <div>
            <dt>{t("queue.urgent.currentReady")}</dt>
            <dd>{date(value.currentPickupAt, intlLocale)}</dd>
          </div>
          <div>
            <dt>{t("queue.urgent.proposedReady")}</dt>
            <dd>{date(value.proposedPickupAt, intlLocale)}</dd>
          </div>
          <div>
            <dt>{t("queue.urgent.additionalWait")}</dt>
            <dd>
              {value.additionalWaitMinutes
                ? t("queue.urgent.waitRange", {
                    min: number(value.additionalWaitMinutes.min, intlLocale),
                    max: number(value.additionalWaitMinutes.max, intlLocale),
                  })
                : t("queue.unavailable")}
            </dd>
          </div>
        </dl>
      )}
      {value?.stale && <Notice kind="warning">{t("queue.stale")}</Notice>}
      {!!failed && <Notice kind="error">{errorText(failed)}</Notice>}
      <button
        type="button"
        className="pq-button"
        disabled={cannotSend}
        onClick={() => void confirm()}
      >
        {t(submitting ? "queue.urgent.submitting" : "queue.urgent.confirm")}
      </button>
    </Modal>
  );
}

export function UrgentRequest({ job }: { job: PrintJob }) {
  const { jobs, queue } = useStudent();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const current = jobs.find((candidate) => candidate.id === job.id) ?? job;
  const eligible =
    current.status === "queued" &&
    current.urgentRequestStatus === "none" &&
    !!queue &&
    jobs.some((candidate) => candidate.id === job.id) &&
    submittedJobId !== job.id;

  return (
    <section aria-label={t("queue.urgent.section")}>
      {(current.urgentRequestStatus === "pending" ||
        (current.urgentRequestStatus === "none" &&
          submittedJobId === job.id)) && (
        <Notice>{t("queue.urgent.pending")}</Notice>
      )}
      {current.urgentRequestStatus === "approved" && (
        <Notice kind="success">{t("queue.urgent.approved")}</Notice>
      )}
      {current.urgentRequestStatus === "rejected" && (
        <Notice kind="warning">{t("queue.urgent.rejected")}</Notice>
      )}
      {eligible && (
        <button
          type="button"
          className="pq-button pq-secondary"
          onClick={() => setOpen(true)}
        >
          {t("queue.urgent.request")}
        </button>
      )}
      {open && (
        <UrgentConfirmation
          key={job.id}
          jobId={job.id}
          onClose={() => setOpen(false)}
          onRequested={(requested) => {
            if (requested.urgentRequestStatus === "pending")
              setSubmittedJobId(job.id);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}
