/**
 * @fileoverview Network utility functions.
 *
 * Provides wrappers around the native `fetch` API to include
 * automatic timeouts and convenient helpers for handling common
 * response types like text and JSON.
 */

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Executes a `fetch` request with an automatic timeout.
 *
 * @param {RequestInfo | URL} resource - The resource to fetch.
 * @param {RequestInit} [options={}] - Optional `fetch` options (e.g., method, headers).
 * @param {number} [timeoutMs=DEFAULT_TIMEOUT_MS] - Timeout duration in milliseconds.
 * @returns {Promise<Response>} A promise that resolves with the `Response` object.
 * @throws {Error} Throws an error if the request times out or is aborted.
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
 * Fetches a resource as text and throws an error if the HTTP response is not 'ok'.
 *
 * @param {RequestInfo | URL} resource - The resource to fetch.
 * @param {RequestInit} [options={}] - Optional `fetch` options.
 * @param {number} [timeoutMs=DEFAULT_TIMEOUT_MS] - Timeout duration in milliseconds.
 * @returns {Promise<string>} A promise that resolves with the response text.
 * @throws {Error} Throws an error if the fetch fails, times out, or the status is not ok.
 */
export async function fetchText(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const response = await fetchWithTimeout(resource, options, timeoutMs);
    if (!response.ok) {
        throw new Error(`Request to ${resource} failed with status ${response.status}`);
    }
    return await response.text();
}

/**
 * Fetches a resource, parses it as JSON, and throws an error if the response is not 'ok'.
 *
 * @param {RequestInfo | URL} resource - The resource to fetch.
 * @param {RequestInit} [options={}] - Optional `fetch` options.
 * @param {number} [timeoutMs=DEFAULT_TIMEOUT_MS] - Timeout duration in milliseconds.
 * @returns {Promise<any>} A promise that resolves with the parsed JSON object.
 * @throws {Error} Throws an error if fetch fails, times out, status is not ok, or JSON parsing fails.
 */
export async function fetchJson(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const text = await fetchText(resource, options, timeoutMs);
    return JSON.parse(text);
}