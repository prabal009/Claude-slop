import { Fragment } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import type { PrintJob, PrintQuote } from "../contracts/jobs";
import { money, date, number } from "../utils/format";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { PRICE_PER_SIDE } from "../services/config";
import { Notice } from "./ui";

export const statusMessageKeys = {
  queued: "presentation.queued",
  printing: "presentation.printing",
  ready: "presentation.ready",
  collected: "presentation.collected",
} as const;

export function StatusBadge({ status }: { status: PrintJob["status"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={`pq-badge ${status === "ready" ? "pq-badge-green" : status === "printing" ? "pq-badge-yellow" : status === "collected" ? "pq-badge-neutral" : ""}`}
    >
      <span className="pq-dot" />
      {t(statusMessageKeys[status])}
    </span>
  );
}

export function JobTable({ jobs }: { jobs: PrintJob[] }) {
  const { basePath } = useStudent();
  const { t, intlLocale } = useTranslation();
  return (
    <div className="pq-table-scroll">
      <table>
        <thead>
          <tr>
            {["document", "status", "cost", "pickup", "details"].map((key) => (
              <th key={key} scope="col">
                {t(`presentation.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const path = `${basePath}/jobs/${encodeURIComponent(job.id)}`;
            return (
              <tr key={job.id}>
                <td>
                  <Link className="pq-job-name" to={path}>
                    <span className="pq-file-icon">
                      <FileText size={18} aria-hidden="true" />
                    </span>
                    <span>
                      {job.documentName}
                      <small>
                        {t("presentation.jobSummary", {
                          pages: number(job.pageCount, intlLocale),
                          copies: number(job.copies, intlLocale),
                          mode: t(`presentation.${job.colorMode}`),
                        })}
                      </small>
                    </span>
                  </Link>
                  <small>
                    {t(
                      `presentation.${job.dataOrigin === "demo-fixture" ? "fixture" : job.dataOrigin === "local-user" ? "localRequest" : "sharedRecord"}`,
                    )}
                  </small>
                  <small>{job.token}</small>
                </td>
                <td>
                  <StatusBadge status={job.status} />
                </td>
                <td>{money(job.estimatedCost, intlLocale)}</td>
                <td>{date(job.estimatedPickupAt, intlLocale)}</td>
                <td>
                  <div className="pq-job-actions">
                    <Link
                      to={path}
                      aria-label={t("presentation.viewDocument", {
                        name: job.documentName,
                      })}
                    >
                      {t("presentation.details")}
                    </Link>
                    <Link to={`${path}/pickup`}>{t("presentation.token")}</Link>
                    <Link to={`${path}/receipt`}>
                      {t("presentation.receipt")}
                    </Link>
                    {job.documentId && (
                      <Link to={`${path}#pq-document`}>
                        {t("presentation.file")}
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QuoteValues({ quote }: { quote: PrintQuote }) {
  const { t, intlLocale } = useTranslation();
  const rows = [
    ["sides", number(quote.printedSides, intlLocale)],
    ["sheets", number(quote.sheets, intlLocale)],
    ["perSide", money(quote.pricePerSide, intlLocale)],
    [
      "processing",
      t("presentation.minutes", {
        value: number(quote.estimatedDurationMinutes, intlLocale),
      }),
    ],
    [
      "wait",
      t("presentation.minutes", {
        value: number(quote.estimatedWaitMinutes, intlLocale),
      }),
    ],
    ["readyEstimate", date(quote.estimatedPickupAt, intlLocale)],
  ];
  return (
    <>
      <dl className="pq-definition">
        {rows.map(([key, value]) => (
          <Fragment key={key}>
            <dt>{t(`presentation.${key}`)}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="pq-divider" />
      <div className="pq-total">
        <span>{t("presentation.total")}</span>
        <strong>{money(quote.estimatedCost, intlLocale)}</strong>
      </div>
      <p className="pq-note">{t("presentation.quoteNote")}</p>
      {quote.estimatedPickupAt !== null &&
        Date.parse(quote.estimatedPickupAt) < Date.now() && (
          <Notice kind="warning">{t("job.elapsed")}</Notice>
        )}
      {quote.source === "shared" && quote.assumptions.length > 0 && (
        <p className="pq-note">{t("presentation.shopText")}</p>
      )}
      {quote.assumptions.length > 0 && (
        <ul className="pq-note">
          {quote.assumptions.map((assumption, index) => (
            <li key={index}>
              {quote.source === "local-demo"
                ? t(assumption, {
                    bw: money(PRICE_PER_SIDE.bw, intlLocale),
                    colour: money(PRICE_PER_SIDE.colour, intlLocale),
                  })
                : assumption}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
