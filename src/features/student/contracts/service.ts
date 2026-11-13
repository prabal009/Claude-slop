import type { JobInput, PrintJob, PrintQuote, QuoteInput } from "./jobs";
import type {
  EstimateTarget,
  PickupWindowResult,
  PrinterSnapshot,
  QueueSnapshot,
  ShopInsights,
  UrgentImpact,
  WhatIfRequest,
  WhatIfResult,
} from "./scheduling";
export interface Diagnostic {
  code: "CORRUPT_LOCAL_RECORD" | "LOCAL_CACHE_UNAVAILABLE";
  messageKey: string;
}
export type ServiceEvent =
  | { type: "snapshot-changed"; jobs: PrintJob[]; queue: QueueSnapshot }
  | {
      type: "connection-changed";
      mode: "local-demo" | "shared";
      state: "local-ready" | "connected" | "disconnected" | "unavailable";
      lastSyncedAt: string | null;
    }
  | { type: "diagnostics-changed"; diagnostics: Diagnostic[] };
export interface StudentService {
  createJob(input: JobInput, file?: File): Promise<PrintJob>;
  getJobs(): Promise<PrintJob[]>;
  getJobById(id: string): Promise<PrintJob | null>;
  getQuote(input: QuoteInput): Promise<PrintQuote>;
  getQueueSnapshot(): Promise<QueueSnapshot>;
  getPrinterStatus(): Promise<PrinterSnapshot>;
  getPickupWindow(target: EstimateTarget): Promise<PickupWindowResult>;
  getUrgentImpactPreview(jobId: string): Promise<UrgentImpact | null>;
  requestUrgent(jobId: string): Promise<PrintJob>;
  getDocument(documentId: string): Promise<Blob | null>;
  getShopInsights(): Promise<ShopInsights>;
  simulateWhatIf(request: WhatIfRequest): Promise<WhatIfResult | null>;
  subscribeToJobUpdates(callback: (event: ServiceEvent) => void): () => void;
}
export interface StudentDemoController {
  loadFixtures(): Promise<void>;
  advanceJob(jobId: string): Promise<void>;
  resolveUrgency(jobId: string, result: "approved" | "rejected"): Promise<void>;
  setPrinterScenario(
    scenario: "known-maintenance" | "unknown-maintenance" | "resumed",
  ): Promise<void>;
  resetDemo(): Promise<void>;
  clearLocalData(): Promise<void>;
}
