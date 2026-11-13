import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Download, Play, Sparkles } from "lucide-react";
import { useStudent } from "../hooks/StudentContext";
import { useErrorText } from "../hooks/useErrorText";
import { useTranslation } from "../i18n/TranslationProvider";
import { useGuide } from "../demo/GuideContext";
import { DEMO_DOCUMENT_URL } from "../demo/fixtures";
import { Card, Modal, Notice, Page } from "../components/ui";
import { number } from "../utils/format";
export function DemoPage() {
  const { demoController, jobs, queue, basePath } = useStudent();
  const { t, intlLocale } = useTranslation();
  const errorText = useErrorText();
  const guide = useGuide();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"reset" | "clear" | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const enabled = queue?.source === "local-demo" && !!demoController;
  const fixtureJobs = jobs.filter(
    (job) => job.dataOrigin === "demo-fixture" || job.id === guide.jobId,
  );
  const currentJob =
    fixtureJobs.find((job) => job.id === selected) ??
    fixtureJobs.find((job) => job.id === guide.jobId) ??
    fixtureJobs[0];
  const sampleJob = jobs.find(
    (job) => job.dataOrigin === "demo-fixture" && job.documentId,
  );
  async function act(action: () => Promise<void>, success = "demo.actionDone") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!enabled) return;
    await act(async () => {
      await demoController!.loadFixtures();
      guide.start();
      navigate(basePath);
    });
  }
  const targetPath = guide.jobId
    ? `${basePath}/jobs/${encodeURIComponent(guide.jobId)}`
    : `${basePath}/jobs`;
  const stepPaths = [
    basePath,
    `${basePath}/new`,
    `${basePath}/new`,
    `${basePath}/new`,
    `${basePath}/new`,
    `${basePath}/new`,
    guide.jobId ? `${targetPath}/success` : targetPath,
    guide.jobId ? `${targetPath}/pickup` : targetPath,
    `${basePath}/queue`,
    targetPath,
    targetPath,
    targetPath,
  ];
  return (
    <Page
      eyebrow={t("demo.eyebrow")}
      title={t("demo.title")}
      description={t("demo.description")}
      actions={
        enabled ? (
          <button
            className="pq-button"
            disabled={busy}
            onClick={() => void start()}
          >
            <Play size={16} />
            {t("demo.start")}
          </button>
        ) : undefined
      }
    >
      {!enabled ? (
        <Notice kind="warning">{t("demo.sharedDisabled")}</Notice>
      ) : (
        <>
          <Notice>{t("demo.localOnly")}</Notice>
          {Boolean(error) && <Notice kind="error">{errorText(error)}</Notice>}
          {message && <Notice kind="success">{t(message)}</Notice>}
          <div className="pq-two-columns">
            <Card>
              <div className="pq-card-heading">
                <h2>{t("demo.journey")}</h2>
                <span className="pq-badge">
                  <Sparkles size={13} />
                  {t("demo.progress", {
                    count: number(guide.completed.length, intlLocale),
                  })}
                </span>
              </div>
              <div
                className="pq-progress"
                role="progressbar"
                aria-label={t("demo.journey")}
                aria-valuemin={0}
                aria-valuemax={12}
                aria-valuenow={guide.completed.length}
              >
                <span
                  style={{ width: `${(guide.completed.length / 12) * 100}%` }}
                />
              </div>
              <p className="pq-note">{t("demo.observed")}</p>
              <ol className="pq-step-list">
                {Array.from({ length: 12 }, (_, index) => (
                  <li
                    key={index}
                    data-complete={guide.completed.includes(index + 1)}
                  >
                    <Link to={stepPaths[index]}>
                      {t(`demo.step${index + 1}`)}
                    </Link>
                    {guide.completed.includes(index + 1) && (
                      <Check size={16} aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
            </Card>
            <aside>
              <Card>
                <h2>{t("demo.sample")}</h2>
                <p className="pq-note">{t("demo.localOnly")}</p>
                <div className="pq-actions">
                  <a
                    className="pq-button pq-secondary pq-wide"
                    href={DEMO_DOCUMENT_URL}
                    download="campus-print-guide.pdf"
                  >
                    <Download size={16} />
                    {t("demo.sample")}
                  </a>
                  <button
                    className="pq-button pq-wide"
                    disabled={busy}
                    onClick={() =>
                      void act(() => demoController!.loadFixtures())
                    }
                  >
                    {t("demo.load")}
                  </button>
                  {sampleJob && (
                    <Link
                      className="pq-button pq-secondary pq-wide"
                      to={`${basePath}/jobs/${encodeURIComponent(sampleJob.id)}`}
                    >
                      {t("demo.previewSample")}
                      <ArrowRight size={15} />
                    </Link>
                  )}
                </div>
              </Card>
              <Card>
                <h2>{t("demo.fixturesPanel")}</h2>
                <p className="pq-note">{t("demo.fixturesExplanation")}</p>
                {currentJob ? (
                  <>
                    <div className="pq-field">
                      <label htmlFor="pq-fixture-job">
                        {t("demo.currentJob")}
                      </label>
                      <select
                        id="pq-fixture-job"
                        value={currentJob.id}
                        onChange={(event) => setSelected(event.target.value)}
                      >
                        {fixtureJobs.map((job) => (
                          <option value={job.id} key={job.id}>
                            {job.documentName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="pq-actions">
                      <button
                        className="pq-button pq-secondary pq-wide"
                        disabled={
                          busy ||
                          currentJob.status === "collected" ||
                          (currentJob.status === "queued" &&
                            (queue?.entries?.[0]?.jobId !== currentJob.id ||
                              jobs.some((job) => job.status === "printing")))
                        }
                        onClick={() =>
                          void act(() =>
                            demoController!.advanceJob(currentJob.id),
                          )
                        }
                      >
                        {t("demo.advance")}
                      </button>
                      {currentJob.status === "queued" &&
                        currentJob.urgentRequestStatus === "pending" && (
                          <>
                            <button
                              className="pq-button pq-secondary pq-wide"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  demoController!.resolveUrgency(
                                    currentJob.id,
                                    "approved",
                                  ),
                                )
                              }
                            >
                              {t("demo.approve")}
                            </button>
                            <button
                              className="pq-button pq-secondary pq-wide"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  demoController!.resolveUrgency(
                                    currentJob.id,
                                    "rejected",
                                  ),
                                )
                              }
                            >
                              {t("demo.reject")}
                            </button>
                          </>
                        )}
                    </div>
                  </>
                ) : (
                  <p className="pq-note">{t("demo.noFixture")}</p>
                )}
                <div className="pq-divider" />
                <div className="pq-actions">
                  {(
                    [
                      ["known-maintenance", "demo.knownMaintenance"],
                      ["unknown-maintenance", "demo.unknownMaintenance"],
                      ["resumed", "demo.resume"],
                    ] as const
                  ).map(([scenario, key]) => (
                    <button
                      key={scenario}
                      className="pq-button pq-secondary pq-wide"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          demoController!.setPrinterScenario(scenario),
                        )
                      }
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </Card>
              <Card>
                <h2>{t("demo.reset")}</h2>
                <p className="pq-note">{t("demo.resetScope")}</p>
                <div className="pq-actions">
                  <button
                    className="pq-button pq-secondary"
                    disabled={busy}
                    onClick={() => setConfirmation("reset")}
                  >
                    {t("demo.reset")}
                  </button>
                  <button
                    className="pq-button pq-danger"
                    disabled={busy}
                    onClick={() => setConfirmation("clear")}
                  >
                    {t("demo.clear")}
                  </button>
                </div>
              </Card>
            </aside>
          </div>
        </>
      )}
      {confirmation && (
        <Modal
          title={t(
            confirmation === "reset" ? "demo.resetTitle" : "demo.clearTitle",
          )}
          closeLabel={t("common.cancel")}
          onClose={() => {
            if (!busy) {
              setConfirmation(null);
              setMessage("demo.cancelled");
            }
          }}
        >
          <p>
            {t(
              confirmation === "reset" ? "demo.resetScope" : "demo.clearScope",
            )}
          </p>
          <div className="pq-actions">
            <button
              className="pq-button pq-danger"
              disabled={busy}
              onClick={() => {
                const choice = confirmation;
                void act(async () => {
                  if (choice === "reset") await demoController!.resetDemo();
                  else await demoController!.clearLocalData();
                  setConfirmation(null);
                  setSelected("");
                }, "demo.done");
              }}
            >
              {t(
                confirmation === "reset"
                  ? "demo.confirmReset"
                  : "demo.confirmClear",
              )}
            </button>
          </div>
        </Modal>
      )}
    </Page>
  );
}
