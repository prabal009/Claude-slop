/// <reference lib="es2024.promise" />
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DocumentUpload } from "../components/DocumentUpload";
import { DocumentPreview } from "../documents/DocumentPreview";
import { TranslationProvider } from "../i18n/TranslationProvider";
import type { Draft } from "../storage/drafts";
import { jpegImageBytes, pngImageBytes } from "./document-image-fixtures";

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft",
    clientRequestId: "request",
    generation: 1,
    revision: 1,
    state: "editing",
    committedJobId: null,
    updatedAt: "2026-11-13T10:00:00.000Z",
    file: null,
    fileVersion: null,
    originalFileName: null,
    mimeType: null,
    fileSize: null,
    fileMissing: false,
    documentName: "My edited title",
    copies: "1",
    pageCount: "1",
    pageCountSource: "assumed",
    colorMode: "bw",
    duplex: false,
    paperSize: "A4",
    instructions: "",
    ...overrides,
  };
}
function Harness({
  initial = makeDraft(),
  onPendingChange,
  onValidityChange,
}: {
  initial?: Draft;
  onPendingChange?: (value: boolean) => void;
  onValidityChange?: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <TranslationProvider>
      <input
        aria-label="Title"
        value={draft.documentName}
        onChange={(event) =>
          setDraft({ ...draft, documentName: event.target.value })
        }
      />
      <output data-testid="provenance">
        {draft.pageCountSource}:{draft.pageCount}
      </output>
      <button
        type="button"
        onClick={() =>
          setDraft((current) =>
            makeDraft({
              id: "fresh",
              generation: current.generation + 1,
              documentName: "Fresh",
            }),
          )
        }
      >
        Reset test draft
      </button>
      <DocumentUpload
        draft={draft}
        onChange={(fields) =>
          setDraft((current) => ({ ...current, ...fields }))
        }
        onPendingChange={onPendingChange}
        onValidityChange={onValidityChange}
      />
    </TranslationProvider>
  );
}
const createUrl = vi.fn(),
  revokeUrl = vi.fn();
beforeEach(() => {
  localStorage.removeItem("printq.student.locale");
  createUrl.mockReset().mockReturnValue("blob:printq-test");
  revokeUrl.mockReset();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    },
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 827, height: 1169, close: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("document selection, preservation and previews", () => {
  it("retains prior valid file and edited title when replacement fails", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Optional document", {
      selector: "input",
    });
    fireEvent.change(input, {
      target: {
        files: [
          new File(["%PDF-1.7 fictional"], "first.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    await screen.findByText(/first.pdf ·/);
    expect(screen.getByLabelText("Title")).toHaveValue("My edited title");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["MZ executable"], "bad.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await screen.findByRole("alert");
    expect(screen.getByText(/first.pdf ·/)).toBeInTheDocument();
    expect(screen.queryByText(/bad.pdf ·/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("My edited title");
    expect(
      screen.getByText(/Your previous valid attachment remains selected/),
    ).toBeInTheDocument();
  });
  it("blocks a rejected first attachment until explicit removal and reports validation pending", async () => {
    const pending = vi.fn(),
      valid = vi.fn();
    render(<Harness onPendingChange={pending} onValidityChange={valid} />);
    fireEvent.change(
      screen.getByLabelText("Optional document", { selector: "input" }),
      { target: { files: [new File([], "empty.pdf")] } },
    );
    await screen.findByRole("alert");
    expect(pending).toHaveBeenCalledWith(true);
    expect(pending).toHaveBeenLastCalledWith(false);
    expect(valid).toHaveBeenLastCalledWith(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove attempted attachment" }),
    );
    expect(valid).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("discards an image selection completed after dataset/draft replacement", async () => {
    const gate = Promise.withResolvers<{
      width: number;
      height: number;
      close: () => void;
    }>();
    const decoder = vi.fn().mockReturnValue(gate.promise);
    vi.stubGlobal("createImageBitmap", decoder);
    const pending = vi.fn();
    render(<Harness onPendingChange={pending} />);
    fireEvent.change(
      screen.getByLabelText("Optional document", { selector: "input" }),
      { target: { files: [new File([jpegImageBytes()], "old.jpg")] } },
    );
    await waitFor(() => expect(decoder).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Reset test draft" }));
    await act(async () => {
      gate.resolve({ width: 827, height: 1169, close: vi.fn() });
      await gate.promise;
    });
    expect(screen.queryByText(/old.jpg ·/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Fresh");
    expect(screen.getByTestId("provenance")).toHaveTextContent("assumed:1");
    expect(pending).toHaveBeenLastCalledWith(false);
  });
  it("uses image page provenance but preserves manually verified page counts across replacement", async () => {
    const view = render(<Harness />);
    fireEvent.change(
      screen.getByLabelText("Optional document", { selector: "input" }),
      { target: { files: [new File([pngImageBytes()], "image.png")] } },
    );
    await waitFor(() =>
      expect(screen.getByTestId("provenance")).toHaveTextContent("image:1"),
    );
    await screen.findByText(/approximately 100 DPI/);
    view.unmount();
    render(
      <Harness
        initial={makeDraft({ pageCountSource: "manual", pageCount: "9" })}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Optional document", { selector: "input" }),
      { target: { files: [new File([jpegImageBytes()], "photo.jpg")] } },
    );
    await screen.findByText(/photo.jpg ·/);
    expect(screen.getByTestId("provenance")).toHaveTextContent("manual:9");
    expect(
      screen.getByText(
        "Page count was entered manually, not independently verified.",
      ),
    ).toBeInTheDocument();
  });
  it.each<[string, Uint8Array<ArrayBuffer>]>([
    ["oversized.png", pngImageBytes(8193, 10)],
    ["oversized.jpg", jpegImageBytes(4001, 4000)],
    ["unreadable.png", pngImageBytes().subarray(0, 8)],
    ["unreadable.jpg", jpegImageBytes().subarray(0, 3)],
  ])(
    "retains %s as a valid downloadable attachment but creates no automatic image sink",
    async (name, bytes) => {
      const decoder = vi.fn(),
        fallbackImage = vi.fn(),
        valid = vi.fn();
      vi.stubGlobal("createImageBitmap", decoder);
      vi.stubGlobal("Image", fallbackImage);
      const view = render(<Harness onValidityChange={valid} />);
      fireEvent.change(
        screen.getByLabelText("Optional document", { selector: "input" }),
        { target: { files: [new File([bytes], name)] } },
      );
      const download = await screen.findByRole("link", {
        name: "Download original document",
      });
      expect(download).toHaveAttribute("download", name);
      expect(view.container.querySelector("img")).toBeNull();
      expect(decoder).not.toHaveBeenCalled();
      expect(fallbackImage).not.toHaveBeenCalled();
      expect(valid).toHaveBeenLastCalledWith(true);
      expect(
        screen.getAllByText(/image quality was not assessed/).length,
      ).toBeGreaterThan(0);
    },
  );
  it("requires explicit recovery for a missing saved blob and allows remove", () => {
    render(
      <Harness
        initial={makeDraft({
          fileMissing: true,
          originalFileName: "missing.pdf",
          mimeType: "application/pdf",
          fileSize: 5,
        })}
      />,
    );
    expect(
      screen.getByText(/The saved file is unavailable/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove selected file" }),
    );
    expect(
      screen.queryByText(/The saved file is unavailable/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/No attachment selected/)).toBeInTheDocument();
  });
  it("renders a sandboxed PDF with honest fallback and revokes URLs on replacement/unmount", async () => {
    const first = {
      file: new File(["%PDF-1.7"], "one.pdf"),
      mimeType: "application/pdf",
      extension: "pdf" as const,
      kind: "pdf" as const,
    };
    const second = { ...first, file: new File(["%PDF-1.7 two"], "two.pdf") };
    const view = render(
      <TranslationProvider>
        <DocumentPreview document={first} />
      </TranslationProvider>,
    );
    const frame = await screen.findByTitle("Document preview");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(
      screen.getByText(/A frame loading does not confirm rendering/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download original document" }),
    ).toHaveAttribute("download", "one.pdf");
    view.rerender(
      <TranslationProvider>
        <DocumentPreview document={second} />
      </TranslationProvider>,
    );
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });
  it("shows office download without creating an active document preview", async () => {
    render(
      <TranslationProvider>
        <DocumentPreview
          document={{
            file: new File(["word"], "notes.doc"),
            mimeType: "application/msword",
            extension: "doc",
            kind: "office",
          }}
        />
      </TranslationProvider>,
    );
    await screen.findByRole("link", { name: "Download original document" });
    expect(screen.queryByTitle("Document preview")).not.toBeInTheDocument();
    expect(screen.getByText(/Word preview is unavailable/)).toBeInTheDocument();
  });
});
