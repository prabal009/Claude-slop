import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { QuoteInput } from "../contracts/jobs";
import type {
  EstimateTarget,
  ScenarioEstimate,
  WhatIfChanges,
  WhatIfRequest,
} from "../contracts/scheduling";
import type { Draft } from "../storage/drafts";
import { Card, Empty, Loading, Notice, Page } from "../components/ui";
import { PickupWindowView } from "../components/PickupSuggestion";
import { useRevisionRead, useStudent } from "../hooks/StudentContext";
import { useErrorText } from "../hooks/useErrorText";
import { useTranslation } from "../i18n/TranslationProvider";
import { MAX_COPIES, PRICE_PER_SIDE } from "../services/config";
import { date, money, number } from "../utils/format";
import { parseIntegerText, validateRawFields } from "../utils/validation";

function ScenarioValues({
  title,
  value,
}: {
  title: string;
  value: ScenarioEstimate;
}) {
  const { t, intlLocale } = useTranslation();
  return (
    <Card aria-label={title}>
      <h2>{title}</h2>
      <dl className="pq-definition-grid">
        <div>
          <dt>{t("queue.position")}</dt>
          <dd>{number(value.queuePosition, intlLocale)}</dd>
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
          <dt>{t("queue.readyAt")}</dt>
          <dd>{date(value.estimatedPickupAt, intlLocale)}</dd>
        </div>
      </dl>
      <h3>{t("queue.pickup.title")}</h3>
      <PickupWindowView window={value.pickupWindow} />
    </Card>
  );
}

function SimulationResult({ request }: { request: WhatIfRequest }) {
  const { service, queue } = useStudent();
  const { t, intlLocale } = useTranslation();
  const errorText = useErrorText();
  const simulation = useRevisionRead(() => {
    if (!queue || request.snapshotRevision !== queue.revision)
      return Promise.resolve(null);
    return service.simulateWhatIf(request);
  }, [service, request]);
  const value =
    simulation.value?.revision === queue?.revision ? simulation.value : null;
  if (request.snapshotRevision !== queue?.revision)
    return <Notice kind="warning">{t("queue.simulate.refreshNeeded")}</Notice>;
  return (
    <>
      {simulation.pending && <Loading label={t("queue.simulate.loading")} />}
      {!!simulation.error && (
        <Notice kind="warning">
          <p>{errorText(simulation.error)}</p>
          <p>{t("queue.simulate.refreshNeeded")}</p>
          <button
            type="button"
            className="pq-button pq-secondary"
            onClick={simulation.retry}
          >
            {t("queue.retry")}
          </button>
        </Notice>
      )}
      {!simulation.pending && !simulation.error && !value && (
        <Notice kind="warning">{t("queue.simulate.unavailable")}</Notice>
      )}
      {value && (
        <>
          {value.stale && <Notice kind="warning">{t("queue.stale")}</Notice>}
          <div className="pq-two-column">
            <ScenarioValues
              title={t("queue.simulate.baseline")}
              value={value.baseline}
            />
            <ScenarioValues
              title={t("queue.simulate.hypothetical")}
              value={value.hypothetical}
            />
          </div>
          <Card>
            <h2>{t("queue.simulate.deltas")}</h2>
            <p>{t("queue.simulate.deltaExplanation")}</p>
            <dl className="pq-definition-grid">
              <div>
                <dt>{t("queue.simulate.costDelta")}</dt>
                <dd>{money(value.delta.cost, intlLocale)}</dd>
              </div>
              <div>
                <dt>{t("queue.simulate.waitDelta")}</dt>
                <dd>
                  {t("queue.minutes", {
                    value: number(value.delta.waitMinutes, intlLocale),
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("queue.simulate.pickupDelta")}</dt>
                <dd>
                  {t("queue.minutes", {
                    value: number(value.delta.pickupMinutes, intlLocale),
                  })}
                </dd>
              </div>
            </dl>
            {value.requiresApproval && (
              <Notice kind="warning">{t("queue.simulate.approval")}</Notice>
            )}
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
          </Card>
        </>
      )}
    </>
  );
}

export function SimulatorPage() {
  const { jobs, queue, repository, basePath } = useStudent();
  const { t, intlLocale } = useTranslation();
  const errorText = useErrorText();
  const [params] = useSearchParams();
  const requestedJob = params.get("job");
  const requestedDraft = params.get("draft");
  const [selection, setSelection] = useState(() =>
    requestedJob
      ? `job:${requestedJob}`
      : requestedDraft
        ? `draft:${requestedDraft}`
        : "",
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftPending, setDraftPending] = useState(!!repository);
  const [draftFailure, setDraftFailure] = useState<unknown>(null);
  const [mode, setMode] = useState<"bw" | "colour">("bw");
  const [copies, setCopies] = useState("1");
  const [urgent, setUrgent] = useState(false);
  const [printer, setPrinter] = useState<"keep" | "paused" | "maintenance">(
    "keep",
  );
  const [downtime, setDowntime] = useState<"known" | "unknown">("known");
  const [minutes, setMinutes] = useState("10");
  const [request, setRequest] = useState<WhatIfRequest | null>(null);
  const [run, setRun] = useState(0);
  const queued = jobs.filter((job) => job.status === "queued");

  useEffect(() => {
    let active = true;
    setDraft(null);
    setDraftFailure(null);
    if (!repository) {
      setDraftPending(false);
      return;
    }
    setDraftPending(true);
    void (async () => {
      let id = requestedDraft;
      if (!id) {
        try {
          id = sessionStorage.getItem("printq.student.draftId");
        } catch {
          /* An inaccessible optional pointer is not permission to create a draft. */
        }
      }
      if (!id) return null;
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new Error("errors.invalidDraft");
      const existing = await repository.getDraft(id);
      if (
        !existing ||
        existing.state !== "editing" ||
        existing.fileMissing ||
        !validateRawFields(existing).input ||
        (queue?.localGeneration != null &&
          existing.generation !== queue.localGeneration)
      )
        return null;
      return existing;
    })()
      .then((value) => {
        if (active) setDraft(value);
      })
      .catch((error) => {
        if (active) setDraftFailure(error);
      })
      .finally(() => {
        if (active) setDraftPending(false);
      });
    return () => {
      active = false;
    };
  }, [repository, requestedDraft, queue?.localGeneration, queue?.revision]);

  const selectedJob = selection.startsWith("job:")
    ? queued.find((job) => `job:${job.id}` === selection)
    : undefined;
  const selectedDraft =
    draft && selection === `draft:${draft.id}` ? draft : null;
  const canPreviewUrgency =
    !!selectedDraft || selectedJob?.urgentRequestStatus === "none";
  const input: QuoteInput | null = selectedJob
    ? {
        pageCount: selectedJob.pageCount,
        copies: selectedJob.copies,
        colorMode: selectedJob.colorMode,
        duplex: selectedJob.duplex,
        paperSize: selectedJob.paperSize,
      }
    : selectedDraft
      ? {
          pageCount: Number(selectedDraft.pageCount),
          copies: Number(selectedDraft.copies),
          colorMode: selectedDraft.colorMode,
          duplex: selectedDraft.duplex,
          paperSize: selectedDraft.paperSize,
        }
      : null;

  useEffect(() => {
    if (!selection && !draftPending)
      setSelection(
        draft ? `draft:${draft.id}` : queued[0] ? `job:${queued[0].id}` : "",
      );
  }, [selection, draftPending, draft?.id, queued[0]?.id]);
  useEffect(() => {
    setMode(input?.colorMode ?? "bw");
    setCopies(String(input?.copies ?? 1));
    setUrgent(false);
    setPrinter("keep");
    setRequest(null);
  }, [
    selection,
    selectedDraft?.revision,
    selectedJob?.copies,
    selectedJob?.colorMode,
  ]);
  useEffect(() => {
    if (!canPreviewUrgency) setUrgent(false);
  }, [canPreviewUrgency]);

  const copyCount = parseIntegerText(copies, MAX_COPIES);
  const duration = /^[0-9]+(?:\.[0-9]+)?$/.test(minutes)
    ? Number(minutes)
    : NaN;
  const minutesValid =
    Number.isFinite(duration) &&
    duration > 0 &&
    duration * 60_000 <= Number.MAX_SAFE_INTEGER;
  const snapshotTime = queue?.observedAt ? Date.parse(queue.observedAt) : NaN;
  const resumeTime = snapshotTime + duration * 60_000;
  const validKnownOutage =
    minutesValid &&
    Number.isFinite(snapshotTime) &&
    Number.isFinite(resumeTime) &&
    Math.abs(resumeTime) <= 8_640_000_000_000_000;
  const valid =
    !!input &&
    copyCount !== null &&
    (printer === "keep" || downtime === "unknown" || validKnownOutage);
  const target: EstimateTarget | null = selectedJob
    ? { kind: "job", jobId: selectedJob.id }
    : input
      ? { kind: "draft", input }
      : null;
  const controlsKey = JSON.stringify([
    selection,
    mode,
    copies,
    canPreviewUrgency && urgent,
    printer,
    downtime,
    minutes,
  ]);
  const [submittedControls, setSubmittedControls] = useState("");

  function simulate() {
    if (!valid || !target || !queue || copyCount === null) return;
    const changes: WhatIfChanges = {
      colorMode: mode,
      copies: copyCount,
      ...(canPreviewUrgency && urgent ? { requestUrgent: true } : {}),
    };
    if (printer !== "keep")
      changes.printer = {
        state: printer,
        downtime:
          downtime === "unknown"
            ? { kind: "unknown" }
            : {
                kind: "known",
                expectedResumeAt: new Date(resumeTime).toISOString(),
              },
      };
    setRequest({ target, snapshotRevision: queue.revision, changes });
    setSubmittedControls(controlsKey);
    setRun((value) => value + 1);
  }

  return (
    <Page
      eyebrow={t("queue.simulate.eyebrow")}
      title={t("queue.simulate.title")}
      description={t("queue.simulate.description")}
      actions={
        <>
          <Link className="pq-button pq-secondary" to={`${basePath}/queue`}>
            {t("queue.title")}
          </Link>
          <Link className="pq-button pq-secondary" to={`${basePath}/estimate`}>
            {t("queue.estimate.link")}
          </Link>
        </>
      }
    >
      <Notice>{t("queue.simulate.only")}</Notice>
      <p>{t("queue.simulate.approval")}</p>
      {!queue && <Loading label={t("queue.loading")} />}
      {queue?.stale && <Notice kind="warning">{t("queue.stale")}</Notice>}
      {draftPending && <Loading label={t("queue.simulate.draftLoading")} />}
      {!!draftFailure && (
        <Notice kind="warning">{errorText(draftFailure)}</Notice>
      )}
      {requestedDraft && !draftPending && !draft && (
        <Notice kind="warning">{t("queue.simulate.draftUnavailable")}</Notice>
      )}
      {!draftPending && queued.length === 0 && !draft && (
        <Empty
          title={t("queue.simulate.empty")}
          action={
            <Link className="pq-button" to={`${basePath}/new`}>
              {t("queue.newPrint")}
            </Link>
          }
        >
          {t("queue.simulate.noDraftCreation")}
        </Empty>
      )}
      {(queued.length > 0 || draft) && (
        <Card>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              simulate();
            }}
          >
            <div className="pq-field">
              <label htmlFor="pq-simulation-target">
                {t("queue.simulate.target")}
              </label>
              <select
                id="pq-simulation-target"
                value={selection}
                onChange={(event) => setSelection(event.target.value)}
              >
                <option value="">{t("queue.simulate.choose")}</option>
                {draft && (
                  <option value={`draft:${draft.id}`}>
                    {t("queue.simulate.currentDraft")}
                  </option>
                )}
                {queued.map((job) => (
                  <option key={job.id} value={`job:${job.id}`}>
                    {job.token}
                  </option>
                ))}
              </select>
            </div>
            {!input && (
              <Notice kind="warning">
                {t("queue.simulate.targetUnavailable")}
              </Notice>
            )}
            {selectedDraft && <p>{t("queue.simulate.draftReadOnly")}</p>}
            <div className="pq-form-grid">
              <div className="pq-field">
                <label htmlFor="pq-simulation-mode">{t("queue.mode")}</label>
                <select
                  id="pq-simulation-mode"
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value === "colour" ? "colour" : "bw")
                  }
                >
                  <option value="bw">{t("queue.mode.bw")}</option>
                  <option value="colour">{t("queue.mode.colour")}</option>
                </select>
              </div>
              <div className="pq-field">
                <label htmlFor="pq-simulation-copies">
                  {t("queue.copies")}
                </label>
                <input
                  id="pq-simulation-copies"
                  inputMode="numeric"
                  value={copies}
                  aria-invalid={copyCount === null}
                  aria-describedby="pq-simulation-copies-help"
                  onChange={(event) => setCopies(event.target.value)}
                />
                <small id="pq-simulation-copies-help">
                  {t("queue.estimate.copiesHelp", {
                    max: number(MAX_COPIES, intlLocale),
                  })}
                </small>
              </div>
            </div>
            {canPreviewUrgency && (
              <label className="pq-check">
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(event) => setUrgent(event.target.checked)}
                />
                {t("queue.simulate.urgent")}
              </label>
            )}
            <div className="pq-form-grid">
              <div className="pq-field">
                <label htmlFor="pq-simulation-printer">
                  {t("queue.simulate.printer")}
                </label>
                <select
                  id="pq-simulation-printer"
                  value={printer}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPrinter(
                      value === "paused" || value === "maintenance"
                        ? value
                        : "keep",
                    );
                  }}
                >
                  <option value="keep">
                    {t("queue.simulate.keepPrinter")}
                  </option>
                  <option value="paused">{t("queue.printer.paused")}</option>
                  <option value="maintenance">
                    {t("queue.printer.maintenance")}
                  </option>
                </select>
              </div>
              {printer !== "keep" && (
                <>
                  <div className="pq-field">
                    <label htmlFor="pq-simulation-downtime">
                      {t("queue.simulate.recovery")}
                    </label>
                    <select
                      id="pq-simulation-downtime"
                      value={downtime}
                      onChange={(event) =>
                        setDowntime(
                          event.target.value === "unknown"
                            ? "unknown"
                            : "known",
                        )
                      }
                    >
                      <option value="known">{t("queue.simulate.known")}</option>
                      <option value="unknown">
                        {t("queue.simulate.unknown")}
                      </option>
                    </select>
                  </div>
                  {downtime === "known" && (
                    <div className="pq-field">
                      <label htmlFor="pq-simulation-minutes">
                        {t("queue.simulate.minutes")}
                      </label>
                      <input
                        id="pq-simulation-minutes"
                        inputMode="decimal"
                        value={minutes}
                        aria-invalid={!validKnownOutage}
                        aria-describedby="pq-simulation-minutes-help"
                        onChange={(event) => setMinutes(event.target.value)}
                      />
                      <small id="pq-simulation-minutes-help">
                        {t("queue.simulate.minutesHelp")}
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>
            <button
              className="pq-button"
              type="submit"
              disabled={!valid || !queue || !!queue.stale}
            >
              {t("queue.simulate.run")}
            </button>
            {request && submittedControls !== controlsKey && (
              <p role="status">{t("queue.simulate.controlsChanged")}</p>
            )}
          </form>
        </Card>
      )}
      {request && submittedControls === controlsKey && (
        <SimulationResult key={run} request={request} />
      )}
    </Page>
  );
}
