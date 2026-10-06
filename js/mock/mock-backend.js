/**
 * Mock backend for the browser: fetches the Apps Script sources and runs them against the
 * in-memory runtime, persisting the fake spreadsheet to localStorage.
 * Developer switches (URL params, mock mode only):
 *   ?ai=429|error|garbage|invent|ok      simulate Mistral behaviour (ok = real key via dev proxy if set)
 *   ?resetmock=1                          wipe the mock database
 */
import { createRuntime, emptyState, loadBackend, BACKEND_FILES } from './gas-runtime.js';

const KEY = 'mg.mock.db.v1';
let backendPromise = null;

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return emptyState();
}

let dirty = false;
let current = null;
function persist(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); dirty = false; }
  catch {
    // Proof screenshots are the largest thing stored; drop the oldest if quota is hit.
    const ids = Object.keys(state.files);
    if (ids.length) { delete state.files[ids[0]]; persist(state); }
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('resetmock') === '1') { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
  const base = new URL('../../apps-script/', import.meta.url);
  const sources = await Promise.all(BACKEND_FILES.map((f) => fetch(new URL(f, base)).then((r) => {
    if (!r.ok) throw new Error('Mock backend file missing: ' + f);
    return r.text();
  })));
  const state = loadState();
  Object.assign(state.props, {
    MOCK_MODE: 'true',
    MISTRAL_API_KEY: 'mock-key',
    ADMIN_PASSWORD: 'admin',
    APP_URL: location.origin + location.pathname.replace(/[^/]*$/, '')
  });
  state.props.MOCK_AI = params.get('ai') || 'ok'; // per page load, never sticky
  current = state;
  const runtime = createRuntime(state, { onChange: () => { dirty = true; }, log: (...a) => console.debug('[mock-backend]', ...a) });
  const be = loadBackend(sources, runtime);
  be.setupMock_();
  persist(state);
  return be;
}

export async function mockCall(payload) {
  if (!backendPromise) backendPromise = boot();
  const be = await backendPromise;
  // simulate network + AI latency so loading states are real
  const slow = payload.action === 'letter.generate' ? 2600 : payload.action === 'access.request' ? 900 : 260;
  await new Promise((r) => setTimeout(r, slow * (0.8 + Math.random() * 0.4)));
  // Another tab (e.g. the admin console) may have written since we loaded: pick up its changes.
  const fresh = loadState();
  ['sheets', 'files', 'cache'].forEach((k) => { if (fresh[k]) current[k] = fresh[k]; });
  const result = be.handle_(JSON.parse(JSON.stringify(payload)));
  if (dirty) persist(current); // written before the promise resolves, so a navigation can't lose it
  return JSON.parse(JSON.stringify(result));
}
