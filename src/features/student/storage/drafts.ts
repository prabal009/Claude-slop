import type { RawPrintFields } from "../utils/validation";
/** Raw editing strings are persisted without numeric coercion. Save the returned revision after every save. */
export interface Draft extends RawPrintFields {
  id: string;
  clientRequestId: string;
  generation: number;
  revision: number;
  state: "editing" | "submitting" | "committed";
  committedJobId: string | null;
  updatedAt: string;
  file: File | null;
  fileVersion: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fileMissing: boolean;
}
export type StoredDraft = Omit<Draft, "file">;
