export function money(value: number | null, locale = "en-IN") {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(value);
}
export function number(value: number | null, locale = "en-IN") {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
export function date(value: string | null, locale = "en-IN") {
  return value === null
    ? "—"
    : new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value));
}
export function safeBasePath(value: string = "/student") {
  return /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\/?$/.test(value)
    ? value.replace(/\/$/, "")
    : "/student";
}
