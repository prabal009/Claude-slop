import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStudent, useRevisionRead } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { useErrorText } from "../hooks/useErrorText";
import { Card, Empty, Loading, Notice, Page } from "../components/ui";
import { date, money, number } from "../utils/format";
import { PrintSheet, printSheet } from "./PrintSheet";

export function ReceiptPage() {
  const { jobId } = useParams();
  const { jobs, queue, service, basePath } = useStudent();
  const { t, intlLocale, locale } = useTranslation();
  const errorText = useErrorText();
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const insights = useRevisionRead(() => service.getShopInsights(), [service]);
  if (!queue) return <Loading label={t("documents.loading")} />;
  const job = jobs.find((item) => item.id === jobId);
  if (!job)
    return (
      <Empty
        title={t("documents.notFound")}
        action={<Link to={`${basePath}/jobs`}>{t("documents.backJobs")}</Link>}
      />
    );
  const local = queue.source === "local-demo";
  const shop = local
    ? t("documents.localShop")
    : (insights.value?.shopDisplayName ?? t("documents.shopUnavailable"));
  const values = [
    [t("documents.tokenLabel"), job.token],
    [t("documents.documentName"), job.documentName],
    [t("documents.pages"), number(job.pageCount, intlLocale)],
    [t("documents.copies"), number(job.copies, intlLocale)],
    [t("documents.mode"), t(`documents.${job.colorMode}`)],
    [
      t("documents.sidedness"),
      t(job.duplex ? "documents.duplex" : "documents.simplex"),
    ],
    [
      t("documents.cost"),
      job.estimatedCost === null
        ? t("documents.unknown")
        : money(job.estimatedCost, intlLocale),
    ],
    [t("documents.submitted"), date(job.createdAt, intlLocale)],
    [t("documents.status"), t(`documents.${job.status}`)],
    [
      t("documents.eta"),
      job.estimatedPickupAt === null
        ? t("documents.unknown")
        : date(job.estimatedPickupAt, intlLocale),
    ],
  ];
  const sheet = (
    <PrintSheet>
      <h1>PrintQ</h1>
      <h2>{t("documents.receipt")}</h2>
      <h3>{shop}</h3>
      {!local && insights.value?.shopDisplayName && (
        <p>{t("documents.shopProvided")}</p>
      )}
      <p className="pq-print-disclaimer">{t("documents.disclaimer")}</p>
      <dl className="pq-details">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>{t("documents.pickupInstructions")}</p>
    </PrintSheet>
  );
  async function print() {
    setPrinting(true);
    setError(null);
    try {
      await printSheet(sheet, { title: t("documents.receipt"), lang: locale });
    } catch (reason) {
      setError(reason);
    } finally {
      setPrinting(false);
    }
  }
  return (
    <Page
      title={t("documents.receipt")}
      actions={
        <Link
          className="pq-button pq-secondary"
          to={`${basePath}/jobs/${job.id}`}
        >
          {t("documents.pickupTitle")}
        </Link>
      }
    >
      <Card>{sheet}</Card>
      <Notice>{t("documents.pdfInstructions")}</Notice>
      <div className="pq-actions">
        <button
          type="button"
          className="pq-button"
          disabled={printing}
          onClick={() => void print()}
        >
          {t("documents.printReceipt")}
        </button>
        <button
          type="button"
          className="pq-button pq-secondary"
          disabled={printing}
          onClick={() => void print()}
        >
          {t("documents.savePdf")}
        </button>
      </div>
      {error !== null && <Notice kind="error">{errorText(error)}</Notice>}
    </Page>
  );
}
