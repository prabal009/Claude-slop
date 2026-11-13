import { useEffect, useRef, useState } from "react";
import type { Draft } from "../storage/drafts";
import { validateFile, type ValidatedDocument } from "../documents/validation";
import { qualityCheck } from "../documents/qualityCheck";
import { DocumentPreview } from "../documents/DocumentPreview";
import { useTranslation } from "../i18n/TranslationProvider";
import { useErrorText } from "../hooks/useErrorText";
import { number } from "../utils/format";
import { MAX_NAME_CODE_POINTS } from "../services/config";
import { Notice } from "./ui";

export function DocumentUpload({
  draft,
  onChange,
  onPendingChange,
  onValidityChange,
}: {
  draft: Draft;
  onChange: (fields: Partial<Draft>) => void;
  onPendingChange?: (pending: boolean) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t, intlLocale } = useTranslation();
  const errorText = useErrorText();
  const current = useRef(draft);
  current.current = draft;
  const selection = useRef(0);
  const mounted = useRef(true);
  const [document, setDocument] = useState<ValidatedDocument | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [replacementError, setReplacementError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selection.current++;
    };
  }, []);
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(
    () => () => {
      onPendingChange?.(false);
    },
    [onPendingChange],
  );
  useEffect(() => {
    selection.current++;
    setPending(false);
    setReplacementError(null);
  }, [draft.id, draft.generation]);
  const valid =
    !draft.fileMissing &&
    !fileError &&
    (replacementError === null || draft.file !== null);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);
  useEffect(() => {
    // File objects are immutable; a successful current selection need not be read/decoded again.
    if (draft.file && document?.file === draft.file) return;
    let active = true;
    setDocument(null);
    setFileError(null);
    if (draft.file)
      validateFile(draft.file)
        .then((value) => {
          if (active) setDocument(value);
        })
        .catch((error) => {
          if (active)
            setFileError(
              error && typeof error.messageKey === "string"
                ? error.messageKey
                : "documents.readError",
            );
        });
    return () => {
      active = false;
    };
  }, [draft.file]);
  async function select(file: File) {
    const request = ++selection.current;
    const startingDraft = current.current;
    setPending(true);
    setReplacementError(null);
    try {
      const validated = await validateFile(file);
      if (
        !mounted.current ||
        request !== selection.current ||
        startingDraft.id !== current.current.id ||
        startingDraft.generation !== current.current.generation ||
        current.current.state !== "editing"
      )
        return;
      const previous = current.current;
      const canonicalFile =
        file.type === validated.mimeType
          ? file
          : new File([file], file.name, {
              type: validated.mimeType,
              lastModified: file.lastModified,
            });
      const fields: Partial<Draft> = {
        file: canonicalFile,
        originalFileName: file.name,
        mimeType: validated.mimeType,
        fileSize: file.size,
        fileMissing: false,
        fileVersion: null,
      };
      if (!previous.documentName.trim())
        fields.documentName = [...file.name]
          .slice(0, MAX_NAME_CODE_POINTS)
          .join("");
      if (validated.kind === "image" && previous.pageCountSource !== "manual") {
        fields.pageCount = "1";
        fields.pageCountSource = "image";
      } else if (previous.pageCountSource !== "manual") {
        fields.pageCount = "1";
        fields.pageCountSource = "assumed";
      }
      onChange(fields);
      setDocument({ ...validated, file: canonicalFile });
      setFileError(null);
    } catch (error) {
      if (mounted.current && request === selection.current)
        setReplacementError(error);
    } finally {
      if (mounted.current && request === selection.current) setPending(false);
    }
  }
  const findings = qualityCheck(
    draft,
    document,
    fileError ??
      (replacementError !== null && !draft.file
        ? "documents.rejectedNoFile"
        : null),
  );
  return (
    <section className="pq-upload" aria-label={t("documents.upload")}>
      <label className="pq-label" htmlFor="pq-document-file">
        {t("documents.upload")}
      </label>
      <p id="pq-document-file-help" className="pq-muted">
        {t("documents.formats")}
      </p>
      <input
        id="pq-document-file"
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        aria-describedby="pq-document-file-help"
        disabled={pending || draft.state !== "editing"}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void select(file);
        }}
      />
      {pending && <p role="status">{t("documents.checking")}</p>}
      {replacementError !== null && (
        <Notice kind="error">
          {errorText(replacementError)}{" "}
          <p>
            {t(
              draft.file && !fileError
                ? "documents.previousKept"
                : "documents.rejectedNoFile",
            )}
          </p>
        </Notice>
      )}
      {(draft.file || draft.fileMissing || replacementError !== null) && (
        <>
          {draft.originalFileName && (
            <p className="pq-break">
              {t("documents.fileInfo", {
                name: draft.originalFileName,
                bytes: number(draft.fileSize, intlLocale),
                type: draft.mimeType ?? t("documents.unknown"),
              })}
            </p>
          )}
          <button
            className="pq-button pq-secondary"
            type="button"
            disabled={draft.state !== "editing"}
            onClick={() => {
              selection.current++;
              setPending(false);
              setDocument(null);
              setFileError(null);
              setReplacementError(null);
              onChange({
                file: null,
                fileVersion: null,
                originalFileName: null,
                mimeType: null,
                fileSize: null,
                fileMissing: false,
                ...(draft.pageCountSource === "image"
                  ? { pageCount: "1", pageCountSource: "assumed" as const }
                  : {}),
              });
            }}
          >
            {t(
              draft.file || draft.fileMissing
                ? "documents.remove"
                : "documents.removeAttempt",
            )}
          </button>
        </>
      )}
      {document && <DocumentPreview document={document} />}
      <h3>{t("documents.quality")}</h3>
      <ul className="pq-quality-list">
        {findings.map((finding) => (
          <li key={finding.code} className={`pq-quality-${finding.state}`}>
            <strong>
              {t(
                finding.state === "not-applicable"
                  ? "documents.notApplicable"
                  : `documents.${finding.state}`,
              )}
              :{" "}
            </strong>
            {t(
              finding.messageKey,
              Object.fromEntries(
                Object.entries(finding.params ?? {}).map(([key, value]) => [
                  key,
                  typeof value === "number" ? number(value, intlLocale) : value,
                ]),
              ),
            )}
            {finding.correctionKey && (
              <p className="pq-muted">{t(finding.correctionKey)}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
