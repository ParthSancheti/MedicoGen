/**
 * Access: enter a code, or request one (phone → pay → screenshot → request id → WhatsApp).
 * Everything happens inside one sheet so it feels like a single conversation.
 */
import { CONFIG } from '../config.js';
import { api, isMock, newRequestId } from '../core/api.js';
import { session } from '../core/session.js';
import { h } from '../core/dom.js';
import { haptic } from '../core/haptics.js';
import { iconEl } from '../ui/icons.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { app } from '../core/state.js';

const base = new URL('../../', import.meta.url);

export function openAccessSheet({ onUnlocked, mode = 'code' } = {}) {
  const sheet = openSheet({ label: 'Access', content: () => h('div') });
  const flow = { phone: '', referral: session.referredBy || '', paymentRef: '', proof: null, clientId: newRequestId('req') };
  const go = (screen) => { haptic('select'); sheet.set(screens[screen]()); const f = sheet.panel.querySelector('input'); if (f && matchMedia('(min-width:720px)').matches) f.focus(); sheet.panel.scrollTop = 0; };

  const screens = {
    code: () => codeScreen(),
    phone: () => phoneScreen(),
    pay: () => payScreen(),
    proof: () => proofScreen(),
    done: () => doneScreen(),
    status: () => statusScreen()
  };

  /* ---- 1. code ---- */
  function codeScreen() {
    const input = h('input.input.code-input', {
      id: 'access-code', type: 'text', inputmode: 'text', autocomplete: 'one-time-code', autocapitalize: 'characters', spellcheck: false,
      placeholder: 'MG-XXXX-XXXX', maxlength: 16, 'aria-label': 'Access code', value: ''
    });
    const err = h('p.err', { role: 'alert' });
    const btn = h('button.btn.primary.block', { type: 'submit' }, 'Unlock Medico Gen');
    input.addEventListener('input', () => {
      const pos = input.selectionStart;
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      input.setSelectionRange(pos, pos);
      err.textContent = '';
      input.classList.remove('invalid');
    });
    const form = h('form.stack', {
      onsubmit: async (e) => {
        e.preventDefault();
        const code = input.value.trim();
        if (code.length < 6) { err.textContent = 'Enter the code you received on WhatsApp.'; input.classList.add('invalid'); haptic('error'); return; }
        btn.classList.add('loading'); btn.disabled = true;
        try {
          const data = await api('access.validate', { code, sessionId: session.id });
          app.setConfig(data.config);
          session.code = data.token.code;
          sheet.close();
          onUnlocked(data.token);
          if (data.token.remaining === 0) toast('This code has no generations left. You can still open your documents.', { tone: 'neutral', ms: 4500 });
          else toast(`Unlocked · ${data.token.remaining} generation${data.token.remaining === 1 ? '' : 's'} ready`, { tone: 'success' });
        } catch (e2) {
          err.textContent = e2.message;
          input.classList.add('invalid');
          haptic('error');
        } finally {
          btn.classList.remove('loading'); btn.disabled = false;
        }
      }
    },
    h('div.field', input, err),
    btn);

    const pending = session.pendingRequest;
    return h('div.stack.lg',
      h('div.access-hero',
        h('img', { src: new URL('assets/brand/logo-mark.png', base).href, alt: '' }),
        h('h2.title-lg', 'Enter your access code'),
        h('p.muted', 'Each code unlocks ' + app.config.maxAttempts + ' document generations.')),
      isMock ? h('button.notice', { type: 'button', style: { border: 0, textAlign: 'left', cursor: 'pointer' }, onclick: () => { input.value = CONFIG.mockCode; input.dispatchEvent(new Event('input')); haptic('select'); } },
        iconEl('info', 18), h('span', 'Mock mode — tap to use the test code ', h('b', CONFIG.mockCode))) : null,
      form,
      h('div.divider', 'No code yet?'),
      h('button.btn.secondary.block', { type: 'button', onclick: () => go('phone') }, iconEl('gift', 18), 'Get a promotional code'),
      pending ? h('button.btn.ghost.block', { type: 'button', onclick: () => go('status') }, 'Check request ', pending.requestId) : null);
  }

  /* ---- 2. phone ---- */
  function phoneScreen() {
    const phone = h('input.input', { type: 'tel', inputmode: 'numeric', autocomplete: 'tel-national', placeholder: '98765 43210', maxlength: 14, value: flow.phone, 'aria-label': 'WhatsApp number' });
    const ref = h('input.input', { type: 'text', autocapitalize: 'characters', placeholder: 'R••••••', maxlength: 8, value: flow.referral, 'aria-label': 'Referral code (optional)' });
    const err = h('p.err', { role: 'alert' });
    return h('form.stack.lg', {
      onsubmit: (e) => {
        e.preventDefault();
        const digits = phone.value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
        if (!/^[6-9]\d{9}$/.test(digits)) { err.textContent = 'Enter a valid 10-digit WhatsApp number.'; phone.classList.add('invalid'); haptic('error'); return; }
        flow.phone = digits;
        flow.referral = ref.value.trim().toUpperCase();
        go('pay');
      }
    },
    flowHead(1, 'Where should we send your code?', 'We’ll WhatsApp your access code to this number once your payment is verified.'),
    h('div.field',
      h('label', 'WhatsApp number'),
      h('div.row', h('span.badge.neutral', { style: { height: '54px', borderRadius: '16px', padding: '0 14px', fontSize: '16px' } }, '+91'), h('div.grow', phone)),
      err),
    h('div.field', h('label', 'Referral code ', h('span.subtle', '(optional)')), ref,
      flow.referral ? h('p.hint', 'Added from your friend’s link.') : null),
    h('div.row', h('button.btn.ghost', { type: 'button', onclick: () => go('code') }, iconEl('back', 18), 'Back'), h('button.btn.primary.grow', { type: 'submit' }, 'Continue')));
  }

  /* ---- 3. pay ---- */
  function payScreen() {
    const p = CONFIG.payment;
    const amount = app.config.priceInr || p.priceInr;
    const upi = `upi://pay?pa=${encodeURIComponent(p.upiId)}&pn=${encodeURIComponent(p.payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(p.note)}`;
    const qrHost = h('div.qr', { role: 'img', 'aria-label': 'Payment QR code' });
    if (p.qrImage) qrHost.append(h('img', { src: new URL(p.qrImage, base).href, alt: '' }));
    else renderQr(qrHost, upi);
    const utr = h('input.input', { type: 'text', inputmode: 'text', autocapitalize: 'characters', placeholder: 'e.g. 412345678901', maxlength: 30, value: flow.paymentRef, 'aria-label': 'UPI reference number' });
    const err = h('p.err', { role: 'alert' });
    const isPhone = matchMedia('(pointer: coarse)').matches;
    return h('form.stack.lg', {
      onsubmit: (e) => {
        e.preventDefault();
        const v = utr.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length < 6) { err.textContent = 'Enter the UPI reference / UTR shown in your payment app.'; utr.classList.add('invalid'); haptic('error'); return; }
        flow.paymentRef = v;
        go('proof');
      }
    },
    flowHead(2, 'Pay ₹' + amount + ' with any UPI app', 'Scan the code, or open your UPI app directly on this phone.'),
    h('div.qr-box',
      h('div.amount', '₹' + amount),
      qrHost,
      h('div.upi-id', p.upiId, h('button.icon-btn.plain', { type: 'button', 'aria-label': 'Copy UPI ID', style: { width: '34px', height: '34px' }, onclick: () => copy(p.upiId, 'UPI ID copied') }, iconEl('copy', 17))),
      isPhone ? h('a.btn.dark.sm', { href: upi }, 'Open UPI app') : null),
    h('div.field', h('label', 'UPI reference / UTR number'), utr, h('p.hint', 'You’ll find a 12-digit number on the payment success screen.'), err),
    h('div.row', h('button.btn.ghost', { type: 'button', onclick: () => go('phone') }, iconEl('back', 18), 'Back'), h('button.btn.primary.grow', { type: 'submit' }, 'I’ve paid')));
  }

  /* ---- 4. proof ---- */
  function proofScreen() {
    const err = h('p.err', { role: 'alert' });
    const slot = h('div');
    const submit = h('button.btn.primary.grow', { type: 'submit', disabled: !flow.proof }, 'Submit request');
    const renderSlot = () => {
      slot.replaceChildren(flow.proof
        ? h('div.proof-preview',
            h('img', { src: flow.proof.dataUrl, alt: 'Payment screenshot preview' }),
            h('div.grow.stack.sm', h('b', 'Screenshot attached'), h('span.subtle', Math.round(flow.proof.bytes / 1024) + ' KB · ready to send')),
            h('button.icon-btn', { type: 'button', 'aria-label': 'Remove screenshot', onclick: () => { flow.proof = null; submit.disabled = true; renderSlot(); } }, iconEl('close', 18)))
        : dropzone());
    };
    const dropzone = () => {
      const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Choose payment screenshot' });
      const zone = h('label.dropzone', iconEl('upload', 28), h('span', 'Add payment screenshot'), h('span.subtle', 'PNG or JPG from your gallery'), input);
      const take = async (file) => {
        if (!file || !/^image\//.test(file.type)) { err.textContent = 'Please choose an image file.'; return; }
        try {
          flow.proof = await compressImage(file);
          submit.disabled = false; err.textContent = ''; haptic('select'); renderSlot();
        } catch { err.textContent = 'That image could not be read. Try a different screenshot.'; }
      };
      input.addEventListener('change', () => take(input.files[0]));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag'); take(e.dataTransfer.files[0]); });
      return zone;
    };
    renderSlot();
    return h('form.stack.lg', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (!flow.proof || submit.disabled) return;
        submit.classList.add('loading'); submit.disabled = true;
        try {
          const data = await api('access.request', {
            phone: flow.phone, paymentRef: flow.paymentRef, referralCode: flow.referral,
            proof: { mime: 'image/jpeg', base64: flow.proof.base64 }
          });
          flow.requestId = data.request.requestId;
          session.pendingRequest = { requestId: flow.requestId, phone: flow.phone };
          haptic('success');
          go('done');
        } catch (e2) {
          err.textContent = e2.message; haptic('error');
          submit.classList.remove('loading'); submit.disabled = false;
        }
      }
    },
    flowHead(3, 'Add your payment screenshot', 'This lets us match your payment quickly. Only the Medico Gen team can see it.'),
    slot, err,
    h('div.row', h('button.btn.ghost', { type: 'button', onclick: () => go('pay') }, iconEl('back', 18), 'Back'), submit));
  }

  /* ---- 5. done ---- */
  function doneScreen() {
    const masked = flow.phone.slice(0, 2) + '•••••' + flow.phone.slice(7);
    const wa = `https://wa.me/${CONFIG.support.whatsapp}?text=${encodeURIComponent(`Hi! I submitted Medico Gen request ${flow.requestId}.`)}`;
    return h('div.stack.lg.center', { style: { alignItems: 'center' } },
      h('div.success-mark', iconEl('check', 38)),
      h('div.stack.sm', h('h2.title-lg', 'Request received'), h('p.muted', `We’ll verify your payment and WhatsApp your access code to +91 ${masked}.`)),
      h('div.card.flat.stack.sm', { style: { width: '100%' } },
        h('span.subtle', 'Your request ID'),
        h('div.row.between', h('span.req-id', flow.requestId), h('button.icon-btn', { type: 'button', 'aria-label': 'Copy request ID', onclick: () => copy(flow.requestId, 'Request ID copied') }, iconEl('copy', 18)))),
      h('a.btn.whatsapp.block', { href: wa, target: '_blank', rel: 'noopener' }, iconEl('whatsapp', 20), 'Message us on WhatsApp'),
      h('button.btn.secondary.block', { type: 'button', onclick: () => go('code') }, 'I have my code'));
  }

  /* ---- status ---- */
  function statusScreen() {
    const pending = session.pendingRequest || {};
    const id = h('input.input', { type: 'text', value: pending.requestId || '', placeholder: 'REQ-XXXXXX', autocapitalize: 'characters', 'aria-label': 'Request ID' });
    const phone = h('input.input', { type: 'tel', inputmode: 'numeric', value: pending.phone || '', placeholder: '10-digit number', 'aria-label': 'Phone number' });
    const out = h('div');
    const btn = h('button.btn.primary.grow', { type: 'submit' }, 'Check status');
    return h('form.stack.lg', {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.classList.add('loading');
        try {
          const { request } = await api('access.requestStatus', { requestId: id.value.trim(), phone: phone.value });
          const tone = { pending: 'warn', approved: 'success', rejected: 'danger' }[request.status];
          const text = {
            pending: 'We’re verifying your payment. You’ll get your code on WhatsApp.',
            approved: 'Approved! Your code has been sent on WhatsApp. Enter it on the previous screen.',
            rejected: 'We couldn’t verify this payment' + (request.note ? ': ' + request.note : '.') + ' Message us on WhatsApp if this is a mistake.'
          }[request.status];
          out.replaceChildren(h('div.notice.' + tone, iconEl(request.status === 'approved' ? 'check' : request.status === 'rejected' ? 'alert' : 'history', 18), h('span', text)));
          if (request.status !== 'pending') session.pendingRequest = null;
        } catch (e2) {
          out.replaceChildren(h('div.notice.danger', iconEl('alert', 18), h('span', e2.message)));
        } finally { btn.classList.remove('loading'); }
      }
    },
    h('h2.title-lg', 'Request status'),
    h('div.field', h('label', 'Request ID'), id),
    h('div.field', h('label', 'Phone number'), phone),
    out,
    h('div.row', h('button.btn.ghost', { type: 'button', onclick: () => go('code') }, iconEl('back', 18), 'Back'), btn));
  }

  sheet.set(screens[mode === 'request' ? 'phone' : mode]());
  return sheet;
}

function flowHead(step, title, text) {
  return h('div.stack.sm',
    h('div.flow-steps', { 'aria-label': `Step ${step} of 3` }, [1, 2, 3].map((i) => h('i' + (i <= step ? '.on' : '')))),
    h('h2.title-lg.center', title),
    h('p.muted.center', text));
}

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg, { tone: 'success' }); haptic('select'); }
  catch { toast('Copy not available — select and copy manually'); }
}

let qrLoad = null;
async function renderQr(host, text) {
  if (!window.qrcode) {
    qrLoad = qrLoad || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('vendor/qrcode.js', base).href;
      s.onload = res; s.onerror = rej;
      document.head.append(s);
    });
    await qrLoad;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  host.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); // generated markup, no user input
}

/** Shrinks screenshots to ≤1400 px JPEG so uploads are fast on mobile data. */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      resolve({ dataUrl, base64, bytes: Math.round(base64.length * 0.75) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
