/**
 * API client — one function for every backend operation.
 * Real mode: POST text/plain JSON to the Apps Script web app (no CORS preflight).
 * Mock mode: the same payload goes to the in-browser copy of the backend.
 */
import { CONFIG } from '../config.js';

export const isMock = !CONFIG.apiUrl || new URLSearchParams(location.search).get('mock') === '1';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FRIENDLY = {
  NETWORK: 'You seem to be offline. Check your connection and try again.',
  TIMEOUT: 'The server took too long to answer. Please try again.'
};

async function realCall(payload, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: 'follow'
    });
    if (!res.ok) throw new ApiError('NETWORK', FRIENDLY.NETWORK);
    return await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', e.name === 'AbortError' ? FRIENDLY.TIMEOUT : FRIENDLY.NETWORK);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls a backend action. Network failures are retried once for idempotent requests (anything that
 * carries a generationId, or reads). Server errors are never retried.
 */
export async function api(action, params = {}, { timeoutMs = 60000 } = {}) {
  const payload = { action, ...params };
  const send = async () => {
    if (isMock) {
      const { mockCall } = await import('../mock/mock-backend.js');
      return mockCall(payload);
    }
    return realCall(payload, timeoutMs);
  };
  let res;
  try {
    res = await send();
  } catch (e) {
    const retryable = e instanceof ApiError && e.code === 'NETWORK' && (params.generationId || !/request|approve|reject|create|save/.test(action));
    if (!retryable) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    res = await send();
  }
  if (!res || typeof res !== 'object') throw new ApiError('SERVER_ERROR', 'Unexpected response from the server.');
  if (!res.ok) throw new ApiError(res.error?.code || 'SERVER_ERROR', res.error?.message || 'Something went wrong.');
  return res.data;
}

export function newRequestId(prefix = 'gen') {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return prefix + '-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
