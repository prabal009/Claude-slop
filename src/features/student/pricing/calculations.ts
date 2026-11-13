import type { QuoteInput } from "../contracts/jobs";
import {
  PRICE_PER_SIDE,
  SECONDS_PER_SIDE,
  SETUP_SECONDS,
} from "../services/config";
import { assertQuote } from "../utils/validation";
export function calculatePrintEstimate(input: QuoteInput) {
  assertQuote(input);
  const printedSides = input.pageCount * input.copies;
  const sheets = input.duplex
    ? input.copies * Math.ceil(input.pageCount / 2)
    : printedSides;
  return {
    printedSides,
    sheets,
    pricePerSide: PRICE_PER_SIDE[input.colorMode],
    estimatedCost: printedSides * PRICE_PER_SIDE[input.colorMode],
    estimatedDurationMinutes:
      (SETUP_SECONDS + printedSides * SECONDS_PER_SIDE[input.colorMode]) / 60,
  };
}
