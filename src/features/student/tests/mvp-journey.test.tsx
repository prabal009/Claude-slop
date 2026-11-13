import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StudentPortal } from "../StudentPortal";
import {
  createLocalDemo,
  LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
const adapters: LocalDemoAdapter[] = [];
beforeEach(() => {
  sessionStorage.removeItem("printq.student.draftId");
});
afterEach(async () => {
  cleanup();
  for (const adapter of adapters.splice(0)) await adapter.dispose();
});
function mount(service: LocalDemoAdapter, path = "/student/new") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/student/*"
          element={<StudentPortal service={service} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("durable name-only consumer journey", () => {
  it("validates, quotes, commits once, tracks and reopens the stored job after remount", async () => {
    const user = userEvent.setup();
    const { service } = createLocalDemo({
      databaseName: "mvp-" + crypto.randomUUID(),
      clock: () => new Date("2026-11-13T04:30:00.000Z"),
    });
    adapters.push(service);
    const view = mount(service);
    await screen.findByLabelText(/Document name/);
    await user.click(
      screen.getByRole("button", { name: /Submit print request/ }),
    );
    expect(
      await screen.findByText("Enter a document name.", {
        selector: "#pq-documentName-error",
      }),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText(/Document name/),
      "Operating_Systems_Notes.pdf",
    );
    const copies = screen.getByLabelText("Copies");
    await user.clear(copies);
    await user.type(copies, "10");
    expect(await screen.findByText("₹20.00")).toBeVisible();
    expect(screen.getByText("5 min")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: /Submit print request/ }),
    );
    expect(await screen.findByText("Print request submitted")).toBeVisible();
    const saved = await service.getJobs();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      documentName: "Operating_Systems_Notes.pdf",
      copies: 10,
      pageCount: 1,
      pageCountSource: "assumed",
      estimatedCost: 20,
      estimatedDurationMinutes: 5,
      estimatedWaitMinutes: 0,
      queuePosition: 1,
      documentId: null,
      documentLocation: "none",
    });
    const token = saved[0]!.token;
    expect(screen.getByDisplayValue(token)).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Open Queue Tracker" }));
    expect(await screen.findByText(token)).toBeVisible();
    expect(screen.getByText("Jobs ahead").nextElementSibling).toHaveTextContent(
      "0",
    );
    view.unmount();
    mount(service, `/student/jobs/${saved[0]!.id}/success`);
    expect(await screen.findByDisplayValue(token)).toBeVisible();
    expect((await service.getJobs()).map((job) => job.id)).toEqual([
      saved[0]!.id,
    ]);
  });
  it("restores raw editing strings on refresh rather than coercing them", async () => {
    const user = userEvent.setup();
    const { service } = createLocalDemo({
      databaseName: "draft-" + crypto.randomUUID(),
    });
    adapters.push(service);
    const view = mount(service);
    await screen.findByLabelText(/Document name/);
    await user.type(screen.getByLabelText(/Document name/), "My notes");
    await user.clear(screen.getByLabelText("Copies"));
    await user.type(screen.getByLabelText("Copies"), "1e2");
    const draftId = sessionStorage.getItem("printq.student.draftId");
    await waitFor(async () =>
      expect((await service.repo.getDraft(draftId!))?.copies).toBe("1e2"),
    );
    view.unmount();
    mount(service, `/student/new?draft=${draftId}`);
    expect(await screen.findByDisplayValue("My notes")).toBeVisible();
    expect(screen.getByLabelText("Copies")).toHaveValue("1e2");
    await user.click(
      screen.getByRole("button", { name: /Submit print request/ }),
    );
    expect(
      await screen.findByText(/Enter whole-number copies/, {
        selector: "#pq-copies-error",
      }),
    ).toBeVisible();
    expect(await service.getJobs()).toEqual([]);
  });
});
