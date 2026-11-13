import { describe, it, expect } from "vitest";
import { calculatePrintEstimate } from "../pricing/calculations";
import {
  parseIntegerText,
  validateRawFields,
  type RawPrintFields,
} from "../utils/validation";
import { safeBasePath } from "../utils/format";
const fields: RawPrintFields = {
  documentName: "Operating_Systems_Notes.pdf",
  copies: "1",
  pageCount: "1",
  pageCountSource: "assumed",
  colorMode: "bw",
  duplex: false,
  paperSize: "A4",
  instructions: "",
};
describe("student input boundaries", () => {
  it.each([
    "",
    "-1",
    "0",
    "1.5",
    "1e2",
    " 2",
    "NaN",
    "Infinity",
    "１０",
    "101",
  ])("rejects invalid copy editing text %j", (raw) => {
    expect(parseIntegerText(raw, 100)).toBeNull();
    expect(validateRawFields({ ...fields, copies: raw }).input).toBeNull();
  });
  it.each(["", "   ", "a\u0000b", "a\u007fb", "😀".repeat(121)])(
    "rejects missing, controlled or overlong names",
    (documentName) => {
      expect(
        validateRawFields({ ...fields, documentName }).errors.some(
          (error) => error.field === "documentName",
        ),
      ).toBe(true);
    },
  );
  it("normalizes only outer spaces while retaining Unicode and punctuation", () => {
    const result = validateRawFields({
      ...fields,
      documentName: "  Notes — हिंदी / ಕನ್ನಡ (final).pdf  ",
      instructions: "  Staple top left.  ",
    });
    expect(result.input?.documentName).toBe("Notes — हिंदी / ಕನ್ನಡ (final).pdf");
    expect(result.input?.instructions).toBe("Staple top left.");
  });
  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(
      validateRawFields({ ...fields, documentName: "😀".repeat(120) }).errors,
    ).toEqual([]);
  });
  it("rejects invalid page bounds and instructions", () => {
    expect(
      validateRawFields({ ...fields, pageCount: "10001" }).input,
    ).toBeNull();
    expect(
      validateRawFields({ ...fields, instructions: "x".repeat(501) }).input,
    ).toBeNull();
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/student?next=evil",
    "/a/../b",
    "/a#x",
    "javascript:alert(1)",
    "",
  ])("does not use malformed base paths %s", (base) =>
    expect(safeBasePath(base)).toBe("/student"),
  );
  it("allows a nested local host route", () =>
    expect(safeBasePath("/campus/student/")).toBe("/campus/student"));
});
describe("documented print arithmetic", () => {
  it("charges printed sides with one setup per job", () => {
    const bw = calculatePrintEstimate({
      pageCount: 10,
      copies: 2,
      colorMode: "bw",
      duplex: false,
      paperSize: "A4",
    });
    expect(bw).toMatchObject({
      printedSides: 20,
      sheets: 20,
      estimatedCost: 40,
      estimatedDurationMinutes: 9,
    });
    const colour = calculatePrintEstimate({
      pageCount: 10,
      copies: 2,
      colorMode: "colour",
      duplex: false,
      paperSize: "A4",
    });
    expect(colour).toMatchObject({
      estimatedCost: 200,
      estimatedDurationMinutes: 17,
    });
  });
  it("rounds duplex sheets separately for each copy without changing sided pricing", () => {
    expect(
      calculatePrintEstimate({
        pageCount: 3,
        copies: 2,
        colorMode: "bw",
        duplex: true,
        paperSize: "A4",
      }),
    ).toMatchObject({
      printedSides: 6,
      sheets: 4,
      estimatedCost: 12,
      estimatedDurationMinutes: 3.4,
    });
  });
  it("retains finite allowed maxima", () => {
    const result = calculatePrintEstimate({
      pageCount: 10000,
      copies: 100,
      colorMode: "colour",
      duplex: true,
      paperSize: "A4",
    });
    expect(result.estimatedCost).toBe(10000000);
    expect(Number.isFinite(result.estimatedDurationMinutes)).toBe(true);
    expect(result.sheets).toBe(500000);
  });
});
