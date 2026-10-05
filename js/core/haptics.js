/** Subtle, meaningful vibration where the platform supports it (Android browsers). */
const can = typeof navigator !== 'undefined' && 'vibrate' in navigator;
const PATTERNS = {
  tap: 8,          // primary button presses
  select: 5,       // chips, options, toggles
  success: [12, 60, 18],
  warning: [30, 50, 30],
  error: [40, 40, 40]
};
export function haptic(kind = 'tap') {
  if (!can) return;
  try { navigator.vibrate(PATTERNS[kind] || 8); } catch { /* ignore */ }
}
