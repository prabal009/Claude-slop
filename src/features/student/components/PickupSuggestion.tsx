import type { PrintJob } from "../contracts/jobs";
import type { PickupWindow } from "../contracts/scheduling";
import { useRevisionRead, useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { date } from "../utils/format";
import { Loading, Notice } from "./ui";

/** A window is supplied by the service; the component never derives one from an ETA. */
export function PickupWindowView({ window }: { window: PickupWindow }) {
  const { t, intlLocale } = useTranslation();
  const { queue } = useStudent();
  const hours = queue?.pickup.hours;
  const format = (value: string) =>
    hours
      ? new Intl.DateTimeFormat(intlLocale, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: hours.timeZone,
        }).format(new Date(value))
      : date(value, intlLocale);

  if (!window.available) {
    return <p>{t(`queue.pickup.${window.reason}`)}</p>;
  }
  return (
    <>
      <p className="pq-token-small">
        {t("queue.pickup.range", {
          start: format(window.startsAt),
          end: format(window.endsAt),
        })}
      </p>
      <p className="pq-muted">{t("queue.pickup.notReservation")}</p>
      <p className="pq-muted">
        {hours
          ? t("queue.pickup.knownHours", { timeZone: hours.timeZone })
          : t("queue.pickup.noHours")}
      </p>
    </>
  );
}

export function PickupSuggestion({ job }: { job: PrintJob }) {
  const { service, queue } = useStudent();
  const { t, intlLocale } = useTranslation();
  const result = useRevisionRead(
    () => service.getPickupWindow({ kind: "job", jobId: job.id }),
    [service, job.id, job.status, job.updatedAt],
  );
  const value =
    result.value?.revision === queue?.revision ? result.value : null;

  return (
    <section aria-label={t("queue.pickup.title")}>
      <h3>{t("queue.pickup.title")}</h3>
      {result.pending && <Loading label={t("queue.loading")} />}
      {!!result.error && (
        <Notice kind="warning">
          <p>{t("queue.pickup.failed")}</p>
          <button
            type="button"
            className="pq-button pq-secondary"
            onClick={result.retry}
          >
            {t("queue.retry")}
          </button>
        </Notice>
      )}
      {value && (
        <>
          {value.stale && <Notice kind="warning">{t("queue.stale")}</Notice>}
          <PickupWindowView window={value.window} />
          <p className="pq-muted">
            {t(
              value.source === "local-demo"
                ? "queue.source.local"
                : "queue.source.shared",
            )}
          </p>
          <p className="pq-muted">
            {t("queue.asOf", { time: date(value.observedAt, intlLocale) })}
          </p>
        </>
      )}
    </section>
  );
}
