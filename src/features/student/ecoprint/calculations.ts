import { calculatePrintEstimate } from "../pricing/calculations";
import { isRecord } from "../utils/validation";

export function calculateEcoComparison(pageCount: number, copies: number) {
  const input = {
    pageCount,
    copies,
    colorMode: "bw" as const,
    paperSize: "A4" as const,
  };
  const simplexSheets = calculatePrintEstimate({
    ...input,
    duplex: false,
  }).sheets;
  const duplexSheets = calculatePrintEstimate({
    ...input,
    duplex: true,
  }).sheets;
  return {
    simplexSheets,
    duplexSheets,
    savedSheets: simplexSheets - duplexSheets,
  };
}

export interface EcoSavingsSummary {
  savedSheets: number;
  included: number;
  omitted: number;
  assumed: number;
  fixtures: number;
}

/** Count only valid request data, across all four recorded statuses, without inferring consumption. */
export function summarizeEcoSavings(
  jobs: readonly unknown[],
): EcoSavingsSummary {
  const result: EcoSavingsSummary = {
    savedSheets: 0,
    included: 0,
    omitted: 0,
    assumed: 0,
    fixtures: 0,
  };
  for (const job of jobs) {
    if (
      !isRecord(job) ||
      typeof job.status !== "string" ||
      !["queued", "printing", "ready", "collected"].includes(job.status) ||
      typeof job.pageCount !== "number" ||
      typeof job.copies !== "number" ||
      typeof job.duplex !== "boolean" ||
      (job.colorMode !== "bw" && job.colorMode !== "colour") ||
      job.paperSize !== "A4" ||
      typeof job.pageCountSource !== "string" ||
      !["assumed", "manual", "image"].includes(job.pageCountSource) ||
      typeof job.dataOrigin !== "string" ||
      !["local-user", "demo-fixture", "shared"].includes(job.dataOrigin)
    ) {
      result.omitted++;
      continue;
    }
    try {
      const comparison = calculateEcoComparison(job.pageCount, job.copies);
      const saved = job.duplex ? comparison.savedSheets : 0;
      if (!Number.isSafeInteger(result.savedSheets + saved)) {
        result.omitted++;
        continue;
      }
      result.savedSheets += saved;
      result.included++;
      if (job.pageCountSource === "assumed") result.assumed++;
      if (job.dataOrigin === "demo-fixture") result.fixtures++;
    } catch {
      result.omitted++;
    }
  }
  return result;
}
