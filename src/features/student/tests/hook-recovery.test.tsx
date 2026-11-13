/// <reference lib="es2024.promise" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { PrintQuote, QuoteInput } from "../contracts/jobs";
import type { ServiceEvent } from "../contracts/service";
import type { QueueSnapshot } from "../contracts/scheduling";
import { QuoteValues } from "../components/JobPieces";
import { GuideProvider } from "../demo/GuideContext";
import {
  StudentProvider,
  useRevisionRead,
  useStudent,
} from "../hooks/StudentContext";
import { useErrorText } from "../hooks/useErrorText";
import { TranslationProvider } from "../i18n/TranslationProvider";
import { JobsPage } from "../pages/JobsPage";
import { NewPrintPage } from "../pages/NewPrintPage";
import {
  createLocalDemo,
  type LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
import {
  SharedServiceAdapter,
  type SharedStudentTransport,
} from "../services/SharedServiceAdapter";

const at = "2026-11-13T10:00:00.000Z";
const meta = {
  revision: "shop-12",
  observedAt: at,
  lastSyncedAt: at,
  source: "shared" as const,
  stale: false,
};
const queue: QueueSnapshot = {
  ...meta,
  entries: [],
  printer: {
    state: "operational",
    changedAt: at,
    reason: null,
    downtime: null,
  },
  pickup: { bufferMinutes: 15, hours: null },
  policy: null,
  localGeneration: null,
};
const quote: PrintQuote = {
  ...meta,
  printedSides: 20,
  sheets: 20,
  pricePerSide: null,
  estimatedCost: 55,
  estimatedDurationMinutes: null,
  estimatedWaitMinutes: null,
  estimatedTotalMinutes: null,
  estimatedPickupAt: null,
  assumptions: [],
};
const input: QuoteInput = {
  pageCount: 10,
  copies: 2,
  colorMode: "bw",
  duplex: false,
  paperSize: "A4",
};
const unavailable = "The shared service is unavailable. Nothing was sent.";
const replaced =
  "Local data was replaced. This draft is from the previous dataset. Start a fresh print request.";

/** A real typed host transport: only calculation completion and genuine events are controlled. */
class ControlledShop implements SharedStudentTransport {
  private listener?: (event: ServiceEvent) => void;
  readonly reads: PromiseWithResolvers<PrintQuote>[] = [];
  subscribeToJobUpdates(callback: (event: ServiceEvent) => void) {
    this.listener = callback;
    this.publish();
    return () => {
      this.listener = undefined;
    };
  }
  event(event: ServiceEvent) {
    this.listener?.(event);
  }
  publish() {
    this.event({ type: "snapshot-changed", jobs: [], queue });
  }
  async getQuote() {
    const pending = Promise.withResolvers<PrintQuote>();
    this.reads.push(pending);
    return pending.promise;
  }
  async getJobs() {
    return [];
  }
  async getQueueSnapshot() {
    return queue;
  }
  async getJobById() {
    return null;
  }
  async createJob(): Promise<never> {
    throw new Error("No submission in a quote recovery scenario");
  }
  async requestUrgent(): Promise<never> {
    throw new Error("No urgency mutation in a quote recovery scenario");
  }
  async getPrinterStatus() {
    return { ...meta, ...queue.printer };
  }
  async getPickupWindow() {
    return {
      ...meta,
      window: { available: false as const, reason: "eta-unavailable" as const },
    };
  }
  async getUrgentImpactPreview() {
    return null;
  }
  async getDocument() {
    return null;
  }
  async getShopInsights() {
    return {
      ...meta,
      shopDisplayName: null,
      pendingJobCount: 0,
      estimatedWorkloadMinutes: 0,
      printerState: "operational" as const,
      congestion: null,
      lowerCongestionPeriods: null,
    };
  }
}

function QuoteConsumer() {
  const { service, queue: snapshot, connection } = useStudent();
  const result = useRevisionRead(() => service.getQuote(input), []);
  const errorText = useErrorText();
  return (
    <section aria-label="Live estimate">
      <output aria-label="Snapshot revision">{snapshot?.revision}</output>
      <output aria-label="Connection">{connection.state}</output>
      {result.pending ? (
        <p role="status">Updating estimate</p>
      ) : result.error ? (
        <p role="alert">{errorText(result.error)}</p>
      ) : result.value ? (
        <QuoteValues quote={result.value} />
      ) : null}
    </section>
  );
}
function LocationReadout() {
  const location = useLocation();
  return (
    <output aria-label="Draft URL">
      {location.pathname}
      {location.search}
    </output>
  );
}
const locals: LocalDemoAdapter[] = [];
const shared: SharedServiceAdapter[] = [];
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const service of locals.splice(0)) await service.dispose();
  for (const service of shared.splice(0)) service.dispose();
});
function renderQuote() {
  const transport = new ControlledShop();
  const service = new SharedServiceAdapter(transport);
  shared.push(service);
  render(
    <TranslationProvider>
      <StudentProvider service={service} basePath="/student">
        <QuoteConsumer />
      </StudentProvider>
    </TranslationProvider>,
  );
  return transport;
}
function renderLocal() {
  const local = createLocalDemo({
    databaseName: `hook-recovery-${crypto.randomUUID()}`,
    clock: () => new Date(at),
  });
  locals.push(local.service);
  render(
    <MemoryRouter initialEntries={["/student/new"]}>
      <TranslationProvider>
        <StudentProvider
          service={local.service}
          repository={local.service.repo}
          demoController={local.demoController}
          basePath="/student"
        >
          <GuideProvider>
            <Link to="/student/jobs">My Jobs</Link>
            <LocationReadout />
            <Routes>
              <Route path="/student/new" element={<NewPrintPage />} />
              <Route path="/student/jobs" element={<JobsPage />} />
            </Routes>
          </GuideProvider>
        </StudentProvider>
      </TranslationProvider>
    </MemoryRouter>,
  );
  return local;
}
async function resolveQuote(
  transport: ControlledShop,
  index: number,
  price = 55,
) {
  await waitFor(() => expect(transport.reads).toHaveLength(index + 1));
  await act(async () => {
    transport.reads[index]!.resolve({ ...quote, estimatedCost: price });
    await transport.reads[index]!.promise;
  });
}

describe("calculation freshness consumers", () => {
  it("removes an already rendered shop price on same-revision disconnect and restores it only after a fresh snapshot", async () => {
    const transport = renderQuote();
    await resolveQuote(transport, 0);
    expect(screen.getByText("₹55.00")).toBeInTheDocument();
    act(() =>
      transport.event({
        type: "connection-changed",
        mode: "shared",
        state: "disconnected",
        lastSyncedAt: at,
      }),
    );
    expect(screen.getByLabelText("Snapshot revision")).toHaveTextContent(
      "shop-12",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(screen.queryByText("₹55.00")).not.toBeInTheDocument();
    act(() =>
      transport.event({
        type: "connection-changed",
        mode: "shared",
        state: "connected",
        lastSyncedAt: at,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(transport.reads).toHaveLength(1);
    act(() => transport.publish());
    await resolveQuote(transport, 1, 73);
    expect(screen.getByText("₹73.00")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Snapshot revision")).toHaveTextContent(
      "shop-12",
    );
  });

  it("discards a pre-disconnect promise even when recovery uses the same revision", async () => {
    const transport = renderQuote();
    await waitFor(() => expect(transport.reads).toHaveLength(1));
    act(() =>
      transport.event({
        type: "connection-changed",
        mode: "shared",
        state: "disconnected",
        lastSyncedAt: at,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    act(() => {
      transport.event({
        type: "connection-changed",
        mode: "shared",
        state: "connected",
        lastSyncedAt: at,
      });
      transport.publish();
    });
    await resolveQuote(transport, 1, 73);
    expect(screen.getByText("₹73.00")).toBeInTheDocument();
    await act(async () => {
      transport.reads[0]!.resolve(quote);
      await transport.reads[0]!.promise;
    });
    expect(screen.getByText("₹73.00")).toBeInTheDocument();
    expect(screen.queryByText("₹55.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("invalidates a resolved price when a snapshot becomes stale while the connection stays connected", async () => {
    const transport = renderQuote();
    await resolveQuote(transport, 0);
    expect(screen.getByText("₹55.00")).toBeInTheDocument();
    act(() =>
      transport.event({
        type: "snapshot-changed",
        jobs: [],
        queue: { ...queue, stale: true },
      }),
    );
    expect(screen.getByLabelText("Connection")).toHaveTextContent("connected");
    expect(screen.getByLabelText("Snapshot revision")).toHaveTextContent(
      "shop-12",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(screen.queryByText("₹55.00")).not.toBeInTheDocument();
  });
});

describe("local draft consumer recovery", () => {
  it("retains the editing draft and raw numeric text through My Jobs when session storage reads and writes throw", async () => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (this === sessionStorage)
        throw new DOMException("Blocked", "SecurityError");
      return originalGet.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === sessionStorage)
        throw new DOMException("Blocked", "SecurityError");
      originalSet.call(this, key, value);
    });
    const { service } = renderLocal();
    const name = await screen.findByRole("textbox", { name: "Document name" });
    await waitFor(() =>
      expect(screen.getByLabelText("Draft URL")).toHaveTextContent(
        /\/student\/new\?draft=[0-9a-f-]{36}$/i,
      ),
    );
    const firstURL = screen.getByLabelText("Draft URL").textContent!;
    const id = new URL(firstURL, "https://printq.test").searchParams.get(
      "draft",
    )!;
    fireEvent.change(name, {
      target: { value: "Retained operating systems notes" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Copies" }), {
      target: { value: "02e" },
    });
    expect(
      screen.getByText(
        "Session storage is unavailable. Keep this draft URL to recover it after refresh.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "My Jobs" }));
    await screen.findByRole("heading", { name: "My print jobs" });
    // Unmount flushes the pending autosave; no debounce sleep is needed.
    await waitFor(async () =>
      expect((await service.repo.getDraft(id))?.copies).toBe("02e"),
    );
    fireEvent.click(screen.getAllByRole("link", { name: "New Print" })[0]!);
    expect(
      await screen.findByRole("textbox", { name: "Document name" }),
    ).toHaveValue("Retained operating systems notes");
    expect(screen.getByRole("textbox", { name: "Copies" })).toHaveValue("02e");
    await waitFor(() =>
      expect(screen.getByLabelText("Draft URL")).toHaveTextContent(firstURL),
    );
    expect(screen.queryByText(replaced)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start a fresh request" }),
    ).not.toBeInTheDocument();
    expect(await service.getJobs()).toEqual([]);
  });

  it("cancels a queued autosave on dataset replacement and offers a genuinely new-generation draft", async () => {
    const { service, demoController } = renderLocal();
    const name = await screen.findByRole("textbox", { name: "Document name" });
    await waitFor(() =>
      expect(screen.getByLabelText("Draft URL")).toHaveTextContent(
        /\/student\/new\?draft=[0-9a-f-]{36}$/i,
      ),
    );
    const oldURL = screen.getByLabelText("Draft URL").textContent!;
    const oldId = new URL(oldURL, "https://printq.test").searchParams.get(
      "draft",
    )!;
    const oldDraft = await service.repo.getDraft(oldId);
    expect(oldDraft).not.toBeNull();
    await waitFor(() =>
      expect(screen.queryByText("Updating estimate…")).not.toBeInTheDocument(),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.change(name, { target: { value: "Must not resurrect" } });
    await act(async () => {
      await demoController.clearLocalData();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();
    expect(await screen.findByText(replaced)).toBeInTheDocument();
    expect(await service.repo.getDraft(oldId)).toBeNull();
    expect(await service.getJobs()).toEqual([]);
    fireEvent.click(
      screen.getByRole("button", { name: "Start a fresh request" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Document name" }),
      ).toHaveValue(""),
    );
    expect(screen.getByRole("textbox", { name: "Copies" })).toHaveValue("1");
    await waitFor(() => {
      const currentURL = screen.getByLabelText("Draft URL").textContent!;
      expect(currentURL).toMatch(/\/student\/new\?draft=[0-9a-f-]{36}$/i);
      expect(currentURL).not.toBe(oldURL);
    });
    const nextURL = screen.getByLabelText("Draft URL").textContent!;
    const nextId = new URL(nextURL, "https://printq.test").searchParams.get(
      "draft",
    )!;
    expect(nextId).not.toBe(oldId);
    await waitFor(async () =>
      expect((await service.repo.getDraft(nextId))?.generation).toBe(
        oldDraft!.generation + 1,
      ),
    );
    expect(screen.queryByText(replaced)).not.toBeInTheDocument();
  });
});
