import { afterEach, describe, expect, it, vi } from "vitest";
import { validateFile } from "../documents/validation";
import { qualityCheck } from "../documents/qualityCheck";
import { MAX_FILE_BYTES } from "../services/config";
import type { Draft } from "../storage/drafts";
import { jpegImageBytes, pngImageBytes } from "./document-image-fixtures";

function docx(
  parts = ["[Content_Types].xml", "word/document.xml"],
  options: {
    encrypted?: boolean;
    badOffset?: boolean;
    descriptor?: boolean;
  } = {},
) {
  const encoder = new TextEncoder();
  const records: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0;
  for (const name of parts) {
    const filename = encoder.encode(name),
      data = encoder.encode(
        name === "word/document.xml"
          ? '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
          : '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      );
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const flags = (options.encrypted ? 1 : 0) | (options.descriptor ? 8 : 0);
    const local = new Uint8Array(
      30 + filename.length + data.length + (options.descriptor ? 16 : 0),
    );
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, flags, true);
    if (!options.descriptor) {
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
    }
    view.setUint16(26, filename.length, true);
    local.set(filename, 30);
    local.set(data, 30 + filename.length);
    if (options.descriptor) {
      const start = 30 + filename.length + data.length;
      view.setUint32(start, 0x08074b50, true);
      view.setUint32(start + 4, crc, true);
      view.setUint32(start + 8, data.length, true);
      view.setUint32(start + 12, data.length, true);
    }
    const central = new Uint8Array(46 + filename.length),
      cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, filename.length, true);
    cv.setUint32(42, options.badOffset ? 0xffffff00 : offset, true);
    central.set(filename, 46);
    records.push(local);
    directory.push(central);
    offset += local.length;
  }
  const size = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, parts.length, true);
  ev.setUint16(10, parts.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + 22);
  let cursor = 0;
  for (const entry of [...records, ...directory, end]) {
    result.set(entry, cursor);
    cursor += entry.length;
  }
  return result;
}
function draft(overrides: Partial<Draft> = {}): Draft {
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
    documentName: "Notes",
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
afterEach(() => vi.unstubAllGlobals());
describe("document bytes, formats and boundaries", () => {
  it.each(["", "application/octet-stream", "application/pdf"])(
    "accepts verified PDF with MIME %s and canonicalises it",
    async (mime) => {
      const result = await validateFile(
        new File(["%PDF-1.7\nfictional"], "Notes.PDF", { type: mime }),
      );
      expect(result.mimeType).toBe("application/pdf");
      expect(result.kind).toBe("pdf");
    },
  );
  it("checks PDF within the first 1024 bytes without claiming structure or encryption analysis", async () => {
    await expect(
      validateFile(new File([" ".repeat(1019) + "%PDF-"], "a.pdf")),
    ).resolves.toMatchObject({ kind: "pdf" });
    await expect(
      validateFile(new File([" ".repeat(1020) + "%PDF-"], "a.pdf")),
    ).rejects.toMatchObject({ messageKey: "documents.signatureMismatch" });
  });
  it("allows exactly 10 MiB and rejects an extra byte", async () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES);
    bytes.set(new TextEncoder().encode("%PDF-"));
    await expect(
      validateFile(new File([bytes], "a.pdf")),
    ).resolves.toMatchObject({ mimeType: "application/pdf" });
    await expect(
      validateFile(new File([bytes, "x"], "a.pdf")),
    ).rejects.toMatchObject({ messageKey: "documents.tooLarge" });
  });
  it.each<[File, string]>([
    [new File([], "a.pdf"), "empty"],
    [new File(["%PDF-"], "a.html"), "unsupported"],
    [new File(["MZ executable"], "renamed.pdf"), "signatureMismatch"],
    [new File(["%PDF-"], "a.pdf", { type: "text/html" }), "mimeMismatch"],
    [new File(["%PDF-"], ""), "invalidName"],
    [new File(["%PDF-"], "bad\u0000.pdf"), "invalidName"],
    [new File(["%PDF-"], "folder/file.pdf"), "invalidName"],
  ])("rejects unsafe or mismatched file %#", async (file, code) => {
    await expect(validateFile(file)).rejects.toMatchObject({
      messageKey: `documents.${code}`,
    });
  });
  it("accepts OLE DOC and rejects a falsely renamed Word file", async () => {
    await expect(
      validateFile(
        new File(
          [new Uint8Array([208, 207, 17, 224, 161, 177, 26, 225])],
          "a.doc",
        ),
      ),
    ).resolves.toMatchObject({ mimeType: "application/msword" });
    await expect(
      validateFile(new File(["%PDF-"], "a.doc")),
    ).rejects.toMatchObject({ messageKey: "documents.signatureMismatch" });
  });
  it("accepts bounded DOCX ZIP records with required parts, including valid data descriptors", async () => {
    for (const descriptor of [false, true])
      await expect(
        validateFile(new File([docx(undefined, { descriptor })], "a.docx")),
      ).resolves.toMatchObject({ kind: "office" });
  });
  it("rejects encryption, bad offsets, duplicate or absent DOCX parts and truncated ZIP records", async () => {
    for (const bytes of [
      docx(undefined, { encrypted: true }),
      docx(undefined, { badOffset: true }),
      docx(["word/document.xml"]),
      docx(["word/document.xml", "word/document.xml"]),
      docx().subarray(0, 50),
    ]) {
      await expect(
        validateFile(new File([bytes], "a.docx")),
      ).rejects.toMatchObject({ messageKey: "documents.invalidDocx" });
    }
  });
  it.each<[string, Uint8Array<ArrayBuffer>, string]>([
    ["a.png", pngImageBytes(), "image/png"],
    ["a.jpg", jpegImageBytes(), "image/jpeg"],
    ["a.JPEG", jpegImageBytes(), "image/jpeg"],
  ])(
    "validates actual encoded image bytes and measures decoded pixels for %s",
    async (name, bytes, mimeType) => {
      const close = vi.fn();
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue({ width: 827, height: 1169, close }),
      );
      const result = await validateFile(new File([bytes], name));
      expect(result).toMatchObject({
        kind: "image",
        mimeType,
        width: 827,
        height: 1169,
      });
      expect(close).toHaveBeenCalledOnce();
      expect(result.previewUnavailable).toBeUndefined();
    },
  );
  it("keeps signature-valid image usable with a warning when decoding is unavailable", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decoder unavailable")),
    );
    const file = new File([jpegImageBytes()], "a.jpg");
    const document = await validateFile(file);
    expect(document.width).toBeUndefined();
    expect(qualityCheck(draft({ file }), document)).toContainEqual(
      expect.objectContaining({ code: "decode", state: "warning" }),
    );
  });
  it.each<[string, Uint8Array<ArrayBuffer>]>([
    ["large-edge.png", pngImageBytes(8193, 10)],
    ["large-pixels.png", pngImageBytes(4001, 4000)],
    ["huge-header.png", pngImageBytes(0x7fffffff, 0x7fffffff)],
    ["large-edge.jpg", jpegImageBytes(8193, 10)],
    ["large-pixels.jpg", jpegImageBytes(4001, 4000)],
  ])(
    "accepts %s for original download without ever entering either browser decoder",
    async (name, bytes) => {
      const bitmap = vi.fn(),
        image = vi.fn();
      vi.stubGlobal("createImageBitmap", bitmap);
      vi.stubGlobal("Image", image);
      const file = new File([bytes], name);
      const document = await validateFile(file);
      expect(document).toMatchObject({
        file,
        kind: "image",
        previewUnavailable: "dimensions-exceed-limit",
      });
      expect(document.width).toBeUndefined();
      expect(bitmap).not.toHaveBeenCalled();
      expect(image).not.toHaveBeenCalled();
      const findings = qualityCheck(draft({ file }), document);
      expect(findings).toContainEqual(
        expect.objectContaining({
          state: "warning",
          messageKey: "documents.preview.dimensions-exceed-limit",
        }),
      );
      expect(
        findings.some(
          (finding) =>
            finding.state === "error" || finding.code === "resolution",
        ),
      ).toBe(false);
    },
  );
  it("never decodes unreadable dimensions or a JPEG SOF beyond its bounded metadata budget", async () => {
    const bitmap = vi.fn(),
      image = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    vi.stubGlobal("Image", image);
    const jpeg = jpegImageBytes(),
      delayedSof = new Uint8Array(jpeg.length + 65537);
    delayedSof.set(jpeg.subarray(0, 2));
    delayedSof.set([255, 225], 2);
    new DataView(delayedSof.buffer).setUint16(4, 65535);
    delayedSof.set(jpeg.subarray(2), 65539);
    const invalidPngHeader = pngImageBytes();
    new DataView(invalidPngHeader.buffer).setUint32(8, 0xffffffff);
    for (const file of [
      new File([pngImageBytes().subarray(0, 8)], "truncated.png"),
      new File([jpeg.subarray(0, 3)], "truncated.jpg"),
      new File([invalidPngHeader], "invalid-header.png"),
      new File([delayedSof], "large-metadata.jpg"),
    ]) {
      const document = await validateFile(file);
      expect(document).toMatchObject({
        file,
        previewUnavailable: "dimensions-unavailable",
      });
      expect(
        qualityCheck(draft({ file }), document).some(
          (finding) => finding.state === "error",
        ),
      ).toBe(false);
    }
    expect(bitmap).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
  });
  it("does not expose decoded dimensions when they contradict the bounded header", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }),
    );
    await expect(
      validateFile(new File([pngImageBytes()], "mismatch.png")),
    ).resolves.toMatchObject({ previewUnavailable: "decode-unavailable" });
  });
});
describe("truthful comprehensive quality findings", () => {
  it("allows name-only requests but warns about assumed pages and explicitly does not scan malware", () => {
    const findings = qualityCheck(draft(), null);
    expect(findings.filter((item) => item.state === "error")).toEqual([]);
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "nameOnly", state: "pass" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "pages", state: "warning" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "malware", state: "not-applicable" }),
    );
  });
  it("flags raw invalid fields and missing attachments instead of silently converting intent", () => {
    const findings = qualityCheck(
      draft({ copies: "1e2", documentName: "", fileMissing: true }),
      null,
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "copiesRange", state: "error" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "nameRequired", state: "error" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ code: "missing", state: "error" }),
    );
  });
  it("reports conservative full-A4 resolution and never guarantees output quality", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 827, height: 1169, close: vi.fn() }),
    );
    const file = new File([pngImageBytes()], "a.png");
    const document = await validateFile(file);
    expect(
      qualityCheck(draft({ file, pageCountSource: "image" }), document),
    ).toContainEqual(
      expect.objectContaining({
        code: "resolution",
        state: "warning",
        params: { width: 827, height: 1169, dpi: 100 },
      }),
    );
  });
  it("labels PDF analysis limits and manual page provenance as reviewable, not a false clean scan", async () => {
    const file = new File(["%PDF- /Encrypt placeholder"], "a.pdf");
    const findings = qualityCheck(
      draft({ file, pageCountSource: "manual" }),
      await validateFile(file),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "pdfAnalysis",
        state: "warning",
        messageKey: "documents.pdfLimits",
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "pages",
        messageKey: "documents.manualPages",
      }),
    );
    expect(findings.filter((item) => item.state === "error")).toEqual([]);
  });
});
