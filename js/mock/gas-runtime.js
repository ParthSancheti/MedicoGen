/**
 * A small in-memory Google Apps Script runtime.
 *
 * Mock mode runs the REAL backend source (apps-script/*.js) against these shims, so the token
 * accounting, idempotency, referral rules and admin operations you test locally are the same code
 * that runs on Apps Script. Only the outside world is simulated: Sheets/Drive/Cache live in a
 * JSON state object. UrlFetchApp sends Mistral calls to the local dev proxy (/api/mistral, real
 * key from .env) when it is available, and otherwise answers with a local composer.
 *
 * Works in the browser and in Node (tests).
 */
import { mockMistralResponse } from './mock-mistral.js';

/* ---------- synchronous SHA-256 (Utilities.computeDigest is synchronous) ---------- */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
function sha256Bytes(bytes) {
  const l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(withPad); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(withPad - 4, l * 8); dv.setUint32(withPad - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < withPad; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32); const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}

const utf8 = (s) => new TextEncoder().encode(String(s));
const toSigned = (bytes) => Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
function b64encode(bytes) {
  let bin = ''; const u = Uint8Array.from(bytes, (b) => (b + 256) % 256);
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(s) {
  const bin = atob(String(s).replace(/\s/g, ''));
  return toSigned(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function uuid() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ---------- runtime ---------- */

export function emptyState() {
  return { props: {}, sheets: {}, files: {}, cache: {} };
}

let proxyReady = null; // is the dev server's /api/mistral proxy available with a key?

export function createRuntime(state, hooks = {}) {
  const save = () => hooks.onChange && hooks.onChange(state);

  class Range {
    constructor(rows, r, c, nr, nc) { Object.assign(this, { rows, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.rows[this.r - 1 + i] || [];
        const vals = [];
        for (let j = 0; j < this.nc; j++) vals.push(row[this.c - 1 + j] ?? '');
        out.push(vals);
      }
      return out;
    }
    setValues(values) {
      for (let i = 0; i < this.nr; i++) {
        const idx = this.r - 1 + i;
        while (this.rows.length <= idx) this.rows.push([]);
        for (let j = 0; j < this.nc; j++) this.rows[idx][this.c - 1 + j] = String(values[i][j] ?? '');
      }
      save();
      return this;
    }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; }
    get rows() { return state.sheets[this.name]; }
    getName() { return this.name; }
    getLastRow() { let n = this.rows.length; while (n > 0 && !(this.rows[n - 1] || []).some((v) => v !== '')) n--; return n; }
    getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this.rows, r, c, nr, nc); }
    appendRow(arr) { this.rows.push(arr.map(String)); save(); return this; }
    setFrozenRows() { return this; }
  }
  const spreadsheet = {
    getId: () => 'mock-spreadsheet',
    getSheetByName: (n) => (state.sheets[n] ? new Sheet(n) : null),
    insertSheet: (n) => { state.sheets[n] = []; save(); return new Sheet(n); }
  };

  const globals = {
    Logger: { log: (...a) => hooks.log && hooks.log(...a) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in state.props ? state.props[k] : null),
        setProperty: (k, v) => { state.props[k] = String(v); save(); },
        getProperties: () => ({ ...state.props })
      })
    },
    SpreadsheetApp: {
      openById: () => spreadsheet,
      getActiveSpreadsheet: () => spreadsheet,
      create: () => spreadsheet,
      flush: () => {}
    },
    LockService: {
      // JavaScript here is single-threaded, so the lock can never be contended; the backend still
      // runs its full lock/unlock path so the code under test is identical.
      getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => { const e = state.cache[k]; if (!e) return null; if (e.exp < Date.now()) { delete state.cache[k]; return null; } return e.v; },
        put: (k, v, ttl = 600) => { state.cache[k] = { v: String(v), exp: Date.now() + ttl * 1000 }; save(); },
        remove: (k) => { delete state.cache[k]; save(); }
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      getUuid: uuid,
      computeDigest: (_alg, value) => toSigned(sha256Bytes(typeof value === 'string' ? utf8(value) : Uint8Array.from(value, (b) => (b + 256) % 256))),
      base64Encode: (bytes) => b64encode(bytes),
      base64Decode: (s) => b64decode(s),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes, getContentType: () => mime, getName: () => name }),
      sleep: () => {}
    },
    DriveApp: {
      createFolder: () => ({ getId: () => 'mock-folder', createFile: (blob) => globals.DriveApp._create(blob) }),
      getFolderById: () => ({ getId: () => 'mock-folder', createFile: (blob) => globals.DriveApp._create(blob) }),
      getFileById: (id) => {
        const f = state.files[id];
        if (!f) throw new Error('No such file');
        const bytes = b64decode(f.b64);
        return { getBlob: () => ({ getBytes: () => bytes, getContentType: () => f.mime }), getId: () => id };
      },
      _create(blob) {
        const id = 'file-' + uuid();
        state.files[id] = { name: blob.name, mime: blob.mime, b64: b64encode(blob.bytes) };
        save();
        return { getId: () => id, getUrl: () => '#' + id };
      }
    },
    UrlFetchApp: {
      fetch: (url, opts = {}) => {
        hooks.onFetch && hooks.onFetch(String(url));
        if (String(url).includes('api.mistral.ai')) {
          const mode = state.props.MOCK_AI || 'ok';
          const request = JSON.parse(opts.payload || '{}');
          if (mode !== 'ok') return mockMistralResponse(mode, request);
          // Real Mistral through the local dev server (key stays in .env, never in the browser).
          try {
            if (proxyReady === null) {
              const probe = new XMLHttpRequest();
              probe.open('GET', '/api/mistral/health', false);
              probe.send();
              proxyReady = probe.status === 200 && /"keyConfigured":true/.test(probe.responseText);
            }
            if (!proxyReady) throw new Error('no proxy/key');
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/mistral', false); // UrlFetchApp is synchronous, so this must be too
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(opts.payload || '{}');
            if (xhr.status === 404 || (xhr.status === 503 && /MISTRAL_API_KEY/.test(xhr.responseText))) throw new Error('no proxy/key');
            return { getResponseCode: () => xhr.status, getContentText: () => xhr.responseText };
          } catch {
            return mockMistralResponse('ok', request); // static hosting or Node tests: local composer
          }
        }
        if (String(url).includes('graph.facebook.com')) return { getResponseCode: () => 500, getContentText: () => 'mock: no WhatsApp API' };
        throw new Error('Mock runtime has no network access: ' + url);
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; } })
    }
  };
  return globals;
}

/** Evaluates the backend source files against the runtime and returns its entry points. */
export function loadBackend(sources, runtime) {
  const names = Object.keys(runtime);
  const code = sources.join('\n;\n') + '\n;return { handle_: handle_, setupMock_: setupMock_ };';
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, code);
  return factory(...names.map((n) => runtime[n]));
}

export const BACKEND_FILES = ['Util.js', 'Config.js', 'Sheets.js', 'Tokens.js', 'Generations.js', 'Letters.js', 'Requests.js', 'Referrals.js', 'Drive.js', 'Messaging.js', 'Admin.js', 'Router.js', 'Setup.js'];
