import { describe, expect, it } from "vitest";
import type { PrintJob } from "../contracts/jobs";
import type {
  OperatingHours,
  PickupConfig,
  PrinterAvailability,
} from "../contracts/scheduling";
import {
  calculatePickupWindow,
  calculateQueue,
  insertUrgent,
  remainingWork,
} from "../queue/calculations";
import { isOperatingHours } from "../services/runtime-validation";
import { isTimestamp } from "../utils/validation";

const observedAt = "2026-11-13T04:30:00.000Z";
const operational: PrinterAvailability = {
  state: "operational",
  changedAt: observedAt,
  reason: null,
  downtime: null,
};
function job(
  id: string,
  duration: number,
  status: PrintJob["status"] = "queued",
): PrintJob {
  return {
    id,
    token: `token-${id}`,
    clientRequestId: `request-${id}`,
    documentName: id,
    instructions: "",
    createdAt: observedAt,
    updatedAt: observedAt,
    pageCount: 1,
    copies: 1,
    pageCountSource: "manual",
    colorMode: "bw",
    paperSize: "A4",
    status,
    priority: "normal",
    urgentRequestStatus: "none",
    duplex: false,
    dataOrigin: "local-user",
    documentLocation: "none",
    documentId: null,
    originalFileName: null,
    mimeType: null,
    estimatedPickupAt: null,
    fileSize: null,
    queuePosition: null,
    estimatedCost: 2,
    estimatedDurationMinutes: duration,
    estimatedWaitMinutes: null,
  };
}

describe("the one persisted remaining-work queue calculation", () => {
  it("uses actual printing work, excludes completed jobs and never changes a status", () => {
    const jobs = [
      job("P", 9, "printing"),
      job("A", 5),
      job("B", 3),
      job("R", 4, "ready"),
      job("C", 2, "collected"),
    ];
    const result = calculateQueue(
      jobs,
      ["P", "A", "B"],
      { P: 2, A: 5, B: 3 },
      operational,
      observedAt,
    );
    expect(result.jobs.find((value) => value.id === "B")).toMatchObject({
      queuePosition: 3,
      estimatedWaitMinutes: 7,
      estimatedPickupAt: "2026-11-13T04:40:00.000Z",
      status: "queued",
    });
    expect(result.entries.map((value) => value.jobId)).toEqual(["P", "A", "B"]);
    expect(result.jobs.map((value) => value.status)).toEqual(
      jobs.map((value) => value.status),
    );
  });

  it("counts one outage delay for all predecessors, not one per job", () => {
    const printer: PrinterAvailability = {
      state: "maintenance",
      changedAt: observedAt,
      reason: "printer.fixtureKnownMaintenance",
      downtime: { kind: "known", expectedResumeAt: "2026-11-13T04:40:00.000Z" },
    };
    const result = calculateQueue(
      [job("P", 9, "printing"), job("A", 5), job("B", 3)],
      ["P", "A", "B"],
      { P: 2, A: 5, B: 3 },
      printer,
      observedAt,
    );
    expect(result.jobs[0]).toMatchObject({
      estimatedWaitMinutes: 10,
      estimatedPickupAt: "2026-11-13T04:42:00.000Z",
    });
    expect(result.jobs[2]).toMatchObject({
      estimatedWaitMinutes: 17,
      estimatedPickupAt: "2026-11-13T04:50:00.000Z",
    });
  });

  it.each<PrinterAvailability>([
    { state: null, changedAt: null, reason: null, downtime: null },
    {
      state: "paused",
      changedAt: observedAt,
      reason: null,
      downtime: { kind: "unknown" },
    },
    {
      state: "maintenance",
      changedAt: observedAt,
      reason: null,
      downtime: { kind: "known", expectedResumeAt: observedAt },
    },
  ])(
    "keeps known price/duration/status but nulls dependent ETA for unavailable work",
    (printer) => {
      const ready = { ...job("R", 4, "ready"), estimatedPickupAt: observedAt };
      const result = calculateQueue(
        [job("A", 5), ready],
        ["A"],
        { A: 5 },
        printer,
        observedAt,
      );
      expect(result.jobs[0]).toMatchObject({
        status: "queued",
        estimatedCost: 2,
        estimatedDurationMinutes: 5,
        estimatedWaitMinutes: null,
        estimatedPickupAt: null,
      });
      expect(result.jobs[1]).toMatchObject({
        status: "ready",
        estimatedPickupAt: observedAt,
      });
    },
  );

  it("does not invent elapsed work when explicitly resumed at a later snapshot", () => {
    const resumed: PrinterAvailability = {
      state: "resumed",
      changedAt: "2026-11-13T04:40:00.000Z",
      reason: "printer.fixtureResumed",
      downtime: null,
    };
    const result = calculateQueue(
      [job("P", 9, "printing"), job("A", 5), job("B", 3)],
      ["P", "A", "B"],
      { P: 2, A: 5, B: 3 },
      resumed,
      resumed.changedAt!,
    );
    expect(result.jobs[2]).toMatchObject({
      estimatedWaitMinutes: 7,
      estimatedPickupAt: "2026-11-13T04:50:00.000Z",
    });
  });

  it("uses a conservative full duration only when printing remaining work is unavailable", () => {
    expect(remainingWork(job("P", 9, "printing"), { P: null })).toBe(9);
    expect(remainingWork(job("Q", 5), { Q: null })).toBeNull();
    expect(remainingWork(job("P", 9, "printing"), { P: 0 })).toBe(0);
    expect(
      calculateQueue(
        [job("P", 9, "printing"), job("Q", 5)],
        ["P", "Q"],
        { P: null, Q: 5 },
        operational,
        observedAt,
      ).jobs[1]?.estimatedWaitMinutes,
    ).toBe(9);
  });

  it("inserts urgent work after printing and prior approved urgent work without mutating inputs", () => {
    const p = job("P", 2, "printing");
    const u = {
      ...job("U", 3),
      priority: "urgent" as const,
      urgentRequestStatus: "approved" as const,
    };
    const jobs = [p, u, job("A", 5), job("C", 1.4)];
    const order = ["P", "U", "A", "C"];
    expect(insertUrgent(order, jobs, "C")).toEqual(["P", "U", "C", "A"]);
    expect(order).toEqual(["P", "U", "A", "C"]);
    expect(jobs[3]?.priority).toBe("normal");
  });
});

const hours: OperatingHours = {
  timeZone: "Asia/Kolkata",
  validFrom: "2026-11-13T03:30:00.000Z",
  validUntil: "2026-11-14T11:30:00.000Z",
  intervals: [
    {
      opensAt: "2026-11-13T03:30:00.000Z",
      closesAt: "2026-11-13T11:30:00.000Z",
    },
    {
      opensAt: "2026-11-14T03:30:00.000Z",
      closesAt: "2026-11-14T11:30:00.000Z",
    },
  ],
};
const pickup: PickupConfig = { bufferMinutes: 15, hours };

describe("suggested pickup windows use only supplied dated pickup hours", () => {
  it("clips readiness at 16:55 IST to supplied 17:00 closing", () => {
    expect(calculatePickupWindow("2026-11-13T11:25:00.000Z", pickup)).toEqual({
      available: true,
      startsAt: "2026-11-13T11:25:00.000Z",
      endsAt: "2026-11-13T11:30:00.000Z",
    });
  });
  it("moves only the window to the next supplied opening after closing", () => {
    const ready = "2026-11-13T11:35:00.000Z";
    expect(calculatePickupWindow(ready, pickup)).toEqual({
      available: true,
      startsAt: "2026-11-14T03:30:00.000Z",
      endsAt: "2026-11-14T03:45:00.000Z",
    });
    expect(ready).toBe("2026-11-13T11:35:00.000Z");
  });
  it("never invents another opening after dated coverage ends", () => {
    expect(calculatePickupWindow("2026-11-14T11:30:00.000Z", pickup)).toEqual({
      available: false,
      reason: "outside-known-hours",
    });
    expect(
      calculatePickupWindow(observedAt, {
        bufferMinutes: 15,
        hours: { ...hours, intervals: [] },
      }),
    ).toEqual({ available: false, reason: "outside-known-hours" });
  });
  it("distinguishes unknown ETA and collected, and assumes no default shop calendar", () => {
    expect(calculatePickupWindow(null, pickup)).toEqual({
      available: false,
      reason: "eta-unavailable",
    });
    expect(calculatePickupWindow(observedAt, pickup, "collected")).toEqual({
      available: false,
      reason: "not-applicable",
    });
    expect(
      calculatePickupWindow(observedAt, { bufferMinutes: 15, hours: null }),
    ).toEqual({
      available: true,
      startsAt: observedAt,
      endsAt: "2026-11-13T04:45:00.000Z",
    });
  });
  it("validates UTC calendar dates, timezone, ordering and non-overlap", () => {
    expect(isOperatingHours(hours)).toBe(true);
    expect(isOperatingHours({ ...hours, timeZone: "Not/AZone" })).toBe(false);
    expect(
      isOperatingHours({
        ...hours,
        intervals: [hours.intervals[0], hours.intervals[0]],
      }),
    ).toBe(false);
    expect(isTimestamp("2026-02-30T10:00:00Z")).toBe(false);
    expect(isTimestamp("2026-11-13T10:00:00.1Z")).toBe(true);
    expect(isTimestamp("2026-11-13T10:00:00+05:30")).toBe(false);
  });
});
