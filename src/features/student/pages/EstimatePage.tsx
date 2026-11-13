import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { QuoteInput } from "../contracts/jobs";
import { Card, Loading, Notice, Page } from "../components/ui";
import { useRevisionRead, useStudent } from "../hooks/StudentContext";
import { useErrorText } from "../hooks/useErrorText";
import { useTranslation } from "../i18n/TranslationProvider";
import { MAX_COPIES, MAX_PAGES, PRICE_PER_SIDE } from "../services/config";
import { date, money, number } from "../utils/format";
import { parseIntegerText } from "../utils/validation";

export interface QuoteFields {
  pageCount: string;
  copies: string;
  colorMode: "bw" | "colour";
  duplex: boolean;
}

export function quoteInputFromFields(fields: QuoteFields): QuoteInput | null {
  const pageCount = parseIntegerText(fields.pageCount, MAX_PAGES);
  const copies = parseIntegerText(fields.copies, MAX_COPIES);
  if (
    pageCount === null ||
    copies === null ||
    !["bw", "colour"].includes(fields.colorMode) ||
    typeof fields.duplex !== "boolean"
  )
    return null;
  return {
    pageCount,
    copies,
    colorMode: fields.colorMode,
    duplex: fields.duplex,
    paperSize: "A4",
  };
}

export function QuoteControls({
  value,
  onChange,
}: {
  value: QuoteFields;
  onChange: (value: QuoteFields) => void;
}) {
  const { t, intlLocale } = useTranslation();
  const pagesInvalid = parseIntegerText(value.pageCount, MAX_PAGES) === null;
  const copiesInvalid = parseIntegerText(value.copies, MAX_COPIES) === null;
  return (
    <fieldset className="pq-form-section">
      <legend>{t("queue.estimate.preferences")}</legend>
      <div className="pq-form-grid">
        <div className="pq-field">
          <label htmlFor="pq-estimate-pages">{t("queue.estimate.pages")}</label>
          <input
            id="pq-estimate-pages"
            inputMode="numeric"
            value={value.pageCount}
            aria-invalid={pagesInvalid}
            aria-describedby="pq-estimate-pages-help"
            onChange={(event) =>
              onChange({ ...value, pageCount: event.target.value })
            }
          />
          <small id="pq-estimate-pages-help">
            {t("queue.estimate.pagesHelp", {
              max: number(MAX_PAGES, intlLocale),
            })}
          </small>
        </div>
        <div className="pq-field">
          <label htmlFor="pq-estimate-copies">{t("queue.copies")}</label>
          <input
            id="pq-estimate-copies"
            inputMode="numeric"
            value={value.copies}
            aria-invalid={copiesInvalid}
            aria-describedby="pq-estimate-copies-help"
            onChange={(event) =>
              onChange({ ...value, copies: event.target.value })
            }
          />
          <small id="pq-estimate-copies-help">
            {t("queue.estimate.copiesHelp", {
              max: number(MAX_COPIES, intlLocale),
            })}
          </small>
        </div>
        <div className="pq-field">
          <label htmlFor="pq-estimate-mode">{t("queue.mode")}</label>
          <select
            id="pq-estimate-mode"
            value={value.colorMode}
            onChange={(event) =>
              onChange({
                ...value,
                colorMode: event.target.value === "colour" ? "colour" : "bw",
              })
            }
          >
            <option value="bw">{t("queue.mode.bw")}</option>
            <option value="colour">{t("queue.mode.colour")}</option>
          </select>
        </div>
        <div className="pq-field">
          <label htmlFor="pq-estimate-paper">{t("queue.estimate.paper")}</label>
          <input
            id="pq-estimate-paper"
            value={t("queue.estimate.a4")}
            readOnly
          />
        </div>
      </div>
      <label className="pq-check">
        <input
          type="checkbox"
          checked={value.duplex}
          onChange={(event) =>
            onChange({ ...value, duplex: event.target.checked })
          }
        />
        {t("queue.estimate.duplex")}
      </label>
      <p className="pq-muted">{t("queue.estimate.pageNotice")}</p>
    </fieldset>
  );
}

function QuotePreview({ input }: { input: QuoteInput }) {
  const { service, queue } = useStudent();
  const { t, intlLocale } = useTranslation();
  const errorText = useErrorText();
  const quote = useRevisionRead(
    () => service.getQuote(input),
    [service, input.pageCount, input.copies, input.colorMode, input.duplex],
  );
  const value = quote.value?.revision === queue?.revision ? quote.value : null;
  return (
    <Card>
      <h2>{t("queue.estimate.summary")}</h2>
      {quote.pending && <Loading label={t("queue.estimate.loading")} />}
      {!!quote.error && (
        <Notice kind="warning">
          <p>{errorText(quote.error)}</p>
          <button
            type="button"
            className="pq-button pq-secondary"
            onClick={quote.retry}
          >
            {t("queue.retry")}
          </button>
        </Notice>
      )}
      {value && (
        <>
          {value.stale && <Notice kind="warning">{t("queue.stale")}</Notice>}
          <dl className="pq-definition-grid">
            <div>
              <dt>{t("queue.estimate.sides")}</dt>
              <dd>{number(value.printedSides, intlLocale)}</dd>
            </div>
            <div>
              <dt>{t("queue.estimate.sheets")}</dt>
              <dd>{number(value.sheets, intlLocale)}</dd>
            </div>
            <div>
              <dt>{t("queue.estimate.rate")}</dt>
              <dd>{money(value.pricePerSide, intlLocale)}</dd>
            </div>
            <div>
              <dt>{t("queue.cost")}</dt>
              <dd>{money(value.estimatedCost, intlLocale)}</dd>
            </div>
            <div>
              <dt>{t("queue.duration")}</dt>
              <dd>
                {t("queue.minutes", {
                  value: number(value.estimatedDurationMinutes, intlLocale),
                })}
              </dd>
            </div>
            <div>
              <dt>{t("queue.wait")}</dt>
              <dd>
                {t("queue.minutes", {
                  value: number(value.estimatedWaitMinutes, intlLocale),
                })}
              </dd>
            </div>
            <div>
              <dt>{t("queue.estimate.total")}</dt>
              <dd>
                {t("queue.minutes", {
                  value: number(value.estimatedTotalMinutes, intlLocale),
                })}
              </dd>
            </div>
            <div>
              <dt>{t("queue.readyAt")}</dt>
              <dd>{date(value.estimatedPickupAt, intlLocale)}</dd>
            </div>
          </dl>
          <p className="pq-muted">
            {t("queue.asOf", { time: date(value.observedAt, intlLocale) })}
          </p>
          <p>
            {t(
              value.source === "local-demo"
                ? "queue.source.local"
                : "queue.source.shared",
            )}
          </p>
          {value.source === "shared" && value.assumptions.length > 0 && (
            <p>
              <strong>{t("queue.shopProvided")}</strong>
            </p>
          )}
          <ul>
            {value.assumptions.map((assumption, index) => (
              <li key={`${index}:${assumption}`}>
                {value.source === "local-demo"
                  ? t(assumption, {
                      bw: money(PRICE_PER_SIDE.bw, intlLocale),
                      colour: money(PRICE_PER_SIDE.colour, intlLocale),
                    })
                  : assumption}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function EstimatePage() {
  const { repository, basePath } = useStudent();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [fields, setFields] = useState<QuoteFields>({
    pageCount: "1",
    copies: "1",
    colorMode: "bw",
    duplex: false,
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const lock = useRef(false);
  const input = quoteInputFromFields(fields);

  async function usePreferences() {
    if (!input || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      if (repository) {
        const draft = await repository.createDraft({
          pageCount: String(input.pageCount),
          copies: String(input.copies),
          pageCountSource: "manual",
          colorMode: input.colorMode,
          duplex: input.duplex,
          paperSize: "A4",
        });
        navigate(`${basePath}/new?draft=${encodeURIComponent(draft.id)}`);
      } else {
        const preferences = new URLSearchParams({
          from: "estimate",
          pages: String(input.pageCount),
          copies: String(input.copies),
          mode: input.colorMode,
          duplex: input.duplex ? "1" : "0",
        });
        navigate(`${basePath}/new?${preferences.toString()}`);
      }
    } catch (error) {
      setFailure(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Page
      eyebrow={t("queue.estimate.eyebrow")}
      title={t("queue.estimate.title")}
      description={t("queue.estimate.description")}
      actions={
        <Link className="pq-button pq-secondary" to={`${basePath}/queue`}>
          {t("queue.title")}
        </Link>
      }
    >
      <div className="pq-two-column">
        <Card>
          <QuoteControls value={fields} onChange={setFields} />
          {!input && (
            <Notice kind="warning">{t("queue.estimate.invalid")}</Notice>
          )}
          <p>{t("queue.estimate.noSubmission")}</p>
          {!!failure && <Notice kind="error">{errorText(failure)}</Notice>}
          <button
            type="button"
            className="pq-button"
            disabled={!input || busy}
            onClick={() => void usePreferences()}
          >
            {t(busy ? "queue.estimate.creating" : "queue.estimate.use")}
          </button>
        </Card>
        {input && (
          <QuotePreview
            key={`${input.pageCount}:${input.copies}:${input.colorMode}:${input.duplex}`}
            input={input}
          />
        )}
      </div>
    </Page>
  );
}
