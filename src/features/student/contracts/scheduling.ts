import type {
  JobPriority,
  JobStatus,
  PrinterState,
  QuoteInput,
  SnapshotMeta,
  ColorMode,
} from "./jobs";
export type Downtime =
  { kind: "known"; expectedResumeAt: string } | { kind: "unknown" };
export interface PrinterAvailability {
  state: PrinterState | null;
  changedAt: string | null;
  reason: string | null;
  downtime: Downtime | null;
}
export interface PrinterSnapshot extends SnapshotMeta, PrinterAvailability {}
export interface OperatingHours {
  timeZone: string;
  validFrom: string;
  validUntil: string;
  intervals: { opensAt: string; closesAt: string }[];
}
export interface PickupConfig {
  bufferMinutes: number;
  hours: OperatingHours | null;
}
export interface QueueEntry {
  jobId: string;
  status: JobStatus;
  priority: JobPriority;
  estimatedDurationMinutes: number | null;
  remainingMinutes: number | null;
  optimizationChange: {
    occurredAt: string;
    reason: "urgent-approved" | "shorter-jobs-first" | "other";
    previousQueuePosition: number | null;
    previousEstimatedPickupAt: string | null;
    explanation: string | null;
  } | null;
}
export interface QueueSnapshot extends SnapshotMeta {
  entries: QueueEntry[] | null;
  printer: PrinterAvailability;
  pickup: PickupConfig;
  policy: string | null;
  localGeneration: number | null;
}
export type EstimateTarget =
  { kind: "job"; jobId: string } | { kind: "draft"; input: QuoteInput };
export type PickupWindow =
  | { available: true; startsAt: string; endsAt: string }
  | {
      available: false;
      reason: "eta-unavailable" | "outside-known-hours" | "not-applicable";
    };
export interface PickupWindowResult extends SnapshotMeta {
  window: PickupWindow;
}
export interface ShopInsights extends SnapshotMeta {
  shopDisplayName: string | null;
  pendingJobCount: number | null;
  estimatedWorkloadMinutes: number | null;
  printerState: PrinterState | null;
  congestion: { level: "low" | "moderate" | "high"; basis: string } | null;
  lowerCongestionPeriods:
    { startsAt: string; endsAt: string; basis: string }[] | null;
}
export interface UrgentImpact extends SnapshotMeta {
  currentWaitMinutes: number;
  proposedWaitMinutes: number;
  timeSavedMinutes: number;
  affectedJobCount: number;
  currentPickupAt: string;
  proposedPickupAt: string;
  additionalWaitMinutes: { min: number; max: number } | null;
}
export interface WhatIfChanges {
  requestUrgent?: true;
  colorMode?: ColorMode;
  copies?: number;
  printer?: { state: "paused" | "maintenance"; downtime: Downtime };
}
export interface WhatIfRequest {
  target: EstimateTarget;
  snapshotRevision: string;
  changes: WhatIfChanges;
}
export interface ScenarioEstimate {
  queuePosition: number | null;
  estimatedCost: number | null;
  estimatedDurationMinutes: number | null;
  estimatedWaitMinutes: number | null;
  estimatedPickupAt: string | null;
  pickupWindow: PickupWindow;
}
export interface WhatIfResult extends SnapshotMeta {
  baseline: ScenarioEstimate;
  hypothetical: ScenarioEstimate;
  delta: {
    cost: number | null;
    waitMinutes: number | null;
    pickupMinutes: number | null;
  };
  requiresApproval: boolean;
  assumptions: string[];
}
