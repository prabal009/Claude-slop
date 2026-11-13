import type { JobInput, QuoteInput } from "../contracts/jobs";
import {
  MAX_COPIES,
  MAX_NAME_CODE_POINTS,
  MAX_PAGES,
  MAX_INSTRUCTIONS_CODE_POINTS,
} from "../services/config";
export interface ValidationIssue {
  field: string;
  code: string;
  messageKey: string;
  params?: Record<string, string | number>;
}
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly messageKey: string,
    public readonly params?: Record<string, string | number>,
  ) {
    super(messageKey);
    this.name = "DomainError";
  }
}
export class DatasetReplacedError extends DomainError {
  constructor() {
    super("DATASET_REPLACED", "errors.demoDataReplaced");
    this.name = "DatasetReplacedError";
  }
}
export class ValidationError extends DomainError {
  constructor(public readonly issues: ValidationIssue[]) {
    super("VALIDATION", issues[0]?.messageKey ?? "errors.invalidInput");
    this.name = "ValidationError";
  }
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isTimestamp = (value: unknown): value is string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  const normalized = value.includes(".")
    ? value.replace(
        /\.(\d{1,3})Z$/,
        (_match, digits: string) => "." + digits.padEnd(3, "0") + "Z",
      )
    : value.replace("Z", ".000Z");
  return new Date(value).toISOString() === normalized;
};
export const finiteNonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export function parseIntegerText(raw: string, max: number): number | null {
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number >= 1 && number <= max
    ? number
    : null;
}
const issue = (
  field: string,
  code: string,
  params?: Record<string, string | number>,
): ValidationIssue => ({
  field,
  code,
  messageKey: "errors." + code,
  ...(params ? { params } : {}),
});
export function validateQuote(input: QuoteInput): ValidationIssue[] {
  if (!isRecord(input)) return [issue("form", "invalidInput")];
  const errors: ValidationIssue[] = [];
  if (
    !Number.isInteger(input.pageCount) ||
    input.pageCount < 1 ||
    input.pageCount > MAX_PAGES
  )
    errors.push(issue("pageCount", "pagesRange", { max: MAX_PAGES }));
  if (
    !Number.isInteger(input.copies) ||
    input.copies < 1 ||
    input.copies > MAX_COPIES
  )
    errors.push(issue("copies", "copiesRange", { max: MAX_COPIES }));
  if (input.colorMode !== "bw" && input.colorMode !== "colour")
    errors.push(issue("colorMode", "invalidMode"));
  if (typeof input.duplex !== "boolean")
    errors.push(issue("duplex", "invalidDuplex"));
  if (input.paperSize !== "A4") errors.push(issue("paperSize", "invalidPaper"));
  return errors;
}
export function normalizeJobInput(input: JobInput): JobInput {
  if (!isRecord(input))
    throw new ValidationError([issue("form", "invalidInput")]);
  const errors = validateQuote(input);
  const name =
    typeof input.documentName === "string" ? input.documentName.trim() : "";
  const instructions =
    typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (!name) errors.push(issue("documentName", "nameRequired"));
  else if (/[\u0000-\u001f\u007f-\u009f]/u.test(input.documentName))
    errors.push(issue("documentName", "nameControls"));
  else if ([...name].length > MAX_NAME_CODE_POINTS)
    errors.push(
      issue("documentName", "nameTooLong", { max: MAX_NAME_CODE_POINTS }),
    );
  if (
    typeof input.instructions !== "string" ||
    [...instructions].length > MAX_INSTRUCTIONS_CODE_POINTS ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(instructions)
  )
    errors.push(
      issue("instructions", "instructionsInvalid", {
        max: MAX_INSTRUCTIONS_CODE_POINTS,
      }),
    );
  if (!["assumed", "manual", "image"].includes(input.pageCountSource))
    errors.push(issue("pageCountSource", "invalidPageSource"));
  if (
    typeof input.clientRequestId !== "string" ||
    !input.clientRequestId.trim() ||
    input.clientRequestId.length > 128 ||
    /[\u0000-\u001f]/u.test(input.clientRequestId)
  )
    errors.push(issue("clientRequestId", "invalidRequest"));
  if (
    input.expectedLocalGeneration !== undefined &&
    (!Number.isSafeInteger(input.expectedLocalGeneration) ||
      input.expectedLocalGeneration < 1)
  )
    errors.push(issue("expectedLocalGeneration", "invalidGeneration"));
  if (errors.length) throw new ValidationError(errors);
  return { ...input, documentName: name, instructions };
}
export function assertQuote(input: QuoteInput): void {
  const errors = validateQuote(input);
  if (errors.length) throw new ValidationError(errors);
}
export interface RawPrintFields {
  documentName: string;
  copies: string;
  pageCount: string;
  pageCountSource: "assumed" | "manual" | "image";
  colorMode: "bw" | "colour";
  duplex: boolean;
  paperSize: "A4";
  instructions: string;
}
export function validateRawFields(fields: RawPrintFields): {
  input: Omit<JobInput, "clientRequestId" | "expectedLocalGeneration"> | null;
  errors: ValidationIssue[];
} {
  if (!isRecord(fields))
    return { input: null, errors: [issue("form", "invalidInput")] };
  const copies = parseIntegerText(fields.copies, MAX_COPIES);
  const pageCount = parseIntegerText(fields.pageCount, MAX_PAGES);
  try {
    const normalized = normalizeJobInput({
      ...fields,
      copies: copies ?? NaN,
      pageCount: pageCount ?? NaN,
      clientRequestId: "validation",
    });
    const {
      clientRequestId: _id,
      expectedLocalGeneration: _generation,
      ...input
    } = normalized;
    return { input, errors: [] };
  } catch (error) {
    if (error instanceof ValidationError)
      return { input: null, errors: error.issues };
    throw error;
  }
}
