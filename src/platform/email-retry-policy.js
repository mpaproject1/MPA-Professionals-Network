const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH",
  "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"
]);

export function emailIdempotencyKey(outboxId) {
  const id = String(outboxId ?? "").trim();
  return id ? \`mpa-email-\${id.slice(0, 120)}\` : null;
}

/** Retry only explicit transient provider/network failures; configuration and validation failures are permanent. */
export function classifyEmailDeliveryError(error) {
  const code = String(error?.code || "DELIVERY_FAILED").trim().toUpperCase();
  const match = code.match(/(?:RESEND|DELIVERY)_HTTP_(\d{3})/);
  if (match) {
    const httpStatus = Number(match[1]);
    return { code, httpStatus, retryable: httpStatus === 408 || httpStatus === 429 || (httpStatus >= 500 && httpStatus <= 599) };
  }
  const causeCode = String(error?.cause?.code || "").trim().toUpperCase();
  const retryable = error?.name === "AbortError" || error?.name === "TimeoutError" ||
    NETWORK_ERROR_CODES.has(causeCode) || NETWORK_ERROR_CODES.has(code) ||
    code === "RESEND_UNREACHABLE" || code === "DELIVERY_UNREACHABLE";
  return { code, httpStatus: null, retryable };
}

export function emailRetryDelaySeconds(attempt) {
  const number = Math.max(1, Math.trunc(Number(attempt) || 1));
  return Math.min(3600, 30 * 2 ** Math.min(number, 7));
}
