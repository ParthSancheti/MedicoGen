/** Shared app state with a tiny subscription model. */
import { CONFIG } from '../config.js';
import { session } from './session.js';

const listeners = new Set();

export const app = {
  token: null,
  config: { ...CONFIG.defaults, appName: CONFIG.appName },
  docs: new Map(),          // generationId -> generation (session cache)

  setToken(token) {
    this.token = token;
    session.token = token;
    if (token) session.code = token.code;
    listeners.forEach((fn) => fn(this));
  },
  setConfig(cfg) {
    if (cfg) this.config = { ...this.config, ...cfg };
  },
  remember(gen) {
    if (gen && gen.id) this.docs.set(gen.id, gen);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
