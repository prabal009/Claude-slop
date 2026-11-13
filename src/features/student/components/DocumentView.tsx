import { useEffect, useState } from "react";
import type { PrintJob } from "../contracts/jobs";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { validateFile, type ValidatedDocument } from "../documents/validation";
import { DocumentPreview } from "../documents/DocumentPreview";
import { useErrorText } from "../hooks/useErrorText";
import { Card, Loading, Notice } from "./ui";

export function DocumentView({ job }: { job: PrintJob }) {
  const { service } = useStudent();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [document, setDocument] = useState<ValidatedDocument | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setPending(true);
    setDocument(null);
    setError(null);
    if (!job.documentId) {
      setPending(false);
      return;
    }
    service
      .getDocument(job.documentId)
      .then(async (blob) => {
        if (
          !blob ||
          !job.originalFileName ||
          blob.size !== job.fileSize ||
          (blob.type &&
            blob.type !== "application/octet-stream" &&
            job.mimeType &&
            blob.type.toLowerCase() !== job.mimeType.toLowerCase())
        )
          throw new Error("documents.unavailable");
        const validated = await validateFile(
          new File([blob], job.originalFileName, {
            type: job.mimeType ?? blob.type,
          }),
        );
        if (active) setDocument(validated);
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [
    service,
    job.documentId,
    job.originalFileName,
    job.fileSize,
    job.mimeType,
    retry,
  ]);
  return (
    <Card>
      <h2>{t("documents.view")}</h2>
      {job.documentLocation === "device" && (
        <Notice>{t("documents.deviceOnly")}</Notice>
      )}
      {job.documentLocation === "shared" && (
        <p className="pq-muted">{t("documents.sharedFile")}</p>
      )}
      {pending ? (
        <Loading label={t("documents.loading")} />
      ) : !job.documentId ? (
        <p>{t("documents.noFile")}</p>
      ) : error ? (
        <Notice kind="warning">
          {errorText(error)}{" "}
          <button
            type="button"
            className="pq-button pq-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("documents.retry")}
          </button>
        </Notice>
      ) : (
        document && <DocumentPreview document={document} />
      )}
    </Card>
  );
}
