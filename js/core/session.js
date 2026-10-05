/**
 * Local convenience state. Nothing here is authoritative: the access code is re-validated with the
 * backend on every launch and the remaining-generation count always comes from the server.
 */
const P = 'mg.';

function read(key, fallback = null) {
  try {
    const v = localStorage.getItem(P + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(P + key);
    else localStorage.setItem(P + key, JSON.stringify(value));
  } catch { /* private mode / quota: the app still works for this visit */ }
}

export const session = {
  get id() {
    let id = read('session');
    if (!id) {
      const b = new Uint8Array(10); crypto.getRandomValues(b);
      id = 's-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      write('session', id);
    }
    return id;
  },
  get code() { return read('code'); },
  set code(v) { write('code', v); },
  get token() { return read('token'); },
  set token(v) { write('token', v); },

  /** Student details remembered between documents so the wizard can prefill them. */
  get profile() { return read('profile', {}); },
  set profile(v) { write('profile', v); },

  get draft() { return read('draft'); },
  set draft(v) { write('draft', v ? { ...v, savedAt: Date.now() } : null); },

  get referredBy() { return read('ref'); },
  set referredBy(v) { write('ref', v); },

  get pendingRequest() { return read('request'); },
  set pendingRequest(v) { write('request', v); },

  get lastStyle() { return read('style', 'notebook'); },
  set lastStyle(v) { write('style', v); },

  signOut() {
    ['code', 'token', 'draft'].forEach((k) => write(k, null));
  }
};

/** Captures ?ref=CODE from shared links once. */
export function captureReferral() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^R[A-Z0-9]{6}$/i.test(ref)) session.referredBy = ref.toUpperCase();
}
