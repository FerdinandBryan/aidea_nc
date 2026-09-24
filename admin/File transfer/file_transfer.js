// file_transfer.js — Admin: send thesis files to a reviewer, and see what
// reviewers have sent back. Same session/theme/drawer/sign-out conventions
// as dashboard.js and thesis-review.js.

const ADMIN_API = 'http://127.0.0.1:8000/api';
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

async function handleFile(url, mode, fallbackName) {
    // Open the tab synchronously so popup blockers allow it
    const win = mode === 'view' ? window.open('', '_blank') : null;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);

        if (mode === 'view') {
            if (win) win.location.href = objUrl; else window.open(objUrl, '_blank');
        } else {
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = guessFilename(res, url, fallbackName);
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch {
        if (win) win.close();
        alert('Couldn\u2019t open that file. Please try again.');
    }
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

async function loadThesisOptions() {
    const select = document.getElementById('sendThesis');
    try {
        const res = await fetch(`${ADMIN_API}/thesis/list`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        select.innerHTML = '<option value="" disabled selected>Select a thesis…</option>' + items.map(t => `
            <option value="${t.id}">${escHtml(t.title || 'Untitled thesis')} — ${escHtml(t.user?.name ?? t.student_name ?? '—')}</option>
        `).join('');
    } catch {
        select.innerHTML = '<option value="" disabled selected>Couldn\u2019t load theses</option>';
    }
}

async function loadReviewerOptions() {
    const select = document.getElementById('sendRecipient');
    try {
        const res = await fetch(`${ADMIN_API}/admin/reviewers`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        const byRole = { statistician: [], grammarian: [] };
        items.forEach(r => { (byRole[r.role] || (byRole[r.role] = [])).push(r); });

        const optgroup = (role, label) => {
            const people = byRole[role] || [];
            if (!people.length) return '';
            return `<optgroup label="${label}">${people.map(r => `
                <option value="${r.id}">${escHtml([r.fname, r.lname].filter(Boolean).join(' ') || r.name || label)}</option>
            `).join('')}</optgroup>`;
        };

        select.innerHTML = '<option value="" disabled selected>Select a reviewer…</option>'
            + optgroup('statistician', 'Statistician')
            + optgroup('grammarian', 'Grammarian');
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
                    ${fileRow(t.reviewed_file_url, 'Reviewed file', 'thesis-reviewed')}
                </div>
            </article>
        `).join('');
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load received files. Check your connection and refresh.</p>`;
    }
}

// ── Send form ────────────────────────────────────────────────────────────

let selectedFile = null;

function resetFileDrop() {
    const label = document.getElementById('fileDropLabel');
    label.classList.remove('has-file', 'is-dragover');
    setText('fileDropText', 'Click to choose a file, or drag it here');
}

function initSendForm() {
    const fileInput = document.getElementById('sendFile');
    const dropLabel = document.getElementById('fileDropLabel');

    fileInput.addEventListener('change', () => {
        selectedFile = fileInput.files[0] || null;
        if (selectedFile) {
            dropLabel.classList.add('has-file');
            setText('fileDropText', selectedFile.name);
        } else {
            resetFileDrop();
        }
    });

    ['dragover', 'dragenter'].forEach(evt =>
        dropLabel.addEventListener(evt, e => { e.preventDefault(); dropLabel.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(evt =>
        dropLabel.addEventListener(evt, e => { e.preventDefault(); dropLabel.classList.remove('is-dragover'); }));
    dropLabel.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) {
            fileInput.files = e.dataTransfer.files;
            selectedFile = file;
            dropLabel.classList.add('has-file');
            setText('fileDropText', file.name);
        }
    });

    document.getElementById('sendForm').addEventListener('submit', async e => {
        e.preventDefault();

        const thesisId = document.getElementById('sendThesis').value;
        const reviewerId = document.getElementById('sendRecipient').value;
        if (!thesisId || !reviewerId) {
            showMsg('sendMsg', 'Choose a thesis and a reviewer first.', 'error');
            return;
        }

        const submitBtn = document.getElementById('sendSubmit');
        setBtnLoading(submitBtn, true);
        showMsg('sendMsg', '', null);

        const body = new FormData();
        body.append('thesis_id', thesisId);
        body.append('reviewer_id', reviewerId);
        body.append('note', document.getElementById('sendNote').value.trim());
        if (selectedFile) body.append('file', selectedFile);

        try {
            const res = await fetch(`${ADMIN_API}/admin/assignments`, {
                method: 'POST',
                headers: authHeaders(false), // let the browser set the multipart boundary
                body,
            });

            if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Could not send this file. Try again.');
            }

            document.getElementById('sendForm').reset();
            selectedFile = null;
            resetFileDrop();
            showMsg('sendMsg', 'Sent!', 'success');
            await loadSent();
        } catch (err) {
            showMsg('sendMsg', err.message || 'Something went wrong. Try again.', 'error');
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