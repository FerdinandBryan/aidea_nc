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
    function draw(canvas, d) {
        var W = 1600, H = 1131, role = ROLES[d.role] || ROLES.analyst;
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#0f3d6e'; ctx.lineWidth = 14; ctx.strokeRect(40, 40, W - 80, H - 80);
        ctx.strokeStyle = '#e0a82e'; ctx.lineWidth = 4; ctx.strokeRect(68, 68, W - 136, H - 136);
        ctx.textAlign = 'center';

        ctx.fillStyle = '#0f3d6e'; ctx.font = 'bold 34px Arial';
        ctx.fillText('NORZAGARAY COLLEGE', W / 2, 170);
        ctx.fillStyle = '#666'; ctx.font = '22px Arial';
        ctx.fillText('AIDEA', W / 2, 208);

        ctx.fillStyle = '#0f3d6e'; ctx.font = 'bold 60px Georgia, serif';
        ctx.fillText(role.head, W / 2, 330);
        ctx.fillStyle = '#e0a82e'; ctx.fillRect(W / 2 - 180, 360, 360, 5);

        ctx.fillStyle = '#333'; ctx.font = 'italic 28px Georgia, serif';
        ctx.fillText('This is to certify that the manuscript entitled', W / 2, 450);

        ctx.fillStyle = '#0f3d6e'; ctx.font = 'bold 46px Georgia, serif';
        var lines = wrap(ctx, d.title || 'Title of the document', 1200).slice(0, 3);
        var y = 535;
        lines.forEach(function (ln) { ctx.fillText(ln, W / 2, y); y += 62; });

        ctx.fillStyle = '#333'; ctx.font = 'italic 28px Georgia, serif';
        ctx.fillText('has been reviewed and finalized by the undersigned.', W / 2, y + 30);

        ctx.font = '26px Arial'; ctx.fillStyle = '#222';
        ctx.textAlign = 'left';
        ctx.fillText('Protocol No.: ' + (d.proto || '\u2014'), 200, 870);
        ctx.textAlign = 'right';
        ctx.fillText('Date: ' + (fmtDate(d.date) || '\u2014'), W - 200, 870);

        ctx.textAlign = 'center';
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(W / 2 - 230, 985); ctx.lineTo(W / 2 + 230, 985); ctx.stroke();
        ctx.fillStyle = '#0f3d6e'; ctx.font = 'bold 34px Georgia, serif';
        ctx.fillText(d.name || 'Name', W / 2, 965);
        ctx.fillStyle = '#555'; ctx.font = '24px Arial';
        ctx.fillText(role.label, W / 2, 1025);
    }

    function openGenerator() {
        var today = new Date().toISOString().slice(0, 10);
        var o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.6);overflow:auto';
        o.innerHTML =
            '<div style="width:min(980px,100%);max-height:94vh;overflow:auto;background:#fff;color:#111827;border-radius:14px;padding:20px;font-family:inherit">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
            '<h3 style="margin:0;font-size:18px">Generate certificate</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">' +
            cgField('Title', '<input id="cgTitle" type="text" placeholder="Title of the document" style="' + inp() + '">') +
            cgField('Protocol No.', '<input id="cgProto" type="text" placeholder="e.g. NC-2026-001" style="' + inp() + '">') +
            cgField('Date', '<input id="cgDate" type="date" value="' + today + '" style="' + inp() + '">') +
            cgField('Role', '<select id="cgRole" style="' + inp() + '"><option value="analyst">Data Analyst</option><option value="grammarian">Grammarian</option></select>') +
            cgField('Name', '<input id="cgName" type="text" placeholder="Name of the Data Analyst / Grammarian" style="' + inp() + '">') +
            '</div>' +
            '<canvas id="cgCanvas" style="width:100%;height:auto;border:1px solid #d1d5db;border-radius:8px"></canvas>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap">' +
            '<button type="button" data-cg-close style="' + btn('#e5e7eb', '#111827') + '">Close</button>' +
            '<button type="button" id="cgPrint" style="' + btn('#e5e7eb', '#111827') + '">Print / PDF</button>' +
            '<button type="button" id="cgDl" style="' + btn('#1d4ed8', '#fff') + '">Download PNG</button>' +
            '</div></div>';
        document.body.appendChild(o);

        var canvas = o.querySelector('#cgCanvas');
        function data() {
            return {
                title: o.querySelector('#cgTitle').value.trim(),
                proto: o.querySelector('#cgProto').value.trim(),
                date:  o.querySelector('#cgDate').value,
                role:  o.querySelector('#cgRole').value,
                name:  o.querySelector('#cgName').value.trim()
            };
        }
        function redraw() { draw(canvas, data()); }
        redraw();
        o.addEventListener('input', redraw);
        o.addEventListener('change', redraw);

        var onKey = function (e) { if (e.key === 'Escape') close(); };
        function close() { document.removeEventListener('keydown', onKey); o.remove(); }
        document.addEventListener('keydown', onKey);
        o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
        o.addEventListener('click', function (e) { if (e.target.closest('[data-cg-close]')) close(); });

        o.querySelector('#cgDl').addEventListener('click', function () {
            var d = data();
            canvas.toBlob(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'certificate-' + (d.proto || 'template').replace(/[^\w.-]+/g, '_') + '.png';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            }, 'image/png');
        });
        o.querySelector('#cgPrint').addEventListener('click', function () {
            var w = window.open('', '_blank');
            if (!w) { alert('Allow pop-ups to print, or use Download PNG.'); return; }
            w.document.write('<html><head><title>Certificate</title><style>@page{size:landscape;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="' + canvas.toDataURL('image/png') + '"></body></html>');
            w.document.close();
            w.onload = function () { w.focus(); w.print(); };
        });
    }
    function inp() { return 'width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#111827;font:inherit;box-sizing:border-box'; }
    function btn(bg, fg) { return 'padding:10px 16px;border:0;border-radius:10px;background:' + bg + ';color:' + fg + ';font:inherit;font-weight:600;cursor:pointer'; }
    function cgField(label, control) { return '<label style="display:block;font-size:12px;font-weight:600;color:#475569">' + label + '<div style="margin-top:4px">' + control + '</div></label>'; }

    var tabs = document.getElementById('certTabs');
    if (tabs) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '+ Generate certificate';
        b.style.cssText = 'margin-left:12px;margin-bottom:14px;padding:10px 16px;border:0;border-radius:999px;background:#2f6bff;color:#fff;font:inherit;font-weight:600;cursor:pointer;vertical-align:top';
        b.addEventListener('click', openGenerator);
        tabs.insertAdjacentElement('afterend', b);
    }
})();