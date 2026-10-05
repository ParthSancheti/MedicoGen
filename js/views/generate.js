/**
 * Shared generation call: idempotent request id (kept in the draft so a refresh or retry never
 * consumes twice), progress overlay, pending-state polling and friendly error recovery.
 */
import { api, newRequestId } from '../core/api.js';
import { session } from '../core/session.js';
import { haptic } from '../core/haptics.js';
import { app } from '../core/state.js';
import { toast } from '../ui/toast.js';
import { showGenerating } from './generating.js';
import { openAccessSheet } from './access.js';

export async function generate({ action, kind, params, data, saveDraft }) {
  data._generationId = data._generationId || newRequestId(kind);
  saveDraft();
  const overlay = showGenerating(kind);
  try {
    let res = await api(action, { code: session.code, sessionId: session.id, generationId: data._generationId, ...params }, { timeoutMs: 90000 });
    // A replay of a request that is still running on the server: wait for it.
    for (let i = 0; res.generation.status === 'pending' && i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      res = await api('generation.get', { code: session.code, generationId: data._generationId });
    }
    if (res.generation.status !== 'ready') throw new Error('Still working on it. Open History in a minute to see your document.');
    app.setToken(res.token);
    app.remember(res.generation);
    await overlay.finish();
    haptic('success');
    session.draft = null;
    return res;
  } catch (e) {
    overlay.fail();
    haptic('error');
    if (e.code === 'NO_ATTEMPTS') {
      toast('This code has no generations left.', { tone: 'error' });
      openAccessSheet({ mode: 'request', onUnlocked: (t) => app.setToken(t) });
    } else if (e.code === 'VALIDATION') {
      delete data._generationId; // nothing was consumed; a corrected attempt gets a fresh id
      saveDraft();
      toast(e.message, { tone: 'error', ms: 4500 });
    } else if (/^CODE_/.test(e.code || '')) {
      toast(e.message, { tone: 'error', ms: 4500 });
    } else {
      toast((e.message || 'Something went wrong.') + ' Your details are saved — try again.', { tone: 'error', ms: 5000 });
    }
    return null;
  }
}
