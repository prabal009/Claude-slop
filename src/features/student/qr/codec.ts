export interface PickupQrCodec {
  encode(token: string): string;
  decode(payload: string): string | null;
}
export function createUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues)
    throw new Error("errors.secureContextRequired");
  if (cryptoApi.randomUUID) return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}
export function createPickupToken(): string {
  return "PQ-" + createUuid().toUpperCase();
}
const tokenPattern =
  /^PQ-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
export const localPickupQrCodec: PickupQrCodec = {
  encode(token) {
    if (!tokenPattern.test(token)) throw new Error("errors.invalidToken");
    return token;
  },
  decode(payload) {
    return typeof payload === "string" &&
      payload.length === 39 &&
      tokenPattern.test(payload)
      ? payload
      : null;
  },
};
