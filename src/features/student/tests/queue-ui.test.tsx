/// <reference lib="es2024.promise" />
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobInput, PrintJob } from "../contracts/jobs";
import type { ServiceEvent, StudentService } from "../contracts/service";
import type { WhatIfResult } from "../contracts/scheduling";
import { GuideProvider } from "../demo/GuideContext";
import { StudentProvider, useStudent } from "../hooks/StudentContext";
import { TranslationProvider } from "../i18n/TranslationProvider";
import { QueuePage } from "../pages/QueuePage";
import { SimulatorPage } from "../pages/SimulatorPage";
import {
  createLocalDemo,
  LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
import { UrgentRequest } from "../urgent/UrgentRequest";

const adapters: LocalDemoAdapter[] = [];
const databases: string[] = [];
const pendingNotice =
  "Urgent request pending — queue priority has not changed.";

beforeEach(() => {
  localStorage.setItem("printq.student.locale", "en");
  sessionStorage.removeItem("printq.student.guide");
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const adapter of adapters.splice(0)) await adapter.dispose();
  for (const databaseName of databases.splice(0)) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error(`Database cleanup blocked: ${databaseName}`));
    await promise;
  }
  localStorage.removeItem("printq.student.locale");
  sessionStorage.removeItem("printq.student.guide");
});

function local() {
  const databaseName = `printq-queue-ui-${crypto.randomUUID()}`;
  const demo = createLocalDemo({
    databaseName,
    clock: () => new Date("2026-11-13T10:00:00.000Z"),
  });
  adapters.push(demo.service);
  databases.push(databaseName);
  return demo;
}

function input(documentName = "Lecture notes"): JobInput {
  return {
    clientRequestId: crypto.randomUUID(),
    documentName,
    pageCount: 4,
    copies: 1,
    pageCountSource: "manual",
    colorMode: "bw",
    paperSize: "A4",
    duplex: false,
    instructions: "",
  };
}

// Preserve the adapter's real methods and receiver; override only the capability
// or visibility boundary under test, not the consumer's domain behavior.
function serviceWith(
  service: LocalDemoAdapter,
  overrides: Partial<StudentService>,
): StudentService {
  return new Proxy(service, {
    get(target, key) {
      const value = Reflect.get(overrides, key) ?? Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function mount(
  children: ReactNode,
  service: StudentService,
  repository?: LocalDemoAdapter["repo"],
) {
  return render(
    <TranslationProvider>
      <StudentProvider
        service={service}
        repository={repository}
        basePath="/student"
      >
        <MemoryRouter initialEntries={["/student/queue"]}>
          <GuideProvider>
            <Routes>
              <Route path="/student/queue" element={<>{children}</>} />
              <Route path="/student/jobs/:id" element={<h1>Located job</h1>} />
            </Routes>
          </GuideProvider>
        </MemoryRouter>
      </StudentProvider>
    </TranslationProvider>,
  );
}

function JobUrgency({ id }: { id: string }) {
  const { jobs } = useStudent();
  const job = jobs.find((candidate) => candidate.id === id);
  return job ? <UrgentRequest job={job} /> : null;
}

function definition(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  expect(term.nextElementSibling?.tagName).toBe("DD");
  return term.nextElementSibling as HTMLElement;
}

describe("urgent request consumer", () => {
  it("cancels a real impact preview without changing any job or queue state", async () => {
    const user = userEvent.setup();
    const { service } = local();
    await service.createJob(input("Earlier request"));
    const job = await service.createJob(input());
    const before = {
      jobs: await service.getJobs(),
      queue: await service.getQueueSnapshot(),
    };
    mount(<JobUrgency id={job.id} />, service, service.repo);

    await user.click(
      await screen.findByRole("button", { name: "Request urgent printing" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Request urgent printing?",
    });
    await waitFor(() =>
      expect(within(dialog).getAllByRole("definition").length).toBeGreaterThan(
        0,
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await service.getJobs()).toEqual(before.jobs);
    expect(await service.getQueueSnapshot()).toEqual(before.queue);
  });

  it("confirms only a pending request, preserving priority, status and queue order", async () => {
    const user = userEvent.setup();
    const { service } = local();
    await service.createJob(input("Earlier request"));
    const job = await service.createJob(input());
    const before = await service.getQueueSnapshot();
    const request = vi.spyOn(service, "requestUrgent");
    mount(<JobUrgency id={job.id} />, service, service.repo);

    await user.click(
      await screen.findByRole("button", { name: "Request urgent printing" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Request urgent printing?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm request" }),
    );

    expect(await screen.findByText(pendingNotice)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request urgent printing" }),
    ).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(job.id);
    expect((await service.getQueueSnapshot()).entries).toEqual(before.entries);
    expect(await service.getJobById(job.id)).toMatchObject({
      status: "queued",
      priority: "normal",
      urgentRequestStatus: "pending",
      queuePosition: job.queuePosition,
      estimatedPickupAt: job.estimatedPickupAt,
    });
  });

  it.each([
    "pending",
    "approved",
    "rejected",
    "printing",
    "ready",
    "collected",
  ] as const)(
    "does not offer another urgent request for a %s job",
    async (state) => {
      const { service, demoController } = local();
      const job = await service.createJob(input());
      if (state === "pending" || state === "approved" || state === "rejected") {
        await service.requestUrgent(job.id);
        if (state !== "pending")
          await demoController.resolveUrgency(job.id, state);
      } else {
        await demoController.advanceJob(job.id);
        if (state !== "printing") await demoController.advanceJob(job.id);
        if (state === "collected") await demoController.advanceJob(job.id);
      }
      const request = vi.spyOn(service, "requestUrgent");
      mount(<JobUrgency id={job.id} />, service, service.repo);
      await waitFor(() =>
        expect(screen.getByRole("region")).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Request urgent printing" }),
      ).not.toBeInTheDocument();
      expect(request).not.toHaveBeenCalled();
      if (state === "pending")
        expect(screen.getByText(pendingNotice)).toBeVisible();
    },
  );

  it("honestly reports unavailable impact estimates and still permits cancellation", async () => {
    const user = userEvent.setup();
    const { service } = local();
    const job = await service.createJob(input());
    const before = {
      jobs: await service.getJobs(),
      queue: await service.getQueueSnapshot(),
    };
    const unavailable = serviceWith(service, {
      getUrgentImpactPreview: async () => null,
    });
    mount(<JobUrgency id={job.id} />, unavailable, service.repo);

    await user.click(
      await screen.findByRole("button", { name: "Request urgent printing" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Request urgent printing?",
    });
    expect(
      await within(dialog).findByText(
        "Impact estimates are unavailable. You can still send a request; approval and timing are not guaranteed.",
      ),
    ).toBeVisible();
    expect(within(dialog).queryByRole("definition")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Confirm request" }),
    ).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await service.getJobs()).toEqual(before.jobs);
    expect(await service.getQueueSnapshot()).toEqual(before.queue);
  });

  it("disables confirmation if eligibility changes while its dialog is open", async () => {
    const user = userEvent.setup();
    const { service } = local();
    const job = await service.createJob(input());
    mount(<JobUrgency id={job.id} />, service, service.repo);
    await user.click(
      await screen.findByRole("button", { name: "Request urgent printing" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Request urgent printing?",
    });

    await act(async () => {
      await service.requestUrgent(job.id);
    });
    const request = vi.spyOn(service, "requestUrgent");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Confirm request" }),
      ).toBeDisabled(),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm request" }),
    );
    expect(request).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("queue token lookup and privacy", () => {
  it("keeps the queue and authoritative position after a missing token without exposing hidden jobs", async () => {
    const user = userEvent.setup();
    const { service } = local();
    const hidden = await service.createJob({
      ...input("Private document name"),
      instructions: "Private instructions",
    });
    const visible = await service.createJob(input("My visible request"));
    const visibleJobs = (jobs: PrintJob[]) =>
      jobs.filter((job) => job.id === visible.id);
    const filtered = serviceWith(service, {
      getJobs: async () => visibleJobs(await service.getJobs()),
      getJobById: async (id) =>
        id === visible.id ? service.getJobById(id) : null,
      subscribeToJobUpdates: (callback) =>
        service.subscribeToJobUpdates((event) =>
          callback(
            event.type === "snapshot-changed"
              ? { ...event, jobs: visibleJobs(event.jobs) }
              : event,
          ),
        ),
    });
    mount(<QueuePage />, filtered, service.repo);
    expect(await screen.findByText(visible.documentName)).toBeVisible();
    expect(visible.queuePosition).toBe(2);
    expect(definition("Queue position")).toHaveTextContent(/^2$/);

    await user.type(
      screen.getByRole("textbox", { name: "Pickup token" }),
      "NOT-A-PICKUP-TOKEN",
    );
    await user.click(screen.getByRole("button", { name: "Find my job" }));
    expect(
      await screen.findByText(
        "Token not found. Check your pickup token and try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Queue Tracker" }),
    ).toBeVisible();
    expect(screen.getByText(visible.documentName)).toBeVisible();
    expect(definition("Queue position")).toHaveTextContent(/^2$/);
    for (const privateValue of [
      hidden.documentName,
      hidden.token,
      hidden.instructions,
      hidden.id,
    ]) {
      expect(
        screen.queryByText(privateValue, { exact: false }),
      ).not.toBeInTheDocument();
    }

    await user.clear(screen.getByRole("textbox", { name: "Pickup token" }));
    await user.type(
      screen.getByRole("textbox", { name: "Pickup token" }),
      `  ${visible.token.toLowerCase()}  `,
    );
    await user.click(screen.getByRole("button", { name: "Find my job" }));
    expect(
      await screen.findByRole("heading", { name: "Located job" }),
    ).toBeVisible();
  });
});

describe("what-if simulator consumer", () => {
  it("simulates changes to an existing queued job without mutating jobs, printer or revision", async () => {
    const user = userEvent.setup();
    const { service } = local();
    await service.createJob(input("Earlier request"));
    const job = await service.createJob(input());
    const before = {
      jobs: await service.getJobs(),
      queue: await service.getQueueSnapshot(),
      printer: await service.getPrinterStatus(),
    };
    const simulate = vi.spyOn(service, "simulateWhatIf");
    mount(<SimulatorPage />, service, service.repo);
    await screen.findByRole("option", { name: new RegExp(job.token) });
    await user.selectOptions(
      screen.getByLabelText("Scenario target"),
      `job:${job.id}`,
    );
    await user.selectOptions(screen.getByLabelText("Print mode"), "colour");
    await user.clear(screen.getByLabelText("Copies"));
    await user.type(screen.getByLabelText("Copies"), "3");
    await user.selectOptions(
      screen.getByLabelText("Printer scenario"),
      "maintenance",
    );
    await user.clear(screen.getByLabelText("Downtime minutes"));
    await user.type(screen.getByLabelText("Downtime minutes"), "7");
    await user.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(
      await screen.findByRole("heading", { name: "Current estimate" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Hypothetical estimate" }),
    ).toBeVisible();
    expect(
      screen.getByText("Simulation Only — No Changes Applied"),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: "Current estimate" }),
      ).getByText("₹8.00"),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: "Hypothetical estimate" }),
      ).getByText("₹120.00"),
    ).toBeVisible();
    expect(simulate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: "job", jobId: job.id },
        snapshotRevision: before.queue.revision,
        changes: expect.objectContaining({
          colorMode: "colour",
          copies: 3,
          printer: {
            state: "maintenance",
            downtime: {
              kind: "known",
              expectedResumeAt: "2026-11-13T10:07:00.000Z",
            },
          },
        }),
      }),
    );
    expect(await service.getJobs()).toEqual(before.jobs);
    expect(await service.getQueueSnapshot()).toEqual(before.queue);
    expect(await service.getPrinterStatus()).toEqual(before.printer);
  });

  it.each(["pending", "approved"] as const)(
    "keeps copies scenarios available for a %s urgent request without re-requesting urgency",
    async (status) => {
      const user = userEvent.setup();
      const { service, demoController } = local();
      const eligible = await service.createJob(
        input("Eligible urgency target"),
      );
      const job = await service.createJob(input("Existing urgent request"));
      await service.requestUrgent(job.id);
      if (status === "approved")
        await demoController.resolveUrgency(job.id, "approved");
      const before = {
        jobs: await service.getJobs(),
        queue: await service.getQueueSnapshot(),
        printer: await service.getPrinterStatus(),
      };
      const simulate = vi.spyOn(service, "simulateWhatIf");
      mount(<SimulatorPage />, service, service.repo);
      await screen.findByRole("option", { name: new RegExp(job.token) });

      await user.selectOptions(
        screen.getByLabelText("Scenario target"),
        `job:${eligible.id}`,
      );
      await user.click(screen.getByRole("checkbox"));
      expect(screen.getByRole("checkbox")).toBeChecked();
      await user.selectOptions(
        screen.getByLabelText("Scenario target"),
        `job:${job.id}`,
      );
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Print mode")).toBeEnabled();
      expect(screen.getByLabelText("Printer scenario")).toBeEnabled();
      await user.clear(screen.getByLabelText("Copies"));
      await user.type(screen.getByLabelText("Copies"), "3");
      await user.click(screen.getByRole("button", { name: "Run simulation" }));

      expect(
        await screen.findByRole("heading", { name: "Hypothetical estimate" }),
      ).toBeVisible();
      expect(
        within(
          screen.getByRole("region", { name: "Hypothetical estimate" }),
        ).getByText("₹24.00"),
      ).toBeVisible();
      expect(simulate).toHaveBeenCalledTimes(1);
      expect(simulate).toHaveBeenCalledWith({
        target: { kind: "job", jobId: job.id },
        snapshotRevision: before.queue.revision,
        changes: { colorMode: "bw", copies: 3 },
      });
      expect(await service.getJobs()).toEqual(before.jobs);
      expect(await service.getQueueSnapshot()).toEqual(before.queue);
      expect(await service.getPrinterStatus()).toEqual(before.printer);

      await user.selectOptions(
        screen.getByLabelText("Scenario target"),
        `job:${eligible.id}`,
      );
      expect(screen.getByRole("checkbox")).not.toBeChecked();
    },
  );

  it("reports an unavailable shared simulation capability without inventing results", async () => {
    const user = userEvent.setup();
    const { service } = local();
    const job = await service.createJob(input());
    const before = await service.getQueueSnapshot();
    const simulate = vi.fn<StudentService["simulateWhatIf"]>(async () => null);
    const shared = serviceWith(service, {
      simulateWhatIf: simulate,
      subscribeToJobUpdates: (callback) =>
        service.subscribeToJobUpdates((event) => {
          const projected: ServiceEvent =
            event.type === "connection-changed"
              ? { ...event, mode: "shared", state: "connected" }
              : event.type === "snapshot-changed"
                ? { ...event, queue: { ...event.queue, source: "shared" } }
                : event;
          callback(projected);
        }),
    });
    mount(<SimulatorPage />, shared);
    await screen.findByRole("option", { name: new RegExp(job.token) });
    await user.selectOptions(
      screen.getByLabelText("Scenario target"),
      `job:${job.id}`,
    );
    await user.click(screen.getByRole("button", { name: "Run simulation" }));

    expect(
      await screen.findByText(
        "This service cannot provide this simulation right now. No changes were applied.",
      ),
    ).toBeVisible();
    expect(simulate).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Current estimate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Hypothetical estimate" }),
    ).not.toBeInTheDocument();
    expect(await service.getQueueSnapshot()).toEqual(before);
    expect(await service.getJobById(job.id)).toEqual(job);
  });

  it("withholds a delayed result from an obsolete queue revision", async () => {
    const user = userEvent.setup();
    const { service } = local();
    const job = await service.createJob(input());
    const started = Promise.withResolvers<WhatIfResult | null>();
    const response = Promise.withResolvers<WhatIfResult | null>();
    const delayed = serviceWith(service, {
      simulateWhatIf: async (request) => {
        started.resolve(await service.simulateWhatIf(request));
        return response.promise;
      },
    });
    mount(<SimulatorPage />, delayed, service.repo);
    await screen.findByRole("option", { name: new RegExp(job.token) });
    await user.selectOptions(
      screen.getByLabelText("Scenario target"),
      `job:${job.id}`,
    );
    await user.click(screen.getByRole("button", { name: "Run simulation" }));
    const obsolete = await started.promise;
    expect(obsolete).not.toBeNull();

    await act(async () => {
      await service.createJob(input("New queue revision"));
    });
    const current = await service.getQueueSnapshot();
    expect(current.revision).not.toBe(obsolete!.revision);
    await act(async () => {
      response.resolve(obsolete);
    });

    expect(
      screen.getByRole("heading", { name: "What-If Simulator" }),
    ).toBeVisible();
    expect(
      screen.getByText("Simulation Only — No Changes Applied"),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Current estimate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Hypothetical estimate" }),
    ).not.toBeInTheDocument();
    expect(await service.getQueueSnapshot()).toEqual(current);
  });
});
