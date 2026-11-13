import { describe, expect, it } from "vitest";
import {
  calculateEcoComparison,
  summarizeEcoSavings,
} from "../ecoprint/calculations";
import { MAX_COPIES, MAX_PAGES } from "../services/config";

const request = {
  pageCount: 3,
  copies: 2,
  duplex: true,
  colorMode: "bw",
  paperSize: "A4",
  status: "queued",
  pageCountSource: "manual",
  dataOrigin: "local-user",
};

describe("request-based EcoPrint accounting", () => {
  it("uses per-copy odd-page rounding and exact shared print sheet math", () => {
    expect(calculateEcoComparison(3, 2)).toEqual({
      simplexSheets: 6,
      duplexSheets: 4,
      savedSheets: 2,
    });
    expect(calculateEcoComparison(1, 100)).toEqual({
      simplexSheets: 100,
      duplexSheets: 100,
      savedSheets: 0,
    });
    expect(calculateEcoComparison(4, 2)).toEqual({
      simplexSheets: 8,
      duplexSheets: 4,
      savedSheets: 4,
    });
  });

  it("counts all valid statuses but only duplex requests contribute savings", () => {
    expect(
      summarizeEcoSavings([
        request,
        {
          ...request,
          copies: 1,
          status: "collected",
          dataOrigin: "demo-fixture",
          pageCountSource: "assumed",
        },
        { ...request, duplex: false, status: "printing" },
        { ...request, pageCount: 1, status: "ready", pageCountSource: "image" },
      ]),
    ).toEqual({
      savedSheets: 3,
      included: 4,
      omitted: 0,
      assumed: 1,
      fixtures: 1,
    });
  });

  it("does not invent zero savings for invalid or unknown input records", () => {
    const invalid = [
      null,
      {},
      { ...request, pageCount: null },
      { ...request, copies: NaN },
      { ...request, pageCount: Infinity },
      { ...request, pageCount: -1 },
      { ...request, copies: 1.5 },
      { ...request, copies: MAX_COPIES + 1 },
      { ...request, pageCount: MAX_PAGES + 1 },
      { ...request, duplex: undefined },
      { ...request, colorMode: "color" },
      { ...request, paperSize: "A3" },
      { ...request, status: "submitted" },
      { ...request, pageCountSource: "detected" },
      { ...request, dataOrigin: "unknown" },
    ];
    expect(summarizeEcoSavings(invalid)).toEqual({
      savedSheets: 0,
      included: 0,
      omitted: invalid.length,
      assumed: 0,
      fixtures: 0,
    });
  });

  it("remains finite at the supported maxima and rejects invalid comparisons", () => {
    const result = calculateEcoComparison(MAX_PAGES, MAX_COPIES);
    expect(result).toEqual({
      simplexSheets: 1_000_000,
      duplexSheets: 500_000,
      savedSheets: 500_000,
    });
    for (const [pages, copies] of [
      [0, 1],
      [1, 0],
      [3.5, 1],
      [1, Infinity],
      [MAX_PAGES + 1, 1],
    ]) {
      expect(() => calculateEcoComparison(pages, copies)).toThrow();
    }
    expect(summarizeEcoSavings([])).toEqual({
      savedSheets: 0,
      included: 0,
      omitted: 0,
      assumed: 0,
      fixtures: 0,
    });
  });
});
