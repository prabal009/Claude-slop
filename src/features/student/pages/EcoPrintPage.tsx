import { useState } from "react";
import { Leaf } from "lucide-react";
import { Card, Notice, Page } from "../components/ui";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import {
  calculateEcoComparison,
  summarizeEcoSavings,
} from "../ecoprint/calculations";
import { parseIntegerText } from "../utils/validation";
import { MAX_COPIES, MAX_PAGES } from "../services/config";
import { number } from "../utils/format";

export function EcoPrintPage() {
  const { jobs } = useStudent();
  const { t, intlLocale } = useTranslation();
  const [pagesText, setPagesText] = useState("3");
  const [copiesText, setCopiesText] = useState("2");
  const pages = parseIntegerText(pagesText, MAX_PAGES);
  const copies = parseIntegerText(copiesText, MAX_COPIES);
  const comparison =
    pages !== null && copies !== null
      ? calculateEcoComparison(pages, copies)
      : null;
  const recorded = summarizeEcoSavings(jobs);
  return (
    <Page
      eyebrow={t("presentation.ecoEyebrow")}
      title={t("presentation.ecoPageTitle")}
      description={t("presentation.ecoPageDescription")}
    >
      <div className="pq-two-columns">
        <Card>
          <h2>{t("presentation.compare")}</h2>
          <div className="pq-grid pq-grid-2">
            <div className="pq-field">
              <label htmlFor="pq-eco-pages">{t("presentation.pages")}</label>
              <input
                id="pq-eco-pages"
                inputMode="numeric"
                value={pagesText}
                aria-invalid={pages === null}
                aria-describedby={pages === null ? "pq-eco-error" : undefined}
                onChange={(event) => setPagesText(event.target.value)}
              />
            </div>
            <div className="pq-field">
              <label htmlFor="pq-eco-copies">{t("presentation.copies")}</label>
              <input
                id="pq-eco-copies"
                inputMode="numeric"
                value={copiesText}
                aria-invalid={copies === null}
                aria-describedby={copies === null ? "pq-eco-error" : undefined}
                onChange={(event) => setCopiesText(event.target.value)}
              />
            </div>
          </div>
          {comparison ? (
            <dl className="pq-definition" aria-live="polite">
              <dt>{t("presentation.simplex")}</dt>
              <dd>{number(comparison.simplexSheets, intlLocale)}</dd>
              <dt>{t("presentation.duplex")}</dt>
              <dd>{number(comparison.duplexSheets, intlLocale)}</dd>
              <dt>{t("presentation.saved")}</dt>
              <dd>{number(comparison.savedSheets, intlLocale)}</dd>
            </dl>
          ) : (
            <div id="pq-eco-error">
              <Notice kind="error">
                {t("presentation.ecoInvalid", {
                  pages: number(MAX_PAGES, intlLocale),
                  copies: number(MAX_COPIES, intlLocale),
                })}
              </Notice>
            </div>
          )}
          <p className="pq-note">{t("presentation.ecoMath")}</p>
        </Card>
        <Card>
          <Leaf size={26} aria-hidden="true" />
          <h2>{t("presentation.recorded")}</h2>
          <strong className="pq-stat-value">
            {number(recorded.savedSheets, intlLocale)}
          </strong>
          <p>{t("presentation.recordedNote")}</p>
          <p className="pq-note">
            {t("presentation.ecoCounts", {
              included: number(recorded.included, intlLocale),
              omitted: number(recorded.omitted, intlLocale),
            })}
          </p>
          <p className="pq-note">
            {t("presentation.ecoSources", {
              assumed: number(recorded.assumed, intlLocale),
              fixtures: number(recorded.fixtures, intlLocale),
            })}
          </p>
          <p className="pq-note">{t("presentation.ecoDataset")}</p>
        </Card>
      </div>
    </Page>
  );
}
