// What an API handler may tell the client about a caught error.
//
// Handlers across the site throw plain `new Error("Enter a valid phone
// number...")` for things the user should read, but the same catch blocks also
// see database, network and payment-provider failures whose messages name
// tables, columns, hosts or provider internals. `publicError` keeps the first
// kind and replaces the second with a generic fallback; the real error is
// always logged server-side.

const INTERNAL_PATTERN =
  /D1_|SQLITE|SQL|no such (table|column)|constraint|syntax error|stack|fetch failed|network|ECONN|ETIMEDOUT|timed? ?out|https?:\/\/|api[_ -]?key|secret|token|stripe|resend|twilio|undefined|null|TypeError|ReferenceError|RangeError|cannot read|is not a function|JSON/i;

const MAX_PUBLIC_LENGTH = 200;

export function publicError(err, fallback) {
  const message = err && typeof err.message === "string" ? err.message.trim() : "";

  if (err && err.expose === true && message) {
    return message.slice(0, MAX_PUBLIC_LENGTH);
  }

  if (message && message.length <= MAX_PUBLIC_LENGTH && !INTERNAL_PATTERN.test(message)) {
    return message;
  }

  console.error("Hidden error detail:", message || err);
  return fallback;
}

export function errorStatus(err, fallbackStatus) {
  return err && Number.isInteger(err.status) ? err.status : fallbackStatus;
}
