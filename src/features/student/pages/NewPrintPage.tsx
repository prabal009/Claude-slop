import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, FileText, Printer, Sparkles } from "lucide-react";
import { useStudent, useRevisionRead } from "../hooks/StudentContext";
import { useDraft } from "../hooks/useDraft";
import { useErrorText } from "../hooks/useErrorText";
import { useTranslation } from "../i18n/TranslationProvider";
import { useGuide } from "../demo/GuideContext";
import { Card, Loading, Notice, Page } from "../components/ui";
import { QuoteValues } from "../components/JobPieces";
import { DocumentUpload } from "../components/DocumentUpload";
import {
  parseIntegerText,
  validateRawFields,
  type ValidationIssue,
} from "../utils/validation";
import {
  MAX_COPIES,
  MAX_PAGES,
  MAX_INSTRUCTIONS_CODE_POINTS,
  PRICE_PER_SIDE,
} from "../services/config";
import { money, number } from "../utils/format";

export function NewPrintPage() {
  const { service, basePath, repository, queue } = useStudent();
  const {
    draft,
    update,
    flush,
    fresh,
    markCommitted,
    error,
    setError,
    saving,
    persistenceWarning,
  } = useDraft();
  const { t, intlLocale } = useTranslation();
  const errorText = useErrorText();
  const guide = useGuide();
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [filePending, setFilePending] = useState(false);
  const [fileValid, setFileValid] = useState(true);
  const pending = useRef(false);
  const navigate = useNavigate();
  const copies = parseIntegerText(draft?.copies ?? "", MAX_COPIES);
  const pages = parseIntegerText(draft?.pageCount ?? "", MAX_PAGES);
  const quote = useRevisionRead(
    () =>
      copies && pages && draft
        ? service.getQuote({
            copies,
            pageCount: pages,
            colorMode: draft.colorMode,
            duplex: draft.duplex,
            paperSize: "A4",
          })
        : Promise.resolve(null),
    [copies, pages, draft?.colorMode, draft?.duplex],
  );
  useEffect(() => {
    if (
      quote.value &&
      draft?.documentName.trim() &&
      guide.completed.includes(4)
    )
      guide.record(5);
  }, [
    quote.value,
    draft?.documentName,
    guide.completed.includes(4),
    guide.record,
  ]);
  const firstError = (field: string) =>
    issues.find((issue) => issue.field === field);
  const fieldError = (field: string) => {
    const issue = firstError(field);
    return issue ? (
      <span className="pq-field-error" id={`pq-${field}-error`}>
        {errorText(issue)}
      </span>
    ) : null;
  };
  function edit(fields: Parameters<typeof update>[0]) {
    update(fields);
    setIssues((current) => current.filter((issue) => !(issue.field in fields)));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || pending.current || filePending || !fileValid) return;
    const result = validateRawFields(draft);
    setIssues(result.errors);
    if (!result.input) {
      requestAnimationFrame(() =>
        document.getElementById(`pq-${result.errors[0]?.field}`)?.focus(),
      );
      return;
    }
    if (draft.fileMissing) {
      setError(new Error("errors.reattachFile"));
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      update({ state: "submitting" });
      const saved = await flush();
      const job = await service.createJob(
        {
          ...result.input,
          clientRequestId: saved.clientRequestId,
          ...((queue?.source === "local-demo" && queue.localGeneration !== null) ||
          !!repository
            ? { expectedLocalGeneration: saved.generation }
            : {}),
        },
        saved.file ?? undefined,
      );
      markCommitted(job.id);
      guide.record(6, job.id);
      navigate(`${basePath}/jobs/${encodeURIComponent(job.id)}/success`);
    } catch (reason) {
      update({ state: "editing" });
      setError(reason);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const startFresh = () => void fresh().catch(setError);
  if (!draft)
    return error ? (
      <Page title={t("new.title")}>
        <Notice kind="error">{errorText(error)}</Notice>
        <button className="pq-button" onClick={startFresh}>
          {t("common.startFresh")}
        </button>
      </Page>
    ) : (
      <Loading label={t("new.recovering")} />
    );
  if (draft.state === "committed")
    return (
      <Page title={t("new.alreadyTitle")}>
        <Notice kind="success">{t("new.alreadySaved")}</Notice>
        <div className="pq-actions">
          <Link
            className="pq-button"
            to={`${basePath}/jobs/${encodeURIComponent(draft.committedJobId ?? "")}/success`}
          >
            {t("new.openAck")}
          </Link>
          <button className="pq-button pq-secondary" onClick={startFresh}>
            {t("new.startNew")}
          </button>
        </div>
      </Page>
    );
  return (
    <Page
      eyebrow={t("new.eyebrow")}
      title={t("new.title")}
      description={t("new.description")}
    >
      <form onSubmit={submit} noValidate className="pq-two-columns">
        <fieldset className="pq-form-fields" disabled={busy}>
          {Boolean(error) && (
            <Notice kind="error">
              {errorText(error)}{" "}
              <button type="button" onClick={startFresh}>
                {t("common.startFresh")}
              </button>
            </Notice>
          )}
          {persistenceWarning && (
            <Notice kind="warning">{t("new.sessionWarning")}</Notice>
          )}
          {!repository && (
            <Notice kind="warning">{t("new.sharedDraft")}</Notice>
          )}
          <Card>
            <div className="pq-card-heading">
              <h2>{t("new.documentSection")}</h2>
              <span className="pq-badge pq-badge-neutral">
                <FileText size={12} />
                {t("new.nameOnly")}
              </span>
            </div>
            <div className="pq-field">
              <label htmlFor="pq-documentName">
                {t("new.documentName")} <span aria-hidden="true">*</span>
              </label>
              <input
                id="pq-documentName"
                value={draft.documentName}
                onChange={(event) => {
                  edit({ documentName: event.target.value });
                  if (event.target.value.trim()) guide.record(3);
                }}
                placeholder={t("new.namePlaceholder")}
                autoComplete="off"
                aria-invalid={!!firstError("documentName")}
                aria-describedby={
                  firstError("documentName")
                    ? "pq-documentName-error"
                    : "pq-name-hint"
                }
              />
              {fieldError("documentName")}
              <small id="pq-name-hint">{t("new.nameHint")}</small>
            </div>
            <DocumentUpload
              draft={draft}
              onChange={edit}
              onPendingChange={setFilePending}
              onValidityChange={setFileValid}
            />
          </Card>
          <Card>
            <h2>{t("new.preferencesSection")}</h2>
            <div className="pq-grid">
              <div className="pq-field">
                <label htmlFor="pq-copies">{t("new.copies")}</label>
                <div className="pq-stepper">
                  <button
                    type="button"
                    aria-label={t("new.decrease")}
                    disabled={!copies || copies <= 1}
                    onClick={() => {
                      edit({ copies: String(Math.max(1, (copies ?? 1) - 1)) });
                      guide.record("copies");
                    }}
                  >
                    −
                  </button>
                  <input
                    id="pq-copies"
                    inputMode="numeric"
                    value={draft.copies}
                    onChange={(event) => {
                      edit({ copies: event.target.value });
                      guide.record("copies");
                    }}
                    aria-invalid={!!firstError("copies")}
                    aria-describedby={
                      firstError("copies") ? "pq-copies-error" : undefined
                    }
                  />
                  <button
                    type="button"
                    aria-label={t("new.increase")}
                    disabled={!copies || copies >= MAX_COPIES}
                    onClick={() => {
                      edit({
                        copies: String(Math.min(MAX_COPIES, (copies ?? 1) + 1)),
                      });
                      guide.record("copies");
                    }}
                  >
                    +
                  </button>
                </div>
                {fieldError("copies")}
              </div>
              <div className="pq-field">
                <label htmlFor="pq-pageCount">{t("new.pages")}</label>
                <input
                  id="pq-pageCount"
                  inputMode="numeric"
                  value={draft.pageCount}
                  onChange={(event) =>
                    edit({
                      pageCount: event.target.value,
                      pageCountSource: "manual",
                    })
                  }
                  aria-invalid={!!firstError("pageCount")}
                  aria-describedby={
                    firstError("pageCount")
                      ? "pq-pageCount-error"
                      : "pq-pages-note"
                  }
                />
                {fieldError("pageCount")}
                <small id="pq-pages-note">
                  {t(
                    draft.pageCountSource === "assumed"
                      ? "new.assumed"
                      : draft.pageCountSource === "image"
                        ? "new.imagePages"
                        : "new.manual",
                  )}
                </small>
              </div>
            </div>
            <fieldset className="pq-field pq-fieldset">
              <legend>{t("new.mode")}</legend>
              <div className="pq-mode-grid">
                {(["bw", "colour"] as const).map((mode) => (
                  <label className="pq-mode" key={mode}>
                    <input
                      type="radio"
                      name="colorMode"
                      checked={draft.colorMode === mode}
                      onChange={() => {
                        edit({ colorMode: mode });
                        guide.record("mode");
                      }}
                    />
                    <span>
                      <strong>{t(`new.${mode}`)}</strong>
                      <small>
                        {t("new.perSide", {
                          price: money(PRICE_PER_SIDE[mode], intlLocale),
                        })}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="pq-grid">
              <div className="pq-field">
                <label className="pq-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.duplex}
                    onChange={(event) => edit({ duplex: event.target.checked })}
                  />
                  {t("new.duplex")}
                </label>
                <small>{t("new.duplexHint")}</small>
              </div>
              <div className="pq-field">
                <label htmlFor="pq-paperSize">{t("new.paper")}</label>
                <select id="pq-paperSize" value="A4" disabled>
                  <option>A4</option>
                </select>
                <small>{t("new.paperHint")}</small>
              </div>
            </div>
            <div className="pq-field">
              <label htmlFor="pq-instructions">
                {t("new.instructions")}{" "}
                <span className="pq-hint">{t("common.optional")}</span>
              </label>
              <textarea
                id="pq-instructions"
                value={draft.instructions}
                onChange={(event) => edit({ instructions: event.target.value })}
                placeholder={t("new.instructionsPlaceholder")}
                aria-invalid={!!firstError("instructions")}
                aria-describedby={
                  firstError("instructions")
                    ? "pq-instructions-error"
                    : undefined
                }
              />
              {fieldError("instructions")}
              <small>
                {t("new.characterCount", {
                  count: number([...draft.instructions].length, intlLocale),
                  max: number(MAX_INSTRUCTIONS_CODE_POINTS, intlLocale),
                })}
              </small>
            </div>
          </Card>
        </fieldset>
        <aside className="pq-summary">
          <Card>
            <div className="pq-card-heading">
              <h2>{t("new.summary")}</h2>
              <Printer size={20} />
            </div>
            <p className="pq-note">
              {draft.documentName || t("new.yourDocument")}
              <br />
              A4 · {t(
                draft.duplex ? "new.doubleSided" : "new.singleSided",
              )} · {t(draft.file ? "new.attached" : "new.noFile")}
            </p>
            <div className="pq-divider" />
            {quote.pending ? (
              <Loading label={t("new.updating")} />
            ) : quote.error ? (
              <Notice kind="warning">
                {errorText(quote.error)}
                <button type="button" onClick={quote.retry}>
                  {t("new.retryEstimate")}
                </button>
              </Notice>
            ) : quote.value ? (
              <QuoteValues quote={quote.value} />
            ) : (
              <Notice kind="warning">{t("new.invalidQuote")}</Notice>
            )}
            <button
              className="pq-button pq-wide"
              disabled={busy || filePending || !fileValid}
              type="submit"
            >
              {t(busy ? "new.submitting" : "new.submit")}
              <ArrowRight size={16} />
            </button>
            <small className="pq-hint">
              {t(
                saving
                  ? "new.savingDraft"
                  : repository
                    ? "new.savedDraft"
                    : "new.memoryDraft",
              )}
            </small>
            <button
              type="button"
              disabled={busy || filePending || !fileValid}
              className="pq-button pq-secondary pq-wide"
              style={{ marginTop: 12 }}
              onClick={() =>
                void flush()
                  .then((saved) =>
                    navigate(
                      `${basePath}/simulate?draft=${encodeURIComponent(saved.id)}`,
                    ),
                  )
                  .catch(setError)
              }
            >
              <Sparkles size={15} />
              {t("new.simulate")}
            </button>
          </Card>
          <Notice>
            <Check size={15} />
            {t("common.noPayment")}
          </Notice>
        </aside>
      </form>
    </Page>
  );
}
