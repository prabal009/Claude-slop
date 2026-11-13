import type { Draft } from "../storage/drafts";
import { validateRawFields } from "../utils/validation";
import {
  MAX_IMAGE_PREVIEW_EDGE,
  MAX_IMAGE_PREVIEW_PIXELS,
} from "../services/config";
import type { ValidatedDocument } from "./validation";
export interface QualityFinding {
  code: string;
  state: "pass" | "warning" | "error" | "not-applicable";
  messageKey: string;
  correctionKey?: string;
  params?: Record<string, string | number>;
}
/** Findings describe only checks actually performed; signatures do not establish safety. */
export function qualityCheck(
  draft: Draft,
  document: ValidatedDocument | null,
  fileError?: string | null,
): QualityFinding[] {
  const findings: QualityFinding[] = validateRawFields(draft).errors.map(
    (issue) => ({
      code: issue.code,
      state: "error",
      messageKey: issue.messageKey,
      correctionKey: "documents.correctFields",
      params: issue.params,
    }),
  );
  if (!findings.length)
    findings.push({
      code: "fields",
      state: "pass",
      messageKey: "documents.fieldsValid",
    });
  if (draft.fileMissing)
    findings.push({
      code: "missing",
      state: "error",
      messageKey: "documents.missing",
      correctionKey: "documents.reattach",
    });
  else if (fileError)
    findings.push({
      code: "file",
      state: "error",
      messageKey: fileError,
      correctionKey: "documents.replace",
    });
  else if (!draft.file)
    findings.push({
      code: "nameOnly",
      state: "pass",
      messageKey: "documents.nameOnly",
    });
  else if (!document)
    findings.push({
      code: "checking",
      state: "warning",
      messageKey: "documents.checking",
    });
  else {
    findings.push({
      code: "format",
      state: "pass",
      messageKey: "documents.formatValid",
      params: { format: document.extension.toUpperCase() },
    });
    findings.push({
      code: "size",
      state: "pass",
      messageKey: "documents.sizeValid",
    });
    if (document.kind === "pdf")
      findings.push({
        code: "pdfAnalysis",
        state: "warning",
        messageKey: "documents.pdfLimits",
        correctionKey: "documents.verifyOriginal",
      });
    if (document.kind === "office")
      findings.push({
        code: "preview",
        state: "warning",
        messageKey: "documents.officePreview",
        correctionKey: "documents.verifyOriginal",
      });
    if (document.kind === "image") {
      if (!document.previewUnavailable && document.width && document.height) {
        const dpi = Math.floor(
          Math.min(document.width / 8.27, document.height / 11.69),
        );
        findings.push({
          code: "resolution",
          state: dpi < 150 ? "warning" : "pass",
          messageKey: "documents.resolution",
          correctionKey: dpi < 150 ? "documents.higherResolution" : undefined,
          params: { width: document.width, height: document.height, dpi },
        });
      } else
        findings.push({
          code: "decode",
          state: "warning",
          messageKey: `documents.preview.${document.previewUnavailable ?? "dimensions-unavailable"}`,
          correctionKey: "documents.verifyOriginal",
          params: {
            maxPixels: MAX_IMAGE_PREVIEW_PIXELS,
            maxEdge: MAX_IMAGE_PREVIEW_EDGE,
          },
        });
    }
  }
  findings.push({
    code: "pages",
    state: draft.pageCountSource === "assumed" ? "warning" : "pass",
    messageKey:
      draft.pageCountSource === "assumed"
        ? "documents.assumedPages"
        : draft.pageCountSource === "image"
          ? "documents.imagePage"
          : "documents.manualPages",
    correctionKey:
      draft.pageCountSource === "image" ? undefined : "documents.verifyPages",
  });
  findings.push({
    code: "malware",
    state: "not-applicable",
    messageKey: "documents.noScan",
  });
  return findings;
}
