export const PICKUP_PAYLOAD_PREFIX = 'printq:v1:';
export const MAX_PICKUP_INPUT_LENGTH = 160;
export const SHARED_TOKEN_PATTERN =
  /^PQ-(?:\d{4}-\d{4,12}|[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12})$/;

export function encodePickupPayload(token: string): string {
  if (!SHARED_TOKEN_PATTERN.test(token)) {
    throw new Error('Invalid pickup token.');
  }
  return `${PICKUP_PAYLOAD_PREFIX}${token}`;
}

export function decodePickupPayload(value: string, qrOnly = false): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PICKUP_INPUT_LENGTH) return null;
  const payload = trimmed.startsWith(PICKUP_PAYLOAD_PREFIX)
    ? trimmed.slice(PICKUP_PAYLOAD_PREFIX.length)
    : qrOnly
      ? ''
      : trimmed;
  return SHARED_TOKEN_PATTERN.test(payload) ? payload : null;
}

export function createConnectedPickupToken(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random generator is unavailable.');
  }
  if (cryptoApi.randomUUID) {
    return `PQ-${cryptoApi.randomUUID().toUpperCase()}`;
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `PQ-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}
