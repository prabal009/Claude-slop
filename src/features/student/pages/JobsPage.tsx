import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useStudent } from "../hooks/StudentContext";
import { Card, Empty, Page } from "../components/ui";
import { JobTable, statusMessageKeys } from "../components/JobPieces";
import { useTranslation } from "../i18n/TranslationProvider";

const categories = ["all", "active", "ready", "completed"] as const;
const statuses = ["queued", "printing", "ready", "collected"] as const;
export function JobsPage() {
  const { jobs, basePath } = useStudent();
  const { t, intlLocale } = useTranslation();
  const [params, setParams] = useSearchParams();
  const category =
    categories.find((value) => value === params.get("category")) ?? "all";
  const search = (params.get("q") ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 120);
  const status = statuses.find((value) => value === params.get("status")) ?? "";
  const sort = params.get("sort") === "oldest" ? "oldest" : "newest";
  const change = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const normalizedSearch = search.trim().toLocaleLowerCase(intlLocale);
  const visible = jobs
    .filter(
      (job) =>
        (category === "all" ||
          (category === "active" &&
            (job.status === "queued" || job.status === "printing")) ||
          (category === "ready" && job.status === "ready") ||
          (category === "completed" && job.status === "collected")) &&
        (!status || job.status === status) &&
        (!normalizedSearch ||
          `${job.documentName} ${job.token}`
            .toLocaleLowerCase(intlLocale)
            .includes(normalizedSearch)),
    )
    .sort((a, b) =>
      sort === "oldest"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <Page
      eyebrow={t("presentation.jobsEyebrow")}
      title={t("presentation.jobsTitle")}
      description={t("presentation.jobsDescription")}
      actions={
        <Link className="pq-button" to={`${basePath}/new`}>
          <Plus size={16} aria-hidden="true" />
          {t("presentation.new")}
        </Link>
      }
    >
      <div
        className="pq-tabs"
        role="group"
        aria-label={t("presentation.categories")}
      >
        {categories.map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={category === key}
            className={category === key ? "active" : ""}
            onClick={() => change("category", key)}
          >
            {t(
              `presentation.${key === "active" ? "activeCategory" : key === "ready" ? "readyCategory" : key}`,
            )}
          </button>
        ))}
      </div>
      <Card>
        <div className="pq-filter-bar">
          <div className="pq-field">
            <label htmlFor="pq-search">{t("presentation.search")}</label>
            <input
              id="pq-search"
              maxLength={120}
              value={search}
              onChange={(event) => change("q", event.target.value)}
              placeholder={t("presentation.searchPlaceholder")}
            />
          </div>
          <div className="pq-field">
            <label htmlFor="pq-filter">{t("presentation.status")}</label>
            <select
              id="pq-filter"
              value={status}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="">{t("presentation.allStatuses")}</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {t(statusMessageKeys[value])}
                </option>
              ))}
            </select>
          </div>
          <div className="pq-field">
            <label htmlFor="pq-sort">{t("presentation.sort")}</label>
            <select
              id="pq-sort"
              value={sort}
              onChange={(event) => change("sort", event.target.value)}
            >
              <option value="newest">{t("presentation.newest")}</option>
              <option value="oldest">{t("presentation.oldest")}</option>
            </select>
          </div>
        </div>
        {visible.length ? (
          <JobTable jobs={visible} />
        ) : (
          <Empty
            title={t(
              jobs.length ? "presentation.noMatches" : "presentation.noJobs",
            )}
            action={
              jobs.length ? (
                <button
                  type="button"
                  className="pq-button pq-secondary"
                  onClick={() =>
                    setParams((current) => {
                      const next = new URLSearchParams(current);
                      for (const key of ["category", "q", "status", "sort"])
                        next.delete(key);
                      return next;
                    })
                  }
                >
                  {t("presentation.clearFilters")}
                </button>
              ) : (
                <Link className="pq-button" to={`${basePath}/new`}>
                  {t("presentation.new")}
                </Link>
              )
            }
          >
            {t(
              jobs.length
                ? "presentation.tryFilters"
                : "presentation.noJobsDescription",
            )}
          </Empty>
        )}
      </Card>
    </Page>
  );
}
