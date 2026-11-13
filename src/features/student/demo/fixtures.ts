import type { PrintJob } from "../contracts/jobs";
import { calculatePrintEstimate } from "../pricing/calculations";
import { DomainError } from "../utils/validation";
import { validateFile } from "../documents/validation";
export const DEMO_DOCUMENT_ID = "30000000-0000-4000-8000-000000000001";
export const DEMO_DOCUMENT_URL = new URL(
  "./fixtures/campus-print-guide.pdf",
  import.meta.url,
).href;
export async function prepareFixtureFile(): Promise<File> {
  const response = await fetch(DEMO_DOCUMENT_URL);
  if (!response.ok)
    throw new DomainError("FIXTURE_UNAVAILABLE", "errors.fixtureUnavailable");
  const file = new File([await response.blob()], "campus-print-guide.pdf", {
    type: "application/pdf",
    lastModified: 0,
  });
  await validateFile(file);
  return file;
}
export function fixtureJobs(now: string, file: File): PrintJob[] {
  const specs = [
    {
      name: "Campus orientation booklet",
      pages: 10,
      status: "printing",
      duplex: false,
      mode: "bw",
    },
    {
      name: "Workshop handout",
      pages: 10,
      status: "queued",
      duplex: true,
      mode: "bw",
    },
    {
      name: "Fictional lab worksheet",
      pages: 5,
      status: "queued",
      duplex: false,
      mode: "bw",
    },
    {
      name: "One-page campus notice",
      pages: 1,
      status: "queued",
      duplex: false,
      mode: "bw",
    },
    {
      name: "Campus print guide",
      pages: 3,
      status: "ready",
      duplex: true,
      mode: "colour",
    },
    {
      name: "Collected sample notes",
      pages: 3,
      status: "collected",
      duplex: true,
      mode: "bw",
    },
  ] as const;
  return specs.map((spec, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    const input = {
      pageCount: spec.pages,
      copies: 1,
      colorMode: spec.mode,
      duplex: spec.duplex,
      paperSize: "A4" as const,
    };
    const estimate = calculatePrintEstimate(input);
    return {
      id: "10000000-0000-4000-8000-" + suffix,
      token: "PQ-20000000-0000-4000-8000-" + suffix,
      clientRequestId: "fixture-" + suffix,
      documentName: spec.name,
      instructions: "",
      createdAt: now,
      updatedAt: now,
      ...input,
      pageCountSource: "manual",
      status: spec.status,
      priority: "normal",
      urgentRequestStatus: "none",
      dataOrigin: "demo-fixture",
      documentLocation: index === 4 ? "device" : "none",
      documentId: index === 4 ? DEMO_DOCUMENT_ID : null,
      originalFileName: index === 4 ? file.name : null,
      mimeType: index === 4 ? "application/pdf" : null,
      fileSize: index === 4 ? file.size : null,
      queuePosition: null,
      estimatedCost: estimate.estimatedCost,
      estimatedDurationMinutes: estimate.estimatedDurationMinutes,
      estimatedWaitMinutes: null,
      estimatedPickupAt: spec.status === "ready" ? now : null,
    };
  });
}
