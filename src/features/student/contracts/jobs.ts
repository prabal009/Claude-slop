export type JobStatus = "queued" | "printing" | "ready" | "collected";
export type ColorMode = "bw" | "colour";
export type UrgentRequestStatus = "none" | "pending" | "approved" | "rejected";
export type JobPriority = "normal" | "urgent";
export type PaperSize = "A4";
export type PageCountSource = "assumed" | "manual" | "image";
export type PrinterState = "operational" | "paused" | "maintenance" | "resumed";
export interface PrintJob {
  id: string;
  token: string;
  clientRequestId: string;
  documentName: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  copies: number;
  pageCountSource: PageCountSource;
  colorMode: ColorMode;
  paperSize: PaperSize;
  status: JobStatus;
  priority: JobPriority;
  urgentRequestStatus: UrgentRequestStatus;
  duplex: boolean;
  dataOrigin: "local-user" | "demo-fixture" | "shared";
  documentLocation: "none" | "device" | "shared";
  documentId: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  estimatedPickupAt: string | null;
  fileSize: number | null;
  queuePosition: number | null;
  estimatedCost: number | null;
  estimatedDurationMinutes: number | null;
  estimatedWaitMinutes: number | null;
}
export type JobInput = Pick<
  PrintJob,
  | "clientRequestId"
  | "documentName"
  | "pageCount"
  | "pageCountSource"
  | "copies"
  | "colorMode"
  | "duplex"
  | "paperSize"
  | "instructions"
> & { expectedLocalGeneration?: number };
export type QuoteInput = Pick<
  JobInput,
  "pageCount" | "copies" | "colorMode" | "duplex" | "paperSize"
>;
export interface SnapshotMeta {
  revision: string;
  observedAt: string | null;
  lastSyncedAt: string | null;
  source: "local-demo" | "shared";
  stale: boolean;
}
export interface PrintQuote extends SnapshotMeta {
  printedSides: number;
  sheets: number;
  pricePerSide: number | null;
  estimatedCost: number | null;
  estimatedDurationMinutes: number | null;
  estimatedWaitMinutes: number | null;
  estimatedTotalMinutes: number | null;
  estimatedPickupAt: string | null;
  assumptions: string[];
}
