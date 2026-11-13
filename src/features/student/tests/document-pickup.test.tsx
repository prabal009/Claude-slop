/// <reference lib="es2024.promise" />
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentProvider } from "../hooks/StudentContext";
import { TranslationProvider } from "../i18n/TranslationProvider";
import {
  createLocalDemo,
  type LocalDemoAdapter,
} from "../services/LocalDemoAdapter";
import { localPickupQrCodec, type PickupQrCodec } from "../qr/codec";
import { PickupToken } from "../qr/PickupToken";
import { ReceiptPage } from "../receipts/ReceiptPage";
import { DocumentView } from "../components/DocumentView";
import { readBlobBytes } from "../documents/validation";

const adapters: LocalDemoAdapter[] = [],
  databases: string[] = [];
const createUrl = vi.fn(),
  revokeUrl = vi.fn();
let clipboardDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  localStorage.setItem("printq.student.locale", "en");
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  createUrl.mockReset().mockReturnValue("blob:pickup-test");
  revokeUrl.mockReset();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    },
  );
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (clipboardDescriptor)
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  for (const adapter of adapters.splice(0)) await adapter.dispose();
  for (const name of databases.splice(0)) {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database cleanup blocked"));
    await promise;
  }
  localStorage.removeItem("printq.student.locale");
});
function local() {
  const databaseName = `printq-document-ui-${crypto.randomUUID()}`;
  const demo = createLocalDemo({
    databaseName,
    clock: () => new Date("2026-11-13T10:00:00.000Z"),
  });
  adapters.push(demo.service);
  databases.push(databaseName);
  return demo;
}
function input() {
  return {
    clientRequestId: crypto.randomUUID(),
    documentName: "Private lecture title",
    pageCount: 3,
    copies: 2,
    pageCountSource: "manual" as const,
    colorMode: "bw" as const,
    paperSize: "A4" as const,
    duplex: true,
    instructions: "",
  };
}
function mount(
  children: ReactNode,
  service: LocalDemoAdapter,
  codec?: PickupQrCodec,
  route = "/student",
) {
  return render(
    <TranslationProvider>
      <StudentProvider
        service={service}
        repository={service.repo}
        basePath="/student"
        qrCodec={codec}
      >
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="*" element={children} />
          </Routes>
        </MemoryRouter>
      </StudentProvider>
    </TranslationProvider>,
  );
}
describe("pickup token, actual document and acknowledgment consumers", () => {
  it("preserves a selectable token without claiming QR compatibility when no codec is injected", async () => {
    const { service } = local();
    const job = await service.createJob(input());
    mount(<PickupToken job={job} />, service);
    expect(
      screen.getByText(/A shop-approved QR codec is unavailable/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download QR SVG" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));
    await screen.findByText(/Automatic copying is unavailable/);
    const token = screen.getByRole("textbox", {
      name: "Pickup token",
    }) as HTMLInputElement;
    expect(token).toHaveValue(job.token);
    expect(token.selectionStart).toBe(0);
    expect(token.selectionEnd).toBe(job.token.length);
  });
  it("renders real QR SVG and exports actual SVG bytes containing no document name", async () => {
    const { service } = local();
    const job = await service.createJob(input());
    const view = mount(<PickupToken job={job} />, service, localPickupQrCodec);
    expect(view.container.querySelector("svg")).toBeInTheDocument();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Download QR SVG" }));
    const blob = createUrl.mock.calls.at(-1)?.[0] as Blob;
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    const svg = new TextDecoder().decode(await readBlobBytes(blob));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(job.token);
    expect(svg).not.toContain(job.documentName);
    await waitFor(
      () => expect(revokeUrl).toHaveBeenCalledWith("blob:pickup-test"),
      { timeout: 2000 },
    );
  });
  it("keeps the token readable when SVG export fails", async () => {
    const { service } = local();
    const job = await service.createJob(input());
    mount(<PickupToken job={job} />, service, localPickupQrCodec);
    createUrl.mockImplementation(() => {
      throw new Error("URL export blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: "Download QR SVG" }));
    expect(screen.getByRole("textbox", { name: "Pickup token" })).toHaveValue(
      job.token,
    );
    expect(
      screen.getByText(/QR rendering or export failed/),
    ).toBeInTheDocument();
  });
  it("reopens persisted actual PDF bytes through safe preview and original download", async () => {
    const { service } = local();
    const source = new File(["%PDF-1.7\nFictional guide"], "guide.pdf", {
      type: "application/pdf",
    });
    const job = await service.createJob(input(), source);
    mount(<DocumentView job={job} />, service);
    const frame = await screen.findByTitle("Document preview");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(screen.getByText(/Device-only file/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download original document" }),
    ).toHaveAttribute("download", "guide.pdf");
    const previewBlob = createUrl.mock.calls.at(-1)?.[0] as Blob;
    expect(await readBlobBytes(previewBlob)).toEqual(
      await readBlobBytes(source),
    );
  });
  it("shows service-backed values and nonpayment disclaimer on a reopenable receipt", async () => {
    const { service } = local();
    const job = await service.createJob(input());
    render(
      <TranslationProvider>
        <StudentProvider
          service={service}
          repository={service.repo}
          basePath="/student"
        >
          <MemoryRouter initialEntries={[`/student/jobs/${job.id}/receipt`]}>
            <Routes>
              <Route
                path="/student/jobs/:jobId/receipt"
                element={<ReceiptPage />}
              />
            </Routes>
          </MemoryRouter>
        </StudentProvider>
      </TranslationProvider>,
    );
    await screen.findByText(
      "Order acknowledgment and price estimate — not proof of payment.",
    );
    expect(
      screen.getByText("Campus Demo Print Desk (fictional)"),
    ).toBeInTheDocument();
    const value = (label: string) =>
      screen.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(value("Pickup token")).toHaveTextContent(job.token);
    expect(value("Pages")).toHaveTextContent("3");
    expect(value("Copies")).toHaveTextContent("2");
    expect(value("Estimated price")).toHaveTextContent("₹12.00");
    expect(value("Current status")).toHaveTextContent("Queued");
    expect(
      screen.getByText(/cancelling does not save or print anything/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Paid$/)).not.toBeInTheDocument();
  });
});
