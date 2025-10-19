const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Run a fetch with a timeout guard.
 * @param {RequestInfo | URL} resource
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 */
export async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a resource and return the response text, throwing on HTTP errors.
 * @param {RequestInfo | URL} resource
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 */
export async function fetchText(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(resource, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`Request to ${resource} failed with status ${response.status}`);
  }
  return await response.text();
}

/**
 * Fetch a resource and return parsed JSON, throwing on HTTP errors.
 * @param {RequestInfo | URL} resource
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 */
export async function fetchJson(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const text = await fetchText(resource, options, timeoutMs);
  return JSON.parse(text);
}
