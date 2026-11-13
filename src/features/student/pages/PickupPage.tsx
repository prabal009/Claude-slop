import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { useGuide } from "../demo/GuideContext";
import { PickupToken } from "../qr/PickupToken";
import { Empty, Loading, Page } from "../components/ui";

export function PickupPage() {
  const { jobId } = useParams();
  const { jobs, queue, basePath } = useStudent();
  const { t } = useTranslation();
  const guide = useGuide();
  const qrRendered = useCallback(() => {
    if (guide.active && guide.jobId === jobId && !guide.completed.includes(8))
      guide.record(8);
  }, [
    guide.active,
    guide.jobId,
    guide.completed.includes(8),
    guide.record,
    jobId,
  ]);
  if (!queue) return <Loading label={t("documents.loading")} />;
  const job = jobs.find((item) => item.id === jobId);
  if (!job)
    return (
      <Empty
        title={t("documents.notFound")}
        action={<Link to={`${basePath}/jobs`}>{t("documents.backJobs")}</Link>}
      />
    );
  return (
    <Page
      title={t("documents.pickupTitle")}
      actions={
        <Link
          className="pq-button pq-secondary"
          to={`${basePath}/jobs/${job.id}/receipt`}
        >
          {t("documents.viewReceipt")}
        </Link>
      }
    >
      <PickupToken job={job} onQrRendered={qrRendered} />
    </Page>
  );
}
