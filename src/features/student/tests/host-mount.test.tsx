import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import {
  SharedServiceAdapter,
  StudentPortal,
  type PrintJob,
  type QueueSnapshot,
  type ServiceEvent,
  type SharedStudentTransport,
} from "../index";

const at = "2026-11-13T10:00:00.000Z";
const meta = {
  revision: "shop-9",
  observedAt: at,
  lastSyncedAt: at,
  source: "shared" as const,
  stale: false,
};
const sharedJob: PrintJob = {
  id: "shared-1",
  token: "SHOP-99",
  clientRequestId: "shared-req-1",
  documentName: "Distributed_Systems_<script>.pdf",
  instructions: "<b>Bind</b>",
  createdAt: at,
  updatedAt: at,
  pageCount: 10,
  copies: 2,
  pageCountSource: "manual",
  colorMode: "bw",
  paperSize: "A4",
  status: "queued",
  priority: "normal",
  urgentRequestStatus: "none",
  duplex: false,
  dataOrigin: "shared",
  documentLocation: "none",
  documentId: null,
  originalFileName: null,
  mimeType: null,
  fileSize: null,
  queuePosition: 4,
  estimatedCost: 55,
  estimatedDurationMinutes: 9,
  estimatedWaitMinutes: 18,
  estimatedPickupAt: "2026-11-13T10:27:00.000Z",
};
const sharedQueue: QueueSnapshot = {
  ...meta,
  entries: [
    {
      jobId: sharedJob.id,
      status: "queued",
      priority: "normal",
      estimatedDurationMinutes: 9,
      remainingMinutes: 9,
      optimizationChange: {
        occurredAt: at,
        reason: "shorter-jobs-first",
        previousQueuePosition: 6,
        previousEstimatedPickupAt: "2026-11-13T10:40:00.000Z",
        explanation: "<img src=x onerror=alert(1)> Prioritized shorter batch",
      },
    },
  ],
  printer: { state: "operational", changedAt: at, reason: null, downtime: null },
  pickup: { bufferMinutes: 15, hours: null },
  policy: "Shop batch policy",
  localGeneration: null,
};

function makeTransport() {
  let emit: ((event: ServiceEvent) => void) | undefined;
  const transport: SharedStudentTransport = {
    subscribeToJobUpdates(callback) {
      emit = callback;
      callback({ type: "snapshot-changed", jobs: [sharedJob], queue: sharedQueue });
      return () => {
        emit = undefined;
      };
    },
    async createJob() {
      return sharedJob;
    },
    async getJobs() {
      return [sharedJob];
    },
    async getJobById(id) {
      return id === sharedJob.id ? sharedJob : null;
    },
    async getQuote() {
      return {
        ...meta,
        printedSides: 20,
        sheets: 20,
        pricePerSide: null,
        estimatedCost: 55,
        estimatedDurationMinutes: 9,
        estimatedWaitMinutes: 18,
        estimatedTotalMinutes: 27,
        estimatedPickupAt: "2026-11-13T10:27:00.000Z",
        assumptions: ["Special shop bundle"],
      };
    },
    async getQueueSnapshot() {
      return sharedQueue;
    },
    async getPrinterStatus() {
      return { ...meta, ...sharedQueue.printer };
    },
    async getPickupWindow() {
      return { ...meta, window: { available: false, reason: "eta-unavailable" } };
    },
    async getUrgentImpactPreview() {
      return null;
    },
    async requestUrgent() {
      return sharedJob;
    },
    async getDocument() {
      return null;
    },
    async getShopInsights() {
      return {
        ...meta,
        shopDisplayName: "North Annex Desk",
        pendingJobCount: 3,
        estimatedWorkloadMinutes: 27,
        printerState: "operational",
        congestion: { level: "moderate", basis: "Three queued jobs" },
        lowerCongestionPeriods: null,
      };
    },
  };
  return {
    service: new SharedServiceAdapter(transport),
    disconnect: () =>
      emit?.({ type: "connection-changed", mode: "shared", state: "disconnected", lastSyncedAt: at }),
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("host router mounting and shared authority", () => {
  it("mounts cleanly at a nested host basePath alongside sibling routes without fixture controls", async () => {
    const user = userEvent.setup();
    const { service, disconnect } = makeTransport();
    render(
      <MemoryRouter initialEntries={["/campus/student/queue"]}>
        <Routes>
          <Route path="/host-home" element={<main><h1>Host Application Home</h1><Link to="/campus/student">Open Student</Link></main>} />
          <Route path="/campus/student/*" element={<><Link to="/host-home">Host Home</Link><StudentPortal service={service} basePath="/campus/student" /></>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("SHOP-99")).toBeInTheDocument();
    expect(screen.getByText("₹55.00")).toBeInTheDocument();
    expect(screen.getByText(/Prioritized shorter batch/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "New Print" })).toHaveAttribute("href", "/campus/student/new");

    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(await screen.findByText("3 pending requests")).toBeInTheDocument();
    expect(screen.getByText("Three queued jobs")).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: /Distributed_Systems_/ })[0]!);
    await user.click(await screen.findByRole("link", { name: "View Receipt" }));
    expect(await screen.findByText("North Annex Desk")).toBeInTheDocument();
    disconnect();
    expect(await screen.findByText(/Last-known snapshot/)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Settings" }));
    expect(screen.queryByRole("button", { name: /Reset Demo/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Host Home" }));
    expect(await screen.findByRole("heading", { name: "Host Application Home" })).toBeInTheDocument();
    service.dispose();
  });
});
