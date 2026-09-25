// payments-reciepts.js — Student side
// Same shell behavior as dashboard.js / avail-services.js (session, theme,
// drawer, profile menu, sign-out modal) plus:
//   - Payment history table, read from GET /api/payments?student=<name>
//     (Status: Pending | Paid | Rejected)
//   - "My certificates & files" — whatever the admin has sent for a
//     completed payment, read from GET /api/certificates -> { <payment_id>:
//     { url, name, type } }. type is 'certificate' or 'files'; older
//     records without a type are treated as a certificate.
//   - Receipt modal with print.

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme';

/* ══════════════════════════════════════════════════
   SESSION
══════════════════════════════════════════════════ */
const getToken = () => localStorage.getItem('auth_token') || null;

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function authHeaders(extra) {
    return { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/json', ...extra };
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: authHeaders({ 'Content-Type': 'application/json', ...options.headers }),
    });
    if (res.status === 401) {
        clearSession();
        window.location.href = LOGIN_URL;
        throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderUserIdentity(user) {
    const fullName = user.full_name || user.name
        || [user.fname, user.lname].filter(Boolean).join(' ') || 'Student';
    const course = user.course || 'Student';
    const parts = fullName.trim().split(/\s+/);
    const initials = (parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2)).toUpperCase();

    const q = s => document.querySelector(s);
    if (q('.footer-avatar')) q('.footer-avatar').textContent = initials;
    if (q('.footer-name')) q('.footer-name').textContent = fullName;
    if (q('.footer-role')) q('.footer-role').textContent = course;
}

/* ══════════════════════════════════════════════════
   THEME (light / dark)
══════════════════════════════════════════════════ */
const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
    document.getElementById('themeBtn')
        ?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    document.querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
}

function initTheme() {
    applyTheme(currentTheme(), false);
    document.getElementById('themeBtn')?.addEventListener('click', () => {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', e => {
        let saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    });
}

/* ══════════════════════════════════════════════════
   MOBILE DRAWER
══════════════════════════════════════════════════ */
function initDrawer() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('scrim');
    const btn = document.getElementById('menuBtn');
    if (!sidebar || !scrim || !btn) return;

    const open = () => {
        sidebar.classList.add('open'); scrim.hidden = false;
        document.body.classList.add('no-scroll'); btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        sidebar.classList.remove('open'); scrim.hidden = true;
        document.body.classList.remove('no-scroll'); btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) close(); });
}

/* ══════════════════════════════════════════════════
   PROFILE MENU + SIGN-OUT MODAL
══════════════════════════════════════════════════ */
function initProfileMenu() {
    const btn = document.getElementById('profileBtn');
    const menu = document.getElementById('profileMenu');
    if (!btn || !menu) return;

    const setOpen = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };

    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
    });
}

function performSignOut() {
    if (getToken()) {
        fetch(`${API_BASE}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => { });
    }
    clearSession();
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
            if (e.shiftKey && document.activeElement === cancel) { e.preventDefault(); confirmBtn.focus(); }
            else if (!e.shiftKey && document.activeElement === confirmBtn) { e.preventDefault(); cancel.focus(); }
        }
    });
}

/* ══════════════════════════════════════════════════
   PAYMENTS
══════════════════════════════════════════════════ */
let payments = [];
let searchTerm = '';
let statusFilter = '';

function currentStudentName() {
    const user = getUser() || {};
    return user.full_name || user.name || [user.fname, user.lname].filter(Boolean).join(' ');
}

async function getPayments() {
    const student = currentStudentName();
    const all = await apiFetch(`/payments?student=${encodeURIComponent(student)}`);
    // Extra client-side guard in case the backend ignores the query param
    return all.filter(p => p.student === student);
}

function peso(n) {
    return '₱ ' + Number(n || 0).toLocaleString();
}

function badgeHtml(status) {
    if (status === 'Paid') return '<span class="badge badge-success">Paid</span>';
    if (status === 'Rejected') return '<span class="badge badge-danger">Rejected</span>';
    return '<span class="badge badge-warning">Pending</span>';
}

function updateSummary() {
    const paid = payments.filter(p => p.status === 'Paid');
    const pending = payments.filter(p => p.status === 'Pending');
    const total = paid.reduce((s, p) => s + Number(p.amount), 0);

    setText('summaryTotal', peso(total));
    setText('summaryPaid', paid.length);
    setText('summaryPending', pending.length);
    setText('summaryReceipts', paid.length);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderPayments() {
    const tbody = document.getElementById('payTableBody');
    if (!tbody) return;
    const q = searchTerm.toLowerCase();

    const filtered = payments.filter(p => {
        const ref = String(p.ref || p.id || '');
        const gcashRef = p.gcash_ref || p.gcashRef || '';
        const matchSearch = !q
            || ref.toLowerCase().includes(q)
            || (p.service || '').toLowerCase().includes(q)
            || gcashRef.toLowerCase().includes(q);
        const matchStatus = !statusFilter || p.status === statusFilter;
        return matchSearch && matchStatus;
    });

    if (!payments.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No payments yet. Avail a service to get started.</td></tr>';
    } else if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No payments match your filter.</td></tr>';
    } else {
        tbody.innerHTML = filtered.map((p, i) => `
            <tr>
                <td data-label="Reference #"><span class="ref-num">${escHtml(p.ref || p.id)}</span></td>
                <td data-label="Service">${escHtml(p.service)}</td>
                <td data-label="Date">${escHtml(p.date || p.date_iso || p.dateISO || '—')}</td>
                <td data-label="Amount">${peso(p.amount)}</td>
                <td data-label="Method">${escHtml(p.method)}</td>
                <td data-label="Status">${badgeHtml(p.status)}</td>
                <td data-label="Receipt">${p.status === 'Paid'
                ? `<button class="btn-receipt" type="button" onclick="openReceipt(${i})">View</button>`
                : p.status === 'Pending'
                    ? `<button class="btn-na" type="button" disabled title="Awaiting admin approval">Pending</button>`
                    : `<button class="btn-na" type="button" disabled title="Payment was rejected">Rejected</button>`
            }</td>
            </tr>
        `).join('');
    }

    window.filteredPayments = filtered;
}

/* ── Receipt modal ────────────────────────────────── */
function openReceipt(i) {
    const p = (window.filteredPayments || payments)[i];
    if (!p || p.status !== 'Paid') return;

    const gcashRef = p.gcash_ref || p.gcashRef || '—';
    const studentId = p.student_id || p.studentId || '—';

    document.getElementById('rRefNum').textContent = String(p.ref || p.id);
    document.getElementById('receiptBody').innerHTML = `
        <div class="r-row"><span class="r-label">Student</span><span class="r-value">${escHtml(p.student || currentStudentName())}</span></div>
        <div class="r-row"><span class="r-label">Student ID</span><span class="r-value">${escHtml(studentId)}</span></div>
        <div class="r-row"><span class="r-label">Service</span><span class="r-value">${escHtml(p.service)}</span></div>
        <div class="r-row"><span class="r-label">Date</span><span class="r-value">${escHtml(p.date || p.date_iso || p.dateISO || '—')}</span></div>
        <div class="r-row"><span class="r-label">GCash ref #</span><span class="r-value">${escHtml(gcashRef)}</span></div>
        <div class="r-row"><span class="r-label">Method</span><span class="r-value">${escHtml(p.method)}</span></div>
        <div class="r-row"><span class="r-label">Status</span><span class="r-value">${badgeHtml(p.status)}</span></div>
    `;
    openBackdrop('receiptModal');
}

function openBackdrop(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
}

function closeBackdrop(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    if (!document.getElementById('sidebar')?.classList.contains('open')) {
        document.body.classList.remove('no-scroll');
    }
}

function initReceiptModal() {
    document.getElementById('receiptClose')?.addEventListener('click', () => closeBackdrop('receiptModal'));
    document.getElementById('receiptModal')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeBackdrop('receiptModal');
    });
    document.addEventListener('keydown', e => {
        const modal = document.getElementById('receiptModal');
        if (e.key === 'Escape' && modal && !modal.hidden) closeBackdrop('receiptModal');
    });
}

/* ── Search / filter ─────────────────────────────── */
function initPaymentFilters() {
    document.getElementById('paySearch')?.addEventListener('input', e => {
        searchTerm = e.target.value;
        renderPayments();
    });
    document.getElementById('statusFilter')?.addEventListener('change', e => {
        statusFilter = e.target.value;
        renderPayments();
    });
}

/* ══════════════════════════════════════════════════
   CERTIFICATES & FILES
   GET /api/certificates -> { "<payment_id>": { url, name, type } }
   type: 'certificate' | 'files' (older records without a type are
   treated as a certificate for backward compatibility).
══════════════════════════════════════════════════ */
let certItems = [];

function certNo(id) { return 'RCP-' + String(id).padStart(4, '0'); }
function isPdf(c) { return /\.pdf(\?|$)/i.test(c.name || '') || /\.pdf(\?|$)/i.test(c.url || ''); }
function certKind(c) { return c.type === 'files' ? 'Files' : 'Certificate'; }

function certDate(p) {
    const raw = p.date_iso || p.dateISO || p.date || null;
    if (!raw) return '—';
    const d = new Date(raw);
    return isNaN(d) ? raw : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function certPreview(p) {
    const c = p.certificate;
    if (isPdf(c)) {
        return `<button type="button" class="cert-preview cert-preview-pdf" data-view="${p.id}">
            <strong>PDF</strong><span>${escHtml(c.name)}</span></button>`;
    }
    return `<button type="button" class="cert-preview" data-view="${p.id}">
        <img src="${escHtml(c.url)}" alt="${escHtml(certKind(c))}" loading="lazy" /></button>`;
}

function renderCertificates() {
    const grid = document.getElementById('certGrid');
    if (!grid) return;
    grid.setAttribute('aria-busy', 'false');

    if (!certItems.length) {
        grid.innerHTML = `<div class="cert-empty"><strong>Nothing here yet</strong>
            <div>Certificates or completed files will appear here once the admin sends them.</div></div>`;
        return;
    }

    grid.innerHTML = certItems.map((p, i) => `
        <div class="receipt-card" style="animation-delay:${i * 0.04}s">
            <div class="rc-header">
                <span class="rc-no">${certNo(p.id)}</span>
                <span class="badge badge-success">${escHtml(certKind(p.certificate))}</span>
            </div>
            <div class="rc-service">${escHtml(p.service)}</div>
            ${certPreview(p)}
            <div class="rc-meta">
                <span>GCash: ${escHtml(p.gcash_ref || p.gcashRef || '—')}</span>
                <span>${certDate(p)}</span>
            </div>
            <div class="rc-meta"><span>Ref: ${escHtml(p.ref || '—')} · ${escHtml(p.method || 'GCash')}</span></div>
            <div class="rc-actions">
                <button class="btn-receipt" type="button" data-view="${p.id}">View</button>
                <button class="btn-receipt" type="button" data-dl="${p.id}">Download</button>
            </div>
        </div>
    `).join('');
}

async function downloadCert(id) {
    const p = certItems.find(x => x.id === id);
    if (!p) return;
    try {
        const res = await fetch(p.certificate.url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = p.certificate.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
        window.open(p.certificate.url, '_blank', 'noopener');
    }
}

function viewCert(id) {
    const p = certItems.find(x => x.id === id);
    if (!p) return;
    const c = p.certificate;

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop cert-viewer-overlay';
    overlay.innerHTML = `
        <div class="cert-viewer" role="dialog" aria-modal="true" aria-label="${escHtml(certKind(c))}">
            <div class="cert-viewer-head">
                <div>
                    <h3>${escHtml(certKind(c))}</h3>
                    <p>${escHtml(p.service)} · ${certNo(p.id)}</p>
                </div>
                <button class="modal-x" data-close="1" aria-label="Close" type="button">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="cert-viewer-media">
                ${isPdf(c)
            ? `<iframe src="${escHtml(c.url)}" title="${escHtml(certKind(c))}"></iframe>`
            : `<img src="${escHtml(c.url)}" alt="${escHtml(certKind(c))}" />`}
            </div>
            <div class="cert-viewer-actions">
                <button class="modal-btn modal-btn-cancel" data-close="1" type="button">Close</button>
                <button class="modal-btn modal-btn-primary" data-download="1" type="button">Download</button>
            </div>
        </div>`;

    const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); document.body.classList.remove('no-scroll'); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', e => {
        if (e.target === overlay || e.target.closest('[data-close]')) close();
        else if (e.target.closest('[data-download]')) downloadCert(id);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
}

function initCertGrid() {
    document.getElementById('certGrid')?.addEventListener('click', e => {
        const v = e.target.closest('[data-view]');
        if (v) { viewCert(Number(v.getAttribute('data-view'))); return; }
        const d = e.target.closest('[data-dl]');
        if (d) downloadCert(Number(d.getAttribute('data-dl')));
    });
}

async function loadCertificates() {
    try {
        const list = (await getPayments()).filter(p => p.status === 'Paid');
        let map = {};
        try { map = await apiFetch('/certificates'); } catch (e) { console.warn('Certificates unavailable:', e); }
        list.forEach(p => { p.certificate = (map && map[p.id]) || null; });
        certItems = list.filter(p => p.certificate && p.certificate.url);
    } catch (err) {
        console.error('Failed to load certificates:', err);
        certItems = [];
    }
    renderCertificates();
}

/* ══════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════ */
async function loadPayments() {
    try {
        payments = await getPayments();
    } catch (err) {
        console.error('Failed to load payments:', err);
        payments = [];
    }
    updateSummary();
    renderPayments();
}

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!getToken() || !user) {
        window.location.href = LOGIN_URL;
        return;
    }

    renderUserIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();
    initReceiptModal();
    initPaymentFilters();
    initCertGrid();

    loadPayments();
    loadCertificates();
});

// Exposed for the inline onclick in the payment table rows.
window.openReceipt = openReceipt;