// file_transfer.js — Admin: send thesis files to a reviewer, and see what
// reviewers have sent back. Same session/theme/drawer/sign-out conventions
// as dashboard.js and thesis-review.js.

const ADMIN_API = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../../user/login/login.html';

// ── Session helpers ────────────────────────────────────────────────────────

function getToken() {
    return localStorage.getItem('auth_token') || null;
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function authHeaders(json = true) {
    const h = { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

// ── Sign out ───────────────────────────────────────────────────────────────

function performSignOut() {
    if (getToken()) {
        fetch(`${ADMIN_API}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => { });
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
            const first = cancel, last = confirmBtn;
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
}

// ── Utilities ──────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
}

function showMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-success', 'is-error');
    if (type) el.classList.add(type === 'success' ? 'is-success' : 'is-error');
}

const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

const roleLabels = { statistician: 'Statistician', grammarian: 'Grammarian' };

// ── Theme (light / dark) ────────────────────────────────────────────────
// Shares the SAME key as the admin dashboard (aidea_theme) so this page
// always matches whatever the admin last picked elsewhere in the panel.

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem('aidea_theme', theme); } catch { } }
    const btn = document.getElementById('themeBtn');
    if (btn) btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
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

// ── Mobile drawer — identical wiring to dashboard.js ───────────────────────

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
    sidebar.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', close));
    window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) close(); });
}

// ── Profile menu — identical wiring to dashboard.js ────────────────────────

function initProfileMenu() {
    const btn = document.getElementById('profileBtn');
    const menu = document.getElementById('profileMenu');
    if (!btn || !menu) return;

    const setOpen = open => {
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
    });
}

// ── Render admin identity in sidebar ──────────────────────────────────────

function renderAdminIdentity(user) {
    const fullName = [user.fname, user.lname].filter(Boolean).join(' ') || 'Admin';
    const parts = fullName.trim().split(/\s+/);
    const ini = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

    setText('footerAvatar', ini);
    setText('footerName', fullName);
    setText('footerRole', 'Administrator');
}

// ── Tabs (Send / Received) ─────────────────────────────────────────────────

let activeTab = 'send';

function setActiveTab(tab) {
    activeTab = tab;
    const isSend = tab === 'send';

    document.getElementById('tabSendBtn').classList.toggle('active', isSend);
    document.getElementById('tabSendBtn').setAttribute('aria-selected', String(isSend));
    document.getElementById('tabReceivedBtn').classList.toggle('active', !isSend);
    document.getElementById('tabReceivedBtn').setAttribute('aria-selected', String(!isSend));

    document.getElementById('sendPanel').hidden = !isSend;
    document.getElementById('receivedPanel').hidden = isSend;

    setText('pageHeading', isSend ? 'Send a file' : 'Received from reviewers');
    setText('pageSub', isSend
        ? 'Pick a thesis and route it to a statistician or grammarian'
        : 'Files reviewers have sent back to you');

    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url);
}

function initTabs() {
    document.getElementById('tabSendBtn').addEventListener('click', () => setActiveTab('send'));
    document.getElementById('tabReceivedBtn').addEventListener('click', () => setActiveTab('received'));

    const initial = new URLSearchParams(window.location.search).get('tab');
    setActiveTab(initial === 'received' ? 'received' : 'send');
}

// ── Icons (reused across cards) ─────────────────────────────────────────────

const ICON_DOC = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

// ── File view / download (shared by admin + reviewer) ──────────────────────
const ICON_EYE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>`;

/** One row: label + View + Download. Returns '' if there's no file. */
function fileRow(url, label, filename) {
    if (!url) return '';
    const u = escHtml(url), n = escHtml(filename || 'thesis-file');
    return `
    <div class="review-card-actions">
        <span class="file-chip">${ICON_DOC} ${escHtml(label)}</span>
        <button type="button" class="action-btn" data-file-url="${u}" data-file-mode="view" data-file-name="${n}">${ICON_EYE} View</button>
        <button type="button" class="action-btn" data-file-url="${u}" data-file-mode="download" data-file-name="${n}">${ICON_DOWNLOAD} Download</button>
    </div>`;
}

function guessFilename(res, url, fallback) {
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    if (m) return decodeURIComponent(m[1]);
    try {
        const last = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop());
        if (last && last.includes('.')) return last;
    } catch { }
    return fallback;
}

function handleFile(url, mode, fallbackName) {
    if (!url) return;
    if (mode === 'view') {
        window.open(url, '_blank', 'noopener');
        return;
    }
    let href = url;
    try {
        const u = new URL(url, location.href);
        const base = decodeURIComponent(u.pathname.split('/').pop());
        const ext = base.indexOf('.') > -1 ? base.slice(base.lastIndexOf('.')) : '';
        let name = fallbackName || 'thesis-file';
        if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
        href = ADMIN_API + '/download/assignments/' + encodeURIComponent(base) + '?name=' + encodeURIComponent(name);
    } catch (e) { }
    const a = document.createElement('a');
    a.href = href;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function initFileActions() {
    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-file-url]');
        if (!btn) return;
        e.preventDefault();
        handleFile(btn.dataset.fileUrl, btn.dataset.fileMode, btn.dataset.fileName);
    });
}

// ── Populate the send form's dropdowns ──────────────────────────────────────

let paymentFileOptions = {};

function dataUrlToFile(dataUrl, name) {
    const parts = String(dataUrl).split(',');
    const m = parts[0].match(/:(.*?);/);
    const mime = m ? m[1] : 'application/octet-stream';
    const bin = atob(parts[1] || '');
    const arr = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
    return new File([arr], name, { type: mime });
}

async function loadThesisOptions() {
    const select = document.getElementById('sendThesis');
    try {
        const res = await fetch(`${ADMIN_API}/payments`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const payments = asList(await res.json());

        paymentFileOptions = {};
        let html = '<option value="" disabled selected>Select a file from Payments\u2026</option>';
        payments.forEach(p => {
            let items = p.research_items;
            try { if (typeof items === 'string') items = JSON.parse(items); } catch { items = []; }
            if (!Array.isArray(items)) return;
            items.forEach((it, idx) => {
                if ((it.type === 'file' || it.type === 'image') && it.file_base64) {
                    const key = p.id + ':' + idx;
                    paymentFileOptions[key] = { payment: p, item: it };
                    html += `<option value="${key}">${escHtml(p.student || 'Student')} \u2014 ${escHtml(it.label || 'File')} (${escHtml(it.file_name || 'file')})</option>`;
                }
            });
        });
        select.innerHTML = html;
    } catch {
        select.innerHTML = '<option value="" disabled selected>Couldn\u2019t load payments</option>';
    }
}

let reviewerItems = [];
let reviewerFilter = 'all';

function renderReviewerOptions() {
    const select = document.getElementById('sendRecipient');
    if (!select) return;
    const byRole = { statistician: [], grammarian: [] };
    reviewerItems.forEach(r => { (byRole[r.role] || (byRole[r.role] = [])).push(r); });

    const optgroup = (role, label) => {
        if (reviewerFilter !== 'all' && reviewerFilter !== role) return '';
        const people = byRole[role] || [];
        if (!people.length) return '';
        return `<optgroup label="${label}">${people.map(r => `
            <option value="${r.id}">${escHtml([r.fname, r.lname].filter(Boolean).join(' ') || r.name || label)}</option>
        `).join('')}</optgroup>`;
    };

    const body = optgroup('statistician', 'Statistician') + optgroup('grammarian', 'Grammarian');
    select.innerHTML = '<option value="" disabled selected>' + (body ? 'Select a reviewer\u2026' : 'No reviewers in this group') + '</option>' + body;
}

function setReviewerFilter(role) {
    reviewerFilter = (role === 'statistician' || role === 'grammarian') ? role : 'all';
    document.querySelectorAll('#reviewerFilter [data-role]').forEach(b => {
        const on = b.dataset.role === reviewerFilter;
        b.classList.toggle('action-btn-primary', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderReviewerOptions();
}

document.addEventListener('click', e => {
    const b = e.target.closest('#reviewerFilter [data-role]');
    if (b) { e.preventDefault(); setReviewerFilter(b.dataset.role); }
});

async function loadReviewerOptions() {
    const select = document.getElementById('sendRecipient');
    try {
        const res = await fetch(`${ADMIN_API}/admin/reviewers`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        reviewerItems = asList(await res.json());
        setReviewerFilter(new URLSearchParams(window.location.search).get('role') || 'all');
    } catch {
        select.innerHTML = '<option value="" disabled selected>Couldn\u2019t load reviewers</option>';
    }
}

// ── Sent files (pending with a reviewer) ────────────────────────────────────

async function loadSent() {
    const list = document.getElementById('sentList');
    try {
        const res = await fetch(`${ADMIN_API}/admin/assignments?status=pending`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        setText('sentCount', String(items.length));

        if (!items.length) {
            list.innerHTML = `<p class="review-empty">Nothing sent out right now.</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <article class="review-card" data-id="${t.id}">
                <div class="review-card-icon" aria-hidden="true">${ICON_SEND}</div>
                <div class="review-card-body">
                    <div class="review-card-top">
                        <div>
                            <div class="review-card-title">${escHtml(t.title || t.thesis?.title || 'Untitled thesis')}</div>
                            <div class="review-card-meta">
                                <span>${escHtml(t.student_name || t.thesis?.student_name || '—')}</span>
                                <span>·</span>
                                <span>Sent to ${escHtml(roleLabels[t.reviewer_role] || t.reviewer_name || 'Reviewer')}</span>
                                <span>·</span>
                                <span>${formatDate(t.assigned_at || t.created_at)}</span>
                            </div>
                        </div>
                        <span class="badge badge-warning">Awaiting review</span>
                    </div>

                    ${t.note ? `<div class="review-card-note"><span>Your note:</span> ${escHtml(t.note)}</div>` : ''}

                    ${fileRow(t.file_url, 'File sent', 'thesis-sent')}
                </div>
            </article>
        `).join('');
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load sent files. Check your connection and refresh.</p>`;
    }
}

// ── Received files (reviewer sent it back) ──────────────────────────────────

async function loadReceived() {
    const list = document.getElementById('receivedList');
    try {
        const res = await fetch(`${ADMIN_API}/admin/assignments?status=completed`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        setText('receivedCount', String(items.length));

        if (!items.length) {
            list.innerHTML = `<p class="review-empty">Nothing has come back yet.</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <article class="review-card is-approved" data-id="${t.id}">
                <div class="review-card-icon" aria-hidden="true">${ICON_CHECK}</div>
                <div class="review-card-body">
                    <div class="review-card-top">
                        <div>
                            <div class="review-card-title">${escHtml(t.title || t.thesis?.title || 'Untitled thesis')}</div>
                            <div class="review-card-meta">
                                <span>${escHtml(t.student_name || t.thesis?.student_name || '—')}</span>
                                <span>·</span>
                                <span>From ${escHtml(roleLabels[t.reviewer_role] || t.reviewer_name || 'Reviewer')}</span>
                                <span>·</span>
                                <span>${formatDate(t.completed_at || t.updated_at)}</span>
                            </div>
                        </div>
                        <span class="badge badge-success">Completed</span>
                    </div>

                    ${t.reviewer_note ? `<div class="review-card-note"><span>Reviewer's note:</span> ${escHtml(t.reviewer_note)}</div>` : ''}

                    ${fileRow(t.file_url, 'Original file', 'thesis-original')}
                    ${reviewedRows(t, 'Reviewed file', 'thesis-reviewed')}
                </div>
            </article>
        `).join('');
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load received files. Check your connection and refresh.</p>`;
    }
}

// ── Send form ────────────────────────────────────────────────────────────

let selectedFile = null;
let sendQueue = [];

function renderQueue() {
    const list = document.getElementById('sendQueue');
    if (!list) return;
    list.innerHTML = '';
    sendQueue.forEach(function (entry, idx) {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;';
        const span = document.createElement('span');
        span.textContent = entry.label;
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '\u2715';
        x.setAttribute('aria-label', 'Remove');
        x.style.cssText = 'border:0;background:none;cursor:pointer;font-size:14px;color:inherit;';
        x.addEventListener('click', function () { sendQueue.splice(idx, 1); renderQueue(); });
        li.appendChild(span);
        li.appendChild(x);
        list.appendChild(li);
    });
    const dropLabel = document.getElementById('fileDropLabel');
    if (sendQueue.length) {
        dropLabel.classList.add('has-file');
        setText('fileDropText', sendQueue.length + (sendQueue.length === 1 ? ' file' : ' files') + ' ready \u2014 click to add more');
    } else {
        resetFileDrop();
    }
}

function addUploadedFiles(files) {
    files.forEach(function (f) {
        const dup = sendQueue.some(function (q) { return q.source === 'upload' && q.file.name === f.name && q.file.size === f.size; });
        if (!dup) sendQueue.push({ source: 'upload', key: null, file: f, title: f.name, student_name: '', label: f.name });
    });
    renderQueue();
}

function addPaymentFile(key, opt) {
    if (sendQueue.some(function (q) { return q.key === key; })) return;
    const name = opt.item.file_name || 'file';
    let file;
    try { file = dataUrlToFile(opt.item.file_base64, name); }
    catch (e) { showMsg('sendMsg', 'Could not read that file.', 'error'); return; }
    sendQueue.push({
        source: 'payment', key: key, file: file,
        title: (opt.item.label || 'File') + ' - ' + name,
        student_name: opt.payment.student || '',
        label: (opt.payment.student || 'Student') + ' \u2014 ' + (opt.item.label || 'File') + ' (' + name + ')'
    });
    renderQueue();
}

function resetFileDrop() {
    const label = document.getElementById('fileDropLabel');
    label.classList.remove('has-file', 'is-dragover');
    setText('fileDropText', 'Click to choose files, or drag them here');
}

function initSendForm() {
    const fileInput = document.getElementById('sendFile');
    const dropLabel = document.getElementById('fileDropLabel');

    fileInput.addEventListener('change', () => {
        addUploadedFiles(Array.prototype.slice.call(fileInput.files));
        fileInput.value = '';
    });

    const paySelect = document.getElementById('sendThesis');
    paySelect.addEventListener('change', () => {
        const opt = paymentFileOptions[paySelect.value];
        if (opt) addPaymentFile(paySelect.value, opt);
        paySelect.selectedIndex = 0;
    });

    ['dragover', 'dragenter'].forEach(evt =>
        dropLabel.addEventListener(evt, e => { e.preventDefault(); dropLabel.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(evt =>
        dropLabel.addEventListener(evt, e => { e.preventDefault(); dropLabel.classList.remove('is-dragover'); }));
    dropLabel.addEventListener('drop', e => {
        addUploadedFiles(Array.prototype.slice.call(e.dataTransfer.files));
    });

    document.getElementById('sendForm').addEventListener('submit', async e => {
        e.preventDefault();

        const reviewerId = document.getElementById('sendRecipient').value;
        if (!sendQueue.length || !reviewerId) {
            showMsg('sendMsg', 'Add at least one file and choose a reviewer first.', 'error');
            return;
        }

        const submitBtn = document.getElementById('sendSubmit');
        setBtnLoading(submitBtn, true);
        showMsg('sendMsg', '', null);

        const note = document.getElementById('sendNote').value.trim();
        const total = sendQueue.length;
        let sent = 0;

        try {
            while (sendQueue.length) {
                const entry = sendQueue[0];
                const body = new FormData();
                body.append('reviewer_id', reviewerId);
                body.append('note', note);
                body.append('title', entry.title);
                if (entry.student_name) body.append('student_name', entry.student_name);
                body.append('file', entry.file);

                const res = await fetch(`${ADMIN_API}/admin/assignments`, {
                    method: 'POST',
                    headers: authHeaders(false),
                    body,
                });

                if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.message || ('Could not send "' + entry.file.name + '".'));
                }
                sendQueue.shift();
                sent++;
                renderQueue();
            }

            document.getElementById('sendForm').reset();
            selectedFile = null;
            renderQueue();
            showMsg('sendMsg', total === 1 ? 'Sent!' : ('Sent ' + total + ' files!'), 'success');
            await loadSent();
        } catch (err) {
            showMsg('sendMsg', (sent ? ('Sent ' + sent + ' of ' + total + '. ') : '') + (err.message || 'Something went wrong. Try again.'), 'error');
            if (sent) { try { await loadSent(); } catch (e2) { /* ignore */ } }
        } finally {
            setBtnLoading(submitBtn, false);
        }
    });
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Guard — admin only
    const user = getUser();
    if (!getToken() || !user || !user.is_admin) {
        window.location.href = LOGIN_URL;
        return;
    }

    renderAdminIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();
    initTabs();
    initSendForm();
    initFileActions();

    loadThesisOptions();
    loadReviewerOptions();
    loadSent();
    loadReceived();
});

function reviewedRows(t, label, name) {
    const urls = (Array.isArray(t.reviewed_file_urls) && t.reviewed_file_urls.length)
        ? t.reviewed_file_urls
        : (t.reviewed_file_url ? [t.reviewed_file_url] : []);
    return urls.map(function (u, i) {
        return fileRow(u, urls.length > 1 ? label + ' ' + (i + 1) : label, name + (urls.length > 1 ? '-' + (i + 1) : ''));
    }).join('');
}