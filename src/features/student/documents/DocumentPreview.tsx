import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/TranslationProvider";
import { Notice } from "../components/ui";
import type { ValidatedDocument } from "./validation";
import {
  MAX_IMAGE_PREVIEW_EDGE,
  MAX_IMAGE_PREVIEW_PIXELS,
} from "../services/config";
import { number } from "../utils/format";

export function DocumentPreview({
  document: file,
}: {
  document: ValidatedDocument;
}) {
  const { t, intlLocale } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setImageFailed(false);
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(
        new Blob([file.file], { type: file.mimeType }),
      );
      setUrl(objectUrl);
    } catch {
      setUrl(null);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, retry]);
  if (!url)
    return (
      <Notice kind="warning">
        {t("documents.unavailable")}{" "}
        <button
          type="button"
          className="pq-button pq-secondary"
          onClick={() => setRetry((value) => value + 1)}
        >
          {t("documents.retry")}
        </button>
      </Notice>
    );
  const imageSafe =
    !file.previewUnavailable &&
    Number.isInteger(file.width) &&
    Number.isInteger(file.height) &&
    file.width! > 0 &&
    file.height! > 0 &&
    file.width! <= MAX_IMAGE_PREVIEW_EDGE &&
    file.height! <= MAX_IMAGE_PREVIEW_EDGE &&
    file.width! * file.height! <= MAX_IMAGE_PREVIEW_PIXELS;
  return (
    <div className="pq-document-preview">
      {file.kind === "image" && imageSafe && !imageFailed && (
        <img
          src={url}
          alt={t("documents.previewTitle")}
          onError={() => setImageFailed(true)}
          className="pq-preview-image"
        />
      )}
      {file.kind === "image" && !imageSafe && (
        <Notice kind="warning">
          {t(
            `documents.preview.${file.previewUnavailable ?? "dimensions-unavailable"}`,
            {
              maxPixels: number(MAX_IMAGE_PREVIEW_PIXELS, intlLocale),
              maxEdge: number(MAX_IMAGE_PREVIEW_EDGE, intlLocale),
            },
          )}
        </Notice>
      )}
      {file.kind === "image" && imageFailed && (
        <Notice kind="warning">
          {t("documents.decodeUnavailable")}{" "}
          <button
            type="button"
            className="pq-button pq-secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("documents.retry")}
          </button>
        </Notice>
      )}
      {file.kind === "pdf" && (
        <>
          <Notice>{t("documents.pdfPreview")}</Notice>
          <iframe
            src={url}
            title={t("documents.previewTitle")}
            sandbox=""
            referrerPolicy="no-referrer"
            className="pq-preview-frame"
          />
        </>
      )}
      {file.kind === "office" && (
        <Notice>{t("documents.officePreview")}</Notice>
      )}
      <a
        className="pq-button pq-secondary"
        href={url}
        download={file.file.name}
      >
        {t("documents.download")}
      </a>
    </div>
  );
}
