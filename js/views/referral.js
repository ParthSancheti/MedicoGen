/** Refer & Earn sheet. Progress comes from the backend; only verified paid referrals count. */
import { CONFIG } from '../config.js';
import { api } from '../core/api.js';
import { session } from '../core/session.js';
import { h } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { app } from '../core/state.js';

export function openReferralSheet() {
  const sheet = openSheet({
    title: 'Refer & earn',
    content: () => h('div.empty', h('span.btn.ghost.loading', { 'aria-label': 'Loading' }, '\u00a0'), h('p.subtle', 'Loading your referrals\u2026'))
  });
  load(sheet);
  return sheet;
}

async function load(sheet) {
  try {
    const { referral: r, appUrl } = await api('referral.get', { code: session.code });
    sheet.set(view(r, appUrl));
  } catch (e) {
    sheet.set(h('div.stack', h('div.notice.danger', iconEl('alert', 18), h('span', e.message)), h('button.btn.secondary.block', { type: 'button', onclick: () => load(sheet) }, 'Try again')));
  }
}

function view(r, appUrl) {
  const base = (CONFIG.appUrl || appUrl || location.origin + location.pathname).replace(/[#?].*$/, '');
  const link = `${base}${base.includes('?') ? '&' : '?'}ref=${r.referralCode}`;
  const message = `I write my college leave applications with ${app.config.appName || 'Medico Gen'} — real handwriting or print, ready as a PDF. Use my code ${r.referralCode} when you get access: ${link}`;
  const steps = Array.from({ length: r.target }, (_, i) => h('i' + (i < r.progress ? '.on' : i < r.progress + r.pending ? '.pending' : '')));
  const left = r.target - r.progress;
  const earned = r.rewards.filter((w) => w.status === 'earned');
  const paid = r.rewards.filter((w) => w.status === 'paid');

  const share = async () => {
    haptic('tap');
    if (navigator.share) {
      try { await navigator.share({ title: 'Medico Gen', text: message, url: link }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(message); toast('Invite copied — paste it anywhere', { tone: 'success' }); }
    catch { toast('Sharing isn’t available here. Copy your code instead.'); }
  };

  return h('div.stack.lg',
    h('div.reward-card',
      h('div.coin', '₹' + r.rewardInr),
      h('div.stack.sm', h('b', `Earn ₹${r.rewardInr} for every ${r.target} friends`), h('span.small.muted', 'A friend counts once their payment is verified.'))),
    h('div.stack.sm',
      h('span.label', 'Your referral code'),
      h('div.ref-code', h('b', r.referralCode),
        h('button.btn.secondary.sm', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(r.referralCode); toast('Code copied', { tone: 'success' }); haptic('select'); } catch { toast('Copy not available'); } } }, iconEl('copy', 16), 'Copy'))),
    h('div.stack.sm',
      h('div.row.between', h('span.label', 'Progress'), h('span.small.muted', `${r.progress} of ${r.target} verified`)),
      h('div.progress-track', { style: { '--n': r.target } }, steps),
      h('p.small.muted', r.pending ? `${r.pending} waiting for payment verification · ${left} more to your next reward` : left === r.target && !r.verified ? 'No referrals yet. Share your code to get started.' : `${left} more to your next reward`)),
    earned.length ? h('div.notice.success', iconEl('gift', 18), h('span', `${earned.length} reward${earned.length > 1 ? 's' : ''} of ₹${r.rewardInr} unlocked. We’ll send it to your WhatsApp number.`)) : null,
    paid.length ? h('p.small.subtle', `${paid.length} reward${paid.length > 1 ? 's' : ''} already paid.`) : null,
    h('div.stack.sm',
      h('a.btn.whatsapp.block', { href: 'https://wa.me/?text=' + encodeURIComponent(message), target: '_blank', rel: 'noopener', onclick: () => haptic('tap') }, iconEl('whatsapp', 20), 'Invite on WhatsApp'),
      h('button.btn.secondary.block', { type: 'button', onclick: share }, iconEl('share', 18), 'Share invite link')),
    h('p.subtle.small', 'Only new, verified purchases count. Your own purchases and numbers that were already referred aren’t counted.'));
}
