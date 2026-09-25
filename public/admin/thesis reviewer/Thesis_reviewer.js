// thesis-review.js — Statistician / Grammarian reviewer interface
// Same session/theme/drawer conventions as dashboard.js, plus the review workflow.

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
// Uses its own storage key so toggling theme here never affects the
// Admin dashboard's theme, and vice versa.

const THEME_KEY = 'aidea_theme_reviewer';

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
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
        try { saved = localStorage.getItem(THEME_KEY); } catch { }
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
    sidebar.querySelectorAll('a[href]:not([data-nav-tab])').forEach(a => a.addEventListener('click', close));
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

// ── Render reviewer identity ────────────────────────────────────────────────

function renderReviewerIdentity(user) {
    const fullName = [user.fname, user.lname].filter(Boolean).join(' ') || 'Reviewer';
    const parts = fullName.trim().split(/\s+/);
    const ini = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    const roleLabel = roleLabels[user.role] || 'Reviewer';

    setText('footerAvatar', ini);
    setText('footerName', fullName);
    setText('footerRole', roleLabel);
    setText('roleBadge', roleLabel);
}

// ── Tabs ─────────────────────────────────────────────────────────────────

let activeTab = 'pending';

function setActiveTab(tab) {
    activeTab = tab;
    const isPending = tab === 'pending';

    document.getElementById('tabPendingBtn').classList.toggle('active', isPending);
    document.getElementById('tabPendingBtn').setAttribute('aria-selected', String(isPending));
    document.getElementById('tabHistoryBtn').classList.toggle('active', !isPending);
    document.getElementById('tabHistoryBtn').setAttribute('aria-selected', String(!isPending));

    document.getElementById('pendingPanel').hidden = !isPending;
    document.getElementById('historyPanel').hidden = isPending;

    setText('pageHeading', isPending ? 'Assigned to me' : 'Review history');
    setText('pageSub', isPending
        ? 'Thesis papers sent to you for review'
        : 'Thesis papers you have already sent back');

    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url);
}

function initTabs() {
    document.getElementById('tabPendingBtn').addEventListener('click', () => setActiveTab('pending'));
    document.getElementById('tabHistoryBtn').addEventListener('click', () => setActiveTab('history'));
    document.querySelectorAll('[data-nav-tab]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            setActiveTab(a.dataset.navTab);
        });
    });

    const initial = new URLSearchParams(window.location.search).get('tab');
    setActiveTab(initial === 'history' ? 'history' : 'pending');
}

// ── Icons (reused across cards) ─────────────────────────────────────────────

const ICON_DOC = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

// ── Load assigned theses (pending) ──────────────────────────────────────────

async function loadPending() {
    const list = document.getElementById('pendingList');
    try {
        const res = await fetch(`${ADMIN_API}/reviewer/assignments?status=pending`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        setText('pendingCount', String(items.length));

        if (!items.length) {
            list.innerHTML = `<p class="review-empty">Nothing assigned to you right now.</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <article class="review-card" data-id="${t.id}">
                <div class="review-card-icon" aria-hidden="true">${ICON_DOC}</div>
                <div class="review-card-body">
                    <div class="review-card-top">
                        <div>
                            <div class="review-card-title">${escHtml(t.title || 'Untitled thesis')}</div>
                            <div class="review-card-meta">
                                <span>${escHtml(t.student_name || t.student?.name || '—')}</span>
                                <span>·</span>
                                <span>Sent by ${escHtml(t.sent_by || t.admin_name || 'Admin')}</span>
                                <span>·</span>
                                <span>${formatDate(t.assigned_at || t.created_at)}</span>
                            </div>
                        </div>
                        <span class="badge badge-warning">Pending review</span>
                    </div>

                    ${t.note ? `<div class="review-card-note"><span>Admin's note:</span> ${escHtml(t.note)}</div>` : ''}

                    ${t.file_url ? `
                    <div class="review-card-files">
                        <a class="file-chip" href="${escHtml(t.file_url)}" target="_blank" rel="noopener">
                            ${ICON_DOC} Original thesis file
                        </a>
                    </div>` : ''}

                    <div class="review-card-actions">
                        ${t.file_url ? `
                        <a class="action-btn" href="${escHtml(t.file_url)}" target="_blank" rel="noopener">${ICON_EYE} View</a>
                        <a class="action-btn" href="${escHtml(t.file_url)}" download>${ICON_DOWNLOAD} Download</a>
                        ` : ''}
                        <button type="button" class="action-btn action-btn-primary" data-send-back="${t.id}"
                            data-title="${escHtml(t.title || 'this thesis')}">
                            ${ICON_CHECK} Satisfied — send back
                        </button>
                    </div>
                </div>
            </article>
        `).join('');

        list.querySelectorAll('[data-send-back]').forEach(btn => {
            btn.addEventListener('click', () => openSendBackModal(btn.dataset.sendBack, btn.dataset.title));
        });
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load your assigned theses. Check your connection and refresh.</p>`;
    }
}

// ── Load review history ─────────────────────────────────────────────────────

async function loadHistory() {
    const list = document.getElementById('historyList');
    try {
        const res = await fetch(`${ADMIN_API}/reviewer/assignments?status=completed`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        setText('historyCount', String(items.length));

        if (!items.length) {
            list.innerHTML = `<p class="review-empty">You haven't sent any theses back yet.</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <article class="review-card is-approved" data-id="${t.id}">
                <div class="review-card-icon" aria-hidden="true">${ICON_CHECK}</div>
                <div class="review-card-body">
                    <div class="review-card-top">
                        <div>
                            <div class="review-card-title">${escHtml(t.title || 'Untitled thesis')}</div>
                            <div class="review-card-meta">
                                <span>${escHtml(t.student_name || t.student?.name || '—')}</span>
                                <span>·</span>
                                <span>Sent back ${formatDate(t.completed_at || t.updated_at)}</span>
                            </div>
                        </div>
                        <span class="badge badge-success">Approved</span>
                    </div>

                    ${t.reviewer_note ? `<div class="review-card-note"><span>Your note:</span> ${escHtml(t.reviewer_note)}</div>` : ''}

                    <div class="review-card-files">
                        ${t.file_url ? `<a class="file-chip" href="${escHtml(t.file_url)}" target="_blank" rel="noopener">${ICON_DOC} Original file</a>` : ''}
                        ${t.reviewed_file_url ? `<a class="file-chip" href="${escHtml(t.reviewed_file_url)}" target="_blank" rel="noopener">${ICON_DOC} Your reviewed file</a>` : ''}
                    </div>
                </div>
            </article>
        `).join('');
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load your review history. Check your connection and refresh.</p>`;
    }
}

// ── Send-back-to-admin modal ─────────────────────────────────────────────────

let sendBackTargetId = null;
let selectedFile = null;

function openSendBackModal(id, title) {
    sendBackTargetId = id;
    selectedFile = null;

    const modal = document.getElementById('sendBackModal');
    const form = document.getElementById('sendBackForm');
    form.reset();
    showMsg('sendBackMsg', '', null);
    setText('sendBackSubtitle', `You're satisfied with "${title}" — send it back to the admin.`);
    resetFileDrop();

    modal.hidden = false;
    document.body.classList.add('no-scroll');
    document.getElementById('reviewNote').focus();
}

function closeSendBackModal() {
    document.getElementById('sendBackModal').hidden = true;
    if (!document.getElementById('sidebar')?.classList.contains('open')) {
        document.body.classList.remove('no-scroll');
    }
}

function resetFileDrop() {
    const label = document.getElementById('fileDropLabel');
    label.classList.remove('has-file', 'is-dragover');
    setText('fileDropText', 'Click to choose a file, or drag it here');
}

function initSendBackModal() {
    document.getElementById('sendBackCancel').addEventListener('click', closeSendBackModal);
    document.getElementById('sendBackModal').addEventListener('click', e => {
        if (e.target.id === 'sendBackModal') closeSendBackModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !document.getElementById('sendBackModal').hidden) closeSendBackModal();
    });

    const fileInput = document.getElementById('reviewFile');
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

    document.getElementById('sendBackForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!sendBackTargetId) return;

        const submitBtn = document.getElementById('sendBackSubmit');
        setBtnLoading(submitBtn, true);
        showMsg('sendBackMsg', '', null);

        const body = new FormData();
        body.append('note', document.getElementById('reviewNote').value.trim());
        if (selectedFile) body.append('reviewed_file', selectedFile);

        try {
            const res = await fetch(`${ADMIN_API}/reviewer/assignments/${sendBackTargetId}/complete`, {
                method: 'POST',
                headers: authHeaders(false), // let the browser set the multipart boundary
                body,
            });

            if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Could not send this back. Try again.');
            }

            closeSendBackModal();
            await Promise.all([loadPending(), loadHistory()]);
        } catch (err) {
            showMsg('sendBackMsg', err.message || 'Something went wrong. Try again.', 'error');
        } finally {
            setBtnLoading(submitBtn, false);
        }
    });
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Guard — reviewer roles only (statistician / grammarian)
    const user = getUser();
    if (!getToken() || !user || !['statistician', 'grammarian'].includes(user.role)) {
        window.location.href = LOGIN_URL;
        return;
    }

    renderReviewerIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();
    initSendBackModal();
    initTabs();

    loadPending();
    loadHistory();
});