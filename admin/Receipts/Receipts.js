/* ==================================================
   AIDEA Admin - Receipts.js
   Lists Paid payments as cards. Each card shows the certificate the
   admin sent from Payments (GET /api/certificates returns
   { "<payment_id>": { url, name } }). Also wires the shared dashboard
   chrome: theme toggle, mobile drawer, profile menu, sign-out modal.
================================================== */

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../../user/login/login.html';

/* -- API helper -- */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
    window.location.href = LOGIN_URL;
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw err;
  }
  return res.json();
}

/* -- State -- */
let allReceipts = [];
let activeTab = 'certificates';
function tabOf(p) { return p.certType === 'files' ? 'files' : 'certificates'; }
function updateTabs() {
    const f = allReceipts.filter(p => tabOf(p) === 'files').length;
    const c = document.getElementById('countCert');
    const d = document.getElementById('countFiles');
    if (c) c.textContent = allReceipts.length - f;
    if (d) d.textContent = f;
    document.querySelectorAll('[data-cert-tab]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-cert-tab') === activeTab);
    });
}
document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cert-tab]');
    if (!b) return;
    activeTab = b.getAttribute('data-cert-tab');
    render();
});   // only Paid payments
let filtered = [];
let searchTerm = '';

/* -- Helpers -- */
function toReceiptNo(id) {
  return 'RCP-' + String(id).padStart(4, '0');
}

function formatDate(p) {
  const raw = p.date_iso || p.date || null;
  if (!raw) return '\u2014';
  const d = new Date(raw);
  return isNaN(d) ? raw : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function showToast(msg, type = 'success') {
  let t = document.getElementById('rcpToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'rcpToast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast toast-${type === 'error' ? 'error' : 'success'} toast-show`;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('toast-show'), 3500);
}

/* -- Certificates the admin sent from Payments -- */
function getCert(p) {
  const c = p.certificate || null;
  const url = (c && c.url) || p.certificate_url || null;
  if (!url) return null;
  return { url: url, name: (c && c.name) || p.certificate_name || 'Certificate' };
}

function isPdf(c) {
  return /\.pdf(\?|$)/i.test(c.name) || /\.pdf(\?|$)/i.test(c.url);
}

async function attachCertificates(list) {
  let map = {};
  try {
    map = await apiFetch('/certificates');
  } catch (e) {
    console.warn('Certificates not available yet:', e);
  }
  list.forEach(p => {
        p.certificate = (map && map[p.id]) || p.certificate || null;
        p.certType = (map && map[p.id] && map[p.id].type) || (p.certificate && p.certificate.type) || 'certificate';
    });
}

function previewHtml(p) {
  const c = getCert(p);
  if (!c) return '<div class="cert-preview cert-preview-empty">Certificate not sent yet</div>';
  if (isPdf(c)) {
    return '<button type="button" class="cert-preview cert-preview-pdf" onclick="viewCertificate(' + p.id + ')">' +
           '<strong>PDF</strong><span>' + escHtml(c.name) + '</span></button>';
  }
  return '<button type="button" class="cert-preview" onclick="viewCertificate(' + p.id + ')">' +
         '<img src="' + escHtml(c.url) + '" alt="Certificate for ' + escHtml(p.student) + '" loading="lazy" /></button>';
}

function certActions(p) {
  if (!getCert(p)) return '';
  return '<div class="receipt-actions">' +
         '<button class="btn-dl" onclick="viewCertificate(' + p.id + ')">View</button>' +
         '<button class="btn-dl" onclick="downloadCertificate(' + p.id + ')">Download</button>' +
         '</div>';
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function downloadCertificate(id) {
  const p = allReceipts.find(r => r.id === id);
  const c = p && getCert(p);
  if (!c) { showToast('No certificate has been sent for this payment yet.', 'error'); return; }
  try {
    const res = await fetch(c.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    saveBlob(await res.blob(), c.name);
  } catch (e) {
    window.open(c.url, '_blank', 'noopener');   // fallback if the file host blocks fetch
  }
}

function viewCertificate(id) {
  const p = allReceipts.find(r => r.id === id);
  const c = p && getCert(p);
  if (!c) { showToast('No certificate has been sent for this payment yet.', 'error'); return; }
  openViewer(p, c);
}

function openViewer(p, c) {
  const opener = document.activeElement;
  const hadLock = document.body.classList.contains('no-scroll');
  const overlay = mk('div', 'modal-backdrop');
  const box = mk('div', 'modal modal-viewer');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Certificate for ' + p.student);

  const head = mk('div', 'viewer-head');
  const titles = mk('div');
  titles.appendChild(mk('h3', 'modal-title', 'Certificate'));
  titles.appendChild(mk('p', 'modal-text', p.student + ' \u00B7 ' + toReceiptNo(p.id)));
  head.appendChild(titles);
  box.appendChild(head);

  const media = mk('div', 'viewer-media');
  if (isPdf(c)) {
    const frame = mk('iframe', 'viewer-frame');
    frame.src = c.url;
    frame.title = 'Certificate for ' + p.student;
    media.appendChild(frame);
  } else {
    const img = mk('img');
    img.src = c.url;
    img.alt = 'Certificate for ' + p.student;
    media.appendChild(img);
  }
  box.appendChild(media);

  const actions = mk('div', 'modal-actions');
  const closeBtn = mk('button', 'modal-btn modal-btn-cancel', 'Close');
  closeBtn.type = 'button';
  const dlBtn = mk('button', 'modal-btn modal-btn-primary', 'Download');
  dlBtn.type = 'button';
  actions.appendChild(closeBtn);
  actions.appendChild(dlBtn);
  box.appendChild(actions);

  function done() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (!hadLock) document.body.classList.remove('no-scroll');
    if (opener && opener.focus && document.contains(opener)) opener.focus();
  }
  function onKey(e) { if (e.key === 'Escape') done(); }

  closeBtn.addEventListener('click', done);
  dlBtn.addEventListener('click', () => downloadCertificate(p.id));
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', onKey);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  closeBtn.focus();
}

/* -- Render receipt cards -- */
function render() { updateTabs();
  const grid = document.getElementById('receiptsGrid');
  const q = searchTerm.toLowerCase();

  filtered = allReceipts.filter(p => { if (tabOf(p) !== activeTab) return false;
    const rcpNo = toReceiptNo(p.id).toLowerCase();
    const gcashRef = (p.gcash_ref || p.gcashRef || '').toLowerCase();
    return !q
      || p.student.toLowerCase().includes(q)
      || rcpNo.includes(q)
      || gcashRef.includes(q)
      || (p.ref || '').toLowerCase().includes(q);
  });

  grid.setAttribute('aria-busy', 'false');

  if (filtered.length === 0) {
    grid.innerHTML = `
            <div class="receipts-empty">
                <strong>No Certificate/Files found</strong>
                <div>Certificates/Files will appear here once they have been sent.</div>
            </div>`;
    return;
  }

  grid.innerHTML = filtered.map((p, i) => `
        <div class="receipt-card" style="animation-delay:${i * 0.04}s">
            <div class="receipt-header">
                <span class="receipt-no">${toReceiptNo(p.id)}</span>
                <span class="badge badge-success">Completed</span>
            </div>
            <div class="receipt-student">${escHtml(p.student)}</div>
            <div class="receipt-service">${escHtml(p.service)}</div>
            ${previewHtml(p)}
            <div class="receipt-meta">
                <span>GCash: ${escHtml(p.gcash_ref || p.gcashRef || '\u2014')}</span>
                <span>${formatDate(p)}</span>
            </div>
            <div class="receipt-meta">
                <span>Ref: ${escHtml(p.ref || '\u2014')} \u00B7 ${escHtml(p.method || 'GCash')}</span>
            </div>
            ${certActions(p)}
        </div>
    `).join('');
}

/* -- Load from API, keep only Paid -- */
async function loadReceipts() {
  const grid = document.getElementById('receiptsGrid');
  try {
    const payments = await apiFetch('/payments');
    allReceipts = payments.filter(p => p.status === 'Paid');
    await attachCertificates(allReceipts);
    allReceipts = allReceipts.filter(p => getCert(p));   // only show receipts whose certificate was sent
    render();
  } catch (err) {
    console.error('Failed to load receipts:', err);
    showToast('Failed to load receipts.', 'error');
    if (grid) {
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = `
                <div class="receipts-error">
                    <strong>Couldn't connect to the server</strong>
                    <div>Make sure the API is running, then refresh.</div>
                </div>`;
    }
  }
}

/* ==================================================
   Shared chrome: theme, mobile drawer, profile menu,
   sign-out modal - mirrors dashboard.js.
================================================== */

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) {
    try { localStorage.setItem('aidea_theme', theme); } catch { }
  }
  const btn = document.getElementById('themeBtn');
  if (btn) {
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', `Switch to ${next} mode`);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
}

function initTheme() {
  applyTheme(currentTheme(), false);

  document.getElementById('themeBtn')?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = e => {
    let saved = null;
    try { saved = localStorage.getItem('aidea_theme'); } catch { }
    if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
  };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
}

function initDrawer() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const btn = document.getElementById('menuBtn');
  if (!sidebar || !scrim || !btn) return;

  const open = () => {
    sidebar.classList.add('open');
    scrim.hidden = false;
    document.body.classList.add('no-scroll');
    btn.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    sidebar.classList.remove('open');
    scrim.hidden = true;
    document.body.classList.remove('no-scroll');
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) close(); });
}

function initProfileMenu() {
  const btn = document.getElementById('profileBtn');
  const menu = document.getElementById('profileMenu');
  if (!btn || !menu) return;

  const setOpen = open => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  document.addEventListener('click', e => {
    if (!menu.hidden && !menu.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
}

function performSignOut() {
  const token = localStorage.getItem('auth_token');
  if (token) {
    fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    }).catch(() => { });
  }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('aidea_user');
  window.location.href = LOGIN_URL;
}

function initSignOutModal() {
  const modal = document.getElementById('signOutModal');
  const trigger = document.getElementById('signOutBtn');
  const cancel = document.getElementById('signOutCancel');
  const confirmBtn = document.getElementById('signOutConfirm');
  const profileBtn = document.getElementById('profileBtn');
  const profileMenu = document.getElementById('profileMenu');
  if (!modal || !trigger || !cancel || !confirmBtn) return;

  const open = () => {
    if (profileMenu) profileMenu.hidden = true;
    profileBtn?.setAttribute('aria-expanded', 'false');

    modal.hidden = false;
    document.body.classList.add('no-scroll');
    cancel.focus();
  };

  const close = () => {
    modal.hidden = true;
    if (!document.getElementById('sidebar')?.classList.contains('open')) {
      document.body.classList.remove('no-scroll');
    }
    profileBtn?.focus();
  };

  trigger.addEventListener('click', open);
  cancel.addEventListener('click', close);
  confirmBtn.addEventListener('click', performSignOut);

  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const first = cancel, last = confirmBtn;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* -- DOM Ready -- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDrawer();
  initProfileMenu();
  initSignOutModal();

  loadReceipts();

  document.getElementById('searchInput')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    render();
  });
});
/* == Certificate template generator ======================================= */
(function () {
    var W = 1600, H = 1131, SERIF = 'Georgia, serif', SANS = 'Arial';
    var DEF = { bg: '#ffffff', primary: '#0f3d6e', accent: '#e0a82e', text: '#333333' };
    var ROLES = {
        analyst:    { label: 'Data Analyst', head: 'CERTIFICATE OF DATA ANALYSIS' },
        grammarian: { label: 'Grammarian',   head: 'CERTIFICATE OF GRAMMAR REVIEW' }
    };

    function fmtDate(v) {
        if (!v) return '';
        var d = new Date(v + 'T00:00:00');
        return isNaN(d) ? v : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    function wrap(ctx, text, maxW) {
        var words = String(text).split(/\s+/), lines = [], cur = '';
        words.forEach(function (w) {
            var t = cur ? cur + ' ' + w : w;
            if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else { cur = t; }
        });
        if (cur) lines.push(cur);
        return lines;
    }

    /* ---- read the design of the template image ---- */
    function hexc(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
    function dist(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }
    function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

    function analyze(img) {
        var w = 240, h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
        var d = x.getImageData(0, 0, w, h).data, bins = {}, i;
        for (i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            var k = (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5);
            var b = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 });
            b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
        }
        var list = Object.keys(bins).map(function (k) {
            var b = bins[k]; return { n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] };
        }).sort(function (a, b) { return b.n - a.n; });
        if (!list.length) return Object.assign({}, DEF);

        var bg = list[0].c, total = d.length / 4, darkBg = lum(bg) < 0.45;
        var rest = list.filter(function (e) { return dist(e.c, bg) > 70 && e.n > total * 0.003; });
        var pool = darkBg ? rest.filter(function (e) { return lum(e.c) > 0.5; })
                          : rest.filter(function (e) { return lum(e.c) < 0.6; });
        var primary = (pool[0] || rest[0] || {}).c || null;
        var accent = null;
        for (i = 0; i < rest.length; i++) {
            if (primary && dist(rest[i].c, primary) > 90) { accent = rest[i].c; break; }
        }
        var text = null;
        if (!darkBg) pool.forEach(function (e) { if (!text || lum(e.c) < lum(text)) text = e.c; });
        return {
            bg: hexc(bg),
            primary: primary ? hexc(primary) : (darkBg ? '#ffffff' : DEF.primary),
            accent: accent ? hexc(accent) : DEF.accent,
            text: darkBg ? '#ffffff' : (text && lum(text) < 0.35 ? hexc(text) : DEF.text)
        };
    }

    function strip(ctx, x, y0, n) {
        x = Math.max(1, Math.min(W - 2, x));
        var d = ctx.getImageData(x - 1, y0, 3, n).data, out = [];
        for (var i = 0; i < n; i++) {
            var o = i * 12, r = 0, g = 0, b = 0;
            for (var j = 0; j < 3; j++) { r += d[o + j * 4]; g += d[o + j * 4 + 1]; b += d[o + j * 4 + 2]; }
            out.push([Math.round(r / 3), Math.round(g / 3), Math.round(b / 3)]);
        }
        return out;
    }
    function eraseBoxes(ctx, st) {
        if (!st.on) return;
        var hh = ctx.canvas.height;
        Object.keys(st.tpl).forEach(function (k) {
            var b = st.tpl[k].box;
            if (!b) return;
            var x0 = Math.max(0, Math.floor(b.x0 * W - 10)), x1 = Math.min(W - 1, Math.ceil(b.x1 * W + 10));
            var y0 = Math.max(0, Math.floor(b.y0 * hh - 6)), y1 = Math.min(hh - 1, Math.ceil(b.y1 * hh + 6));
            var n = y1 - y0 + 1;
            if (n < 1 || x1 - x0 < 2) return;
            var L = strip(ctx, x0 - 7, y0, n), R = strip(ctx, x1 + 7, y0, n);
            for (var i = 0; i < n; i++) {
                var g = ctx.createLinearGradient(x0, 0, x1, 0);
                g.addColorStop(0, 'rgb(' + L[i].join(',') + ')');
                g.addColorStop(1, 'rgb(' + R[i].join(',') + ')');
                ctx.fillStyle = g; ctx.fillRect(x0, y0 + i, x1 - x0, 1);
            }
        });
    }

    /* ---- draw the certificate in the SYSTEM layout ---- */
    function draw(canvas, d, st) {
        var pal = st.pal, role = ROLES[d.role] || { label: d.role || '', head: 'CERTIFICATE OF ' + String(d.role || '').toUpperCase() };
        var BGP = { head: { x: 0.5, y: 0.235 }, intro1: { x: 0.5, y: 0.315 }, title: { x: 0.5, y: 0.405 }, intro2: { x: 0.5, y: 0.585 }, proto: { x: 0.17, y: 0.70 }, date: { x: 0.83, y: 0.70 }, name: { x: 0.5, y: 0.79 }, role: { x: 0.5, y: 0.85 } }; var BG = !!(st.bg && st.img); var H = BG ? Math.round(W * st.img.naturalHeight / st.img.naturalWidth) : 1131; canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        if (BG) { ctx.drawImage(st.img, 0, 0, W, H); eraseBoxes(ctx, st); } else { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); }
        var boxes = [];

        if (!BG) { ctx.strokeStyle = pal.primary; ctx.lineWidth = 14; ctx.strokeRect(40, 40, W - 80, H - 80); }
        if (!BG) { ctx.strokeStyle = pal.accent; ctx.lineWidth = 4; ctx.strokeRect(68, 68, W - 136, H - 136); }
        ctx.textAlign = 'center';
        ctx.fillStyle = pal.primary; ctx.font = 'bold 34px Arial';
        var S1 = st.on && st.tpl.school; if (S1) ctx.font = 'bold ' + Math.round(S1.size) + 'px Arial'; if (S1 || !BG) ctx.fillText(S1 ? S1.text : 'NORZAGARAY COLLEGE', S1 ? S1.x * W : W / 2, S1 ? S1.y * H : 170);
        ctx.fillStyle = pal.text; ctx.font = '22px Arial';
        var S2 = st.on && st.tpl.sub; if (S2) ctx.font = Math.round(S2.size) + 'px Arial'; if (BG ? S2 : (!S1 || S2)) ctx.fillText(S2 ? S2.text : 'AIDEA', S2 ? S2.x * W : W / 2, S2 ? S2.y * H : 208);

        function put(key, text, size, style, fam, col, align, dx, dy) {
            var T = st.on && st.tpl[key]; var p = st.pos[key] || (T ? { x: T.x, y: T.y } : (BG && BGP[key] ? BGP[key] : { x: dx, y: dy })); if (T) { if (T.keep && T.text) text = T.text; if (T.size) size = T.size; } if (BG && !T && !st.pos[key] && Object.keys(st.tpl).length > 0 && (key === 'head' || key === 'intro1' || key === 'intro2')) return { x: p.x * W, y: p.y * H };
            var x = p.x * W, y = p.y * H, px = Math.round(size * st.scale);
            ctx.font = style + ' ' + px + 'px ' + fam;
            ctx.fillStyle = col; ctx.textAlign = align;
            ctx.fillText(text, x, y);
            var w = ctx.measureText(text).width;
            var x0 = align === 'center' ? x - w / 2 : (align === 'left' ? x : x - w);
            boxes.push({ key: key, ax: x, ay: y, x0: x0 - 12, x1: x0 + w + 12, y0: y - px, y1: y + px * 0.3 });
            return { x: x, y: y };
        }

        if (st.logo && !BG) {
            var lp = st.pos.logo || { x: 0.15, y: 0.17 };
            var lh = Math.round(130 * st.scale), lw = lh * st.logo.width / st.logo.height;
            var lx = lp.x * W, ly = lp.y * H;
            ctx.drawImage(st.logo, lx - lw / 2, ly - lh / 2, lw, lh);
            boxes.push({ key: 'logo', ax: lx, ay: ly, x0: lx - lw / 2, x1: lx + lw / 2, y0: ly - lh / 2, y1: ly + lh / 2 });
        }

        var h = put('head', role.head, 60, 'bold', SERIF, pal.primary, 'center', 0.5, 0.292);
        ctx.fillStyle = pal.accent; ctx.fillRect(h.x - 180, h.y + 30, 360, 5);
        put('intro1', 'This is to certify that the manuscript entitled', 28, 'italic', SERIF, pal.text, 'center', 0.5, 0.398);

        var tp = st.pos.title || (st.on && st.tpl.title) || (BG ? BGP.title : { x: 0.5, y: 0.473 });
        var tx = tp.x * W, ty = tp.y * H, tpx = Math.round(46 * st.scale);
        ctx.font = 'bold ' + tpx + 'px ' + SERIF;
        ctx.fillStyle = pal.primary; ctx.textAlign = 'center';
        var lines = wrap(ctx, d.title || 'Title of the document', 1200).slice(0, 3), gap = Math.round(62 * st.scale), maxw = 0;
        lines.forEach(function (ln, i) { ctx.fillText(ln, tx, ty + i * gap); maxw = Math.max(maxw, ctx.measureText(ln).width); });
        boxes.push({ key: 'title', ax: tx, ay: ty, x0: tx - maxw / 2 - 12, x1: tx + maxw / 2 + 12, y0: ty - tpx, y1: ty + (lines.length - 1) * gap + tpx * 0.3 });

        put('intro2', 'has been reviewed and finalized by the undersigned.', 28, 'italic', SERIF, pal.text, 'center', 0.5, 0.66);
        put('proto', 'Protocol No.: ' + (d.proto || '\u2014'), 26, 'normal', SANS, pal.text, 'left', 0.125, 0.77);
        put('date', 'Date: ' + (fmtDate(d.date) || '\u2014'), 26, 'normal', SANS, pal.text, 'right', 0.875, 0.77);
        var n = put('name', d.name || 'Name', 34, 'bold', SERIF, pal.primary, 'center', 0.5, 0.853);
        ctx.strokeStyle = pal.text; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(n.x - 230, n.y + 20); ctx.lineTo(n.x + 230, n.y + 20); ctx.stroke();
        put('role', role.label, 24, 'normal', SANS, pal.text, 'center', 0.5, 0.906);
        st.boxes = boxes;
    }

    /* ---- small UI helpers ---- */
    function inp() { return 'width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#111827;font:inherit;box-sizing:border-box'; }
    function btn(bg, fg) { return 'padding:10px 16px;border:0;border-radius:10px;background:' + bg + ';color:' + fg + ';font:inherit;font-weight:600;cursor:pointer'; }
    function field(label, control) { return '<label style="display:block;font-size:12px;font-weight:600;color:#475569">' + label + '<div style="margin-top:4px">' + control + '</div></label>'; }

    function modal(html) {
        var o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.6);overflow:auto';
        o.innerHTML = html;
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        function close() { document.removeEventListener('keydown', onKey); o.remove(); }
        document.addEventListener('keydown', onKey);
        o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
        o.addEventListener('click', function (e) { if (e.target.closest('[data-cg-close]')) close(); });
        document.body.appendChild(o);
        Array.prototype.forEach.call(o.querySelectorAll('[data-cg-close]'), function (x) {
            if (x.textContent.trim() === '\u2715') x.style.display = 'none';
        });
        
        Array.prototype.forEach.call(o.querySelectorAll('[data-cg-close]'), function (x) {
            if (x.textContent.trim() === '\u2715') x.style.display = 'none';
        });
        var dlg = o.firstElementChild;
        if (dlg) {
            var bar = document.createElement('div');
            bar.style.cssText = 'position:sticky;top:0;height:0;z-index:5;text-align:right;overflow:visible';
            var cb = document.createElement('button');
            cb.type = 'button';
            cb.textContent = '\u2715 Close';
            cb.title = 'Close (Esc)';
            cb.setAttribute('aria-label', 'Close');
            cb.style.cssText = 'position:relative;top:-8px;right:-8px;padding:8px 14px;border:0;border-radius:999px;background:#ef4444;color:#fff;font:inherit;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
            cb.addEventListener('click', close);
            bar.appendChild(cb);
            dlg.insertBefore(bar, dlg.firstChild);
        }
        return { o: o, close: close };
    }

    function loadImage(file, done) {
        if (!file) return;
        if (!/^image\//.test(file.type)) { alert('Please choose an image (PNG, JPG or WebP).'); return; }
        var im = new Image();
        im.onload = function () { done(im); };
        im.onerror = function () { alert('Could not read that image.'); };
        im.src = URL.createObjectURL(file);
    }

    function choice(id, title, text) {
        return '<button type="button" data-choice="' + id + '" style="text-align:left;padding:16px;border:1.5px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#111827;font:inherit;cursor:pointer">' +
            '<strong style="display:block;font-size:15px;margin-bottom:6px">' + title + '</strong>' +
            '<span style="font-size:12.5px;color:#475569">' + text + '</span></button>';
    }

    /* ---- read the text of the template with Tesseract.js (free, in-browser) ---- */
    function loadTess(ok, fail) {
        if (window.Tesseract) return ok();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = ok; s.onerror = fail;
        document.head.appendChild(s);
    }
    function mapLines(lines, img) {
        var sx = 1 / img.naturalWidth, sy = 1 / img.naturalHeight, k = W / img.naturalWidth;
        var L = lines.filter(function (l) { return l.text && l.text.trim().length > 1 && l.confidence > 40; }).map(function (l) {
            var b = l.bbox, h = b.y1 - b.y0;
            return { t: l.text.trim(), cx: (b.x0 + b.x1) / 2 * sx, x0: b.x0 * sx, x1: b.x1 * sx, y0: b.y0 * sy, y1: b.y1 * sy, y: (b.y1 - h * 0.2) * sy, size: Math.max(14, h * k * 0.85) };
        }).sort(function (a, b) { return a.y - b.y; });
        var out = {};
        function bx(l) { return { x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1 }; }
        function find(rx, key, keep, align) {
            for (var i = 0; i < L.length; i++) {
                var l = L[i];
                if (!l.used && rx.test(l.t)) {
                    l.used = true;
                    out[key] = { text: l.t, x: align === 'left' ? l.x0 : (align === 'right' ? l.x1 : l.cx), y: l.y, size: l.size, keep: keep, box: bx(l) };
                    return l;
                }
            }
            return null;
        }
        var head = find(/certificate/i, 'head', true, 'center');
        var i1 = find(/to certify|\bcertify\b|entitled/i, 'intro1', true, 'center');
        var i2 = find(/reviewed|finalized|undersigned|hereby/i, 'intro2', true, 'center');
        var pr = find(/protocol/i, 'proto', false, 'left');
        if (pr && /date/i.test(pr.t)) { out.date = { x: pr.x1, y: pr.y, size: pr.size, keep: false }; }
        else find(/date/i, 'date', false, 'right');
        var ro = find(/data analyst|grammarian|analyst/i, 'role', false, 'center');
        if (ro) out.name = { x: ro.cx, y: ro.y - 0.053 };
        if (i1 && i2) out.title = { x: (i1.cx + i2.cx) / 2, y: i1.y + 0.29 * (i2.y - i1.y) };
        if (head) {
            var top = L.filter(function (l) { return !l.used && l.y < head.y - 0.01 && /[A-Za-z]{3}/.test(l.t); });
            if (top[0]) out.school = { text: top[0].t, x: top[0].cx, y: top[0].y, size: top[0].size, box: bx(top[0]) };
            if (top[1]) out.sub = { text: top[1].t, x: top[1].cx, y: top[1].y, size: top[1].size, box: bx(top[1]) };
        }
        return out;
    }
    function runOcr(st, q, redraw) {
        var img = st.img, status = q('#cgOcrStatus'), box = q('#cgOcr');
        function say(m) { if (status) status.textContent = m; }
        function done(m) { say(m); if (box) box.disabled = false; redraw(); }
        if (box) box.disabled = true;
        say('(reading template, first time may take a while...)');
        loadTess(function () {
            window.Tesseract.recognize(img.src, 'eng', {
                logger: function (m) { if (m.status === 'recognizing text') say('(reading ' + Math.round(m.progress * 100) + '%)'); }
            }).then(function (r) {
                if (st.img !== img) return;
                st.tpl = mapLines(r.data.lines || [], img);
                var n = Object.keys(st.tpl).length;
                done(n ? '(found ' + n + ' items)' : '(no text found, using defaults)');
            }).catch(function () { done('(could not read the image, using defaults)'); });
        }, function () { done('(could not load Tesseract, check your internet)'); });
    }
    /* ---- automatic protocol number: NC-YYYY-000 ---- */
    function protoKey(yr) { return 'aidea_cert_seq_' + yr; }
    function protoCount(yr) { try { return parseInt(localStorage.getItem(protoKey(yr)), 10) || 0; } catch (e) { return 0; } }
    function protoPeek(yr) { return 'NC-' + yr + '-' + String(protoCount(yr) + 1).padStart(3, '0'); }
    function protoCommit(yr) { try { localStorage.setItem(protoKey(yr), String(protoCount(yr) + 1)); } catch (e) {} }

    function openChooser() {
        var m = modal(
            '<div style="width:min(580px,100%);background:#fff;color:#111827;border-radius:14px;padding:22px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<h3 style="margin:0;font-size:18px">Generate certificate</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<p style="margin:0 0 16px;font-size:13px;color:#475569">Which template do you want to use?</p>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">' +
            choice('sys', 'System template', 'Use the built-in AIDEA certificate design.') +
            choice('new', 'New template', 'Attach your certificate image. The system copies its colors and logo, then rebuilds it in the system layout.') +
            '</div>' +
            '<input type="file" id="cgFile" accept="image/png,image/jpeg,image/webp" hidden>' +
            '<p style="margin:14px 0 0;font-size:12px;color:#64748b">A new template must be an image (PNG, JPG or WebP). For a PDF, export it as an image first.</p>' +
            '</div>');
        var file = m.o.querySelector('#cgFile');
        m.o.addEventListener('click', function (e) {
            var c = e.target.closest('[data-choice]');
            if (!c) return;
            if (c.getAttribute('data-choice') === 'sys') { m.close(); openGenerator({ mode: 'system' }); }
            else file.click();
        });
        file.addEventListener('change', function () {
            loadImage(file.files[0], function (im) { m.close(); openGenerator({ mode: 'template', img: im, pal: analyze(im) }); });
        });
    }

    /* ---- drag a box around the logo / seal on the template ---- */
    function pickLogo(img, done) {
        var cw = Math.min(820, window.innerWidth - 80), sc = cw / img.naturalWidth, ch = Math.round(img.naturalHeight * sc);
        var m = modal(
            '<div style="width:min(' + (cw + 40) + 'px,100%);background:#fff;color:#111827;border-radius:14px;padding:18px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<h3 style="margin:0;font-size:17px">Select the logo or seal</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<p style="margin:0 0 10px;font-size:13px;color:#475569">Drag a box around the logo on your template.</p>' +
            '<canvas id="lgCv" width="' + cw + '" height="' + ch + '" style="width:100%;height:auto;border:1px solid #d1d5db;border-radius:8px;touch-action:none;cursor:crosshair"></canvas>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">' +
            '<button type="button" data-cg-close style="' + btn('#e5e7eb', '#111827') + '">Cancel</button>' +
            '<button type="button" id="lgUse" style="' + btn('#1d4ed8', '#fff') + '">Use selection</button></div></div>');
        var cv = m.o.querySelector('#lgCv'), x = cv.getContext('2d'), r = null, start = null;
        function paint() {
            x.drawImage(img, 0, 0, cv.width, cv.height);
            if (r) {
                x.fillStyle = 'rgba(29,78,216,.18)'; x.fillRect(r.x, r.y, r.w, r.h);
                x.strokeStyle = '#1d4ed8'; x.lineWidth = 2; x.strokeRect(r.x, r.y, r.w, r.h);
            }
        }
        function pt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / b.width, y: (e.clientY - b.top) * cv.height / b.height }; }
        paint();
        cv.addEventListener('pointerdown', function (e) { start = pt(e); r = { x: start.x, y: start.y, w: 0, h: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (z) {} e.preventDefault(); });
        cv.addEventListener('pointermove', function (e) {
            if (!start) return;
            var p = pt(e);
            r = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
            paint();
        });
        cv.addEventListener('pointerup', function () { start = null; });
        m.o.querySelector('#lgUse').addEventListener('click', function () {
            if (!r || r.w < 10 || r.h < 10) { alert('Drag a box around the logo first.'); return; }
            var out = document.createElement('canvas');
            out.width = Math.round(r.w / sc); out.height = Math.round(r.h / sc);
            out.getContext('2d').drawImage(img, r.x / sc, r.y / sc, r.w / sc, r.h / sc, 0, 0, out.width, out.height);
            m.close(); done(out);
        });
    }

    function openGenerator(init) {
        var st = { bg: init.mode === 'template', on: false, tpl: {}, mode: init.mode, img: init.img || null, pal: Object.assign({}, init.pal || DEF), logo: null, pos: {}, scale: 1, boxes: [], drag: null };
        var isTpl = st.mode === 'template';
        var today = new Date().toISOString().slice(0, 10);
        function clr(id, label, val) { return '<label style="font-size:13px">' + label + ' <input id="' + id + '" type="color" value="' + val + '" style="vertical-align:middle"></label>'; }

        var m = modal(
            '<div style="width:min(980px,100%);max-height:94vh;overflow:auto;background:#fff;color:#111827;border-radius:14px;padding:20px;font-family:inherit">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
            '<h3 style="margin:0;font-size:18px">Generate certificate \u00B7 ' + (isTpl ? 'New template (copied to system layout)' : 'System template') + '</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px">' +
            field('Title', '<input id="cgTitle" type="text" placeholder="Title of the document" style="' + inp() + '">') +
            field('Protocol No. (automatic)', '<input id="cgProto" type="text" readonly title="Numbered automatically" style="' + inp() + '">') +
            field('Date', '<input id="cgDate" type="date" value="' + today + '" style="' + inp() + '">') +
            field('Service', '<select id="cgRole" style="' + inp() + '"><option value="analyst">Data Analyst</option><option value="grammarian">Grammarian</option></select>') +
            field('Name', '<input id="cgName" type="text" placeholder="Name of the Data Analyst / Grammarian" style="' + inp() + '">') +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-bottom:10px;color:#334155">' +
            (isTpl ? '<img id="cgThumb" src="' + st.img.src + '" alt="Your template" title="Your template (reference)" style="height:56px;border:1px solid #cbd5e1;border-radius:6px">' : '') +
            clr('cgBg', 'Background', st.pal.bg) + clr('cgPrimary', 'Main', st.pal.primary) +
            clr('cgAccent', 'Accent', st.pal.accent) + clr('cgText', 'Text', st.pal.text) +
            (isTpl ? '<label style="font-size:13px"><input id="cgBgMode" type="checkbox" checked style="vertical-align:middle"> Copy design exactly</label><label style="font-size:13px"><input id="cgOcr" type="checkbox" checked disabled style="vertical-align:middle"> Copy text from template <span id="cgOcrStatus" style="color:#64748b"></span></label>' : '') + '<label style="font-size:13px">Text size <input id="cgScale" type="range" min="70" max="150" value="100" style="vertical-align:middle"></label>' +
            '<span style="font-size:12px;color:#64748b">Drag any text or the logo on the preview to move it.</span></div>' +
            '<canvas id="cgCanvas" style="width:100%;height:auto;border:1px solid #d1d5db;border-radius:8px;touch-action:none"></canvas>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap">' +
            (isTpl ? 
                
                '<button type="button" id="cgChange" style="' + btn('#e5e7eb', '#111827') + '">Change template</button>' : '') +
            
            
            '<button type="button" id="cgPrint" style="' + btn('#e5e7eb', '#111827') + '">Print / PDF</button>' +
            '<button type="button" id="cgDl" style="' + btn('#1d4ed8', '#fff') + '">Download PNG</button>' +
            '</div>' +
            (isTpl ? '<input type="file" id="cgFile2" accept="image/png,image/jpeg,image/webp" hidden>' : '') +
            '</div>');
        var o = m.o, canvas = o.querySelector('#cgCanvas');
        function q(s) { return o.querySelector(s); }

        function data() {
            st.scale = (Number(q('#cgScale').value) || 100) / 100; if (!st.locked) q('#cgProto').value = protoPeek((q('#cgDate').value || today).slice(0, 4)); if (isTpl) { var oc = q('#cgOcr'); st.on = !!(oc && oc.checked); var bm = q('#cgBgMode'); st.bg = !!(bm && bm.checked); }
            st.pal = { bg: q('#cgBg').value, primary: q('#cgPrimary').value, accent: q('#cgAccent').value, text: q('#cgText').value };
            return {
                title: q('#cgTitle').value.trim(), proto: q('#cgProto').value.trim(),
                date: q('#cgDate').value, role: q('#cgRole').value, name: q('#cgName').value.trim()
            };
        }
        function redraw() { draw(canvas, data(), st); }
        function issue() { if (st.locked) return; var yr = (q('#cgDate').value || today).slice(0, 4); st.locked = q('#cgProto').value; protoCommit(yr); }
        function setPal(p) { q('#cgBg').value = p.bg; q('#cgPrimary').value = p.primary; q('#cgAccent').value = p.accent; q('#cgText').value = p.text; }
        redraw();
        o.addEventListener('input', redraw); if (isTpl) runOcr(st, q, redraw);
        o.addEventListener('change', redraw);
        fetch((typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api') + '/services', { headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
            var a = Array.isArray(j) ? j : (j.services || j.data || j.items || j.results || []);
            var seen = {}, names = [];
            a.forEach(function (s) {
                var nm = s && (s.name || s.title);
                if (!nm || s.active === false || seen[nm]) return;
                seen[nm] = 1; names.push(String(nm));
            });
            if (!names.length) return;
            var sel = q('#cgRole');
            sel.innerHTML = '';
            names.forEach(function (nm) { var op = document.createElement('option'); op.value = nm; op.textContent = nm; sel.appendChild(op); });
            redraw();
        }).catch(function (e) { console.warn('Services not loaded, using defaults:', e); });

        function pt(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
        function hit(p) {
            for (var i = st.boxes.length - 1; i >= 0; i--) {
                var b = st.boxes[i];
                if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) return b;
            }
            return null;
        }
        canvas.addEventListener('pointerdown', function (e) {
            var p = pt(e), b = hit(p);
            if (!b) return;
            st.drag = { key: b.key, ox: p.x - b.ax, oy: p.y - b.ay };
            try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', function (e) {
            var p = pt(e);
            if (st.drag) {
                st.pos[st.drag.key] = { x: (p.x - st.drag.ox) / canvas.width, y: (p.y - st.drag.oy) / canvas.height };
                redraw();
            } else {
                canvas.style.cursor = hit(p) ? 'move' : 'default';
            }
        });
        function endDrag() { st.drag = null; }
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

        
        if (isTpl) {
            var f2 = q('#cgFile2');
            
            
            q('#cgChange').addEventListener('click', function () { f2.click(); });
            f2.addEventListener('change', function () {
                loadImage(f2.files[0], function (im) {
                    st.img = im; st.logo = null; st.pos = {};
                    q('#cgThumb').src = im.src;
                    setPal(analyze(im)); st.tpl = {}; runOcr(st, q, redraw); redraw();
                });
            });
        }

        q('#cgDl').addEventListener('click', function () { issue();
            var d = data();
            canvas.toBlob(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'certificate-' + (d.proto || 'template').replace(/[^\w.-]+/g, '_') + '.png';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            }, 'image/png');
        });
        q('#cgPrint').addEventListener('click', function () { issue();
            var w = window.open('', '_blank');
            if (!w) { alert('Allow pop-ups to print, or use Download PNG.'); return; }
            w.document.write('<html><head><title>Certificate</title><style>@page{size:landscape;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="' + canvas.toDataURL('image/png') + '"></body></html>');
            w.document.close();
            w.onload = function () { w.focus(); w.print(); };
        });
    }

    var tabs = document.getElementById('certTabs');
    if (tabs) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '+ Generate certificate';
        b.style.cssText = 'margin-left:12px;margin-bottom:14px;padding:10px 16px;border:0;border-radius:999px;background:#2f6bff;color:#fff;font:inherit;font-weight:600;cursor:pointer;vertical-align:top';
        b.addEventListener('click', openChooser);
        tabs.insertAdjacentElement('afterend', b);
    }
})();