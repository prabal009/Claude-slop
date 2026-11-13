import { describe, it, expect } from "vitest";
import { localPickupQrCodec, createPickupToken } from "../qr/codec";
const token = "PQ-45676543-1234-4321-ABCD-1234567890AB";
describe("local pickup identifier contract", () => {
  it("encodes exactly the raw stable token with no document metadata", () => {
    expect(localPickupQrCodec.encode(token)).toBe(token);
    expect(localPickupQrCodec.decode(token)).toBe(token);
  });
  it.each([
    "",
    token.toLowerCase(),
    token + "\n",
    " " + token,
    token + "x",
    token.replace("-4321-", "-1321-"),
    "https://example.test/" + token,
    "javascript:alert(1)",
    "<img src=x onerror=alert(1)>",
    "x".repeat(100000),
  ])("rejects the entire malformed payload", (value) =>
    expect(localPickupQrCodec.decode(value)).toBeNull(),
  );
  it("generates distinct complete cryptographic tokens", () => {
    const first = createPickupToken();
    const second = createPickupToken();
    expect(first).not.toBe(second);
    expect(localPickupQrCodec.decode(first)).toBe(first);
    expect(localPickupQrCodec.decode(second)).toBe(second);
  });
  it("does not turn an unapproved payload into a local token", () =>
    expect(() =>
      localPickupQrCodec.encode("student:token:" + token),
    ).toThrow());
});
