// Reviewer_file_transfer.js  Reviewer: send a reviewed thesis file back to
// the admin, and see what the admin has sent you. Mirrors file_transfer.js's
// Send/Received design, but scoped to the reviewer's own assignments and a
// fixed recipient (the admin) instead of a reviewer dropdown.
// Same session/theme/drawer/sign-out conventions as Thesis_reviewer.js.

const ADMIN_API = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../../user/login/login.html';


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

//  Sign out 

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

//  Utilities 

function reviewedUrlsOf(t) {
    return (Array.isArray(t.reviewed_file_urls) && t.reviewed_file_urls.length)
        ? t.reviewed_file_urls
        : (t.reviewed_file_url ? [t.reviewed_file_url] : []);
}
function reviewedChips(t, label) {
    const urls = reviewedUrlsOf(t);
    return urls.map(function (u, i) {
        return '<a class="file-chip" href="' + escHtml(u) + '" target="_blank" rel="noopener">' + ICON_DOC + ' ' + label + (urls.length > 1 ? ' ' + (i + 1) : '') + '</a>';
    }).join('');
}

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
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d)) return '\u2014';
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

// ---- Modal dialog (replaces confirm / alert) ----

function showDialog({ title, message, confirmText = 'OK', cancelText = null, danger = false }) {
    return new Promise(resolve => {
        const prevFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'app-modal';
        overlay.innerHTML = `
            <div class="app-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="appModalTitle" aria-describedby="appModalMsg">
                <h3 class="app-modal-title" id="appModalTitle">${escHtml(title)}</h3>
                <p class="app-modal-msg" id="appModalMsg">${escHtml(message)}</p>
                <div class="app-modal-actions">
                    ${cancelText ? `<button type="button" class="app-modal-btn" data-act="cancel">${escHtml(cancelText)}</button>` : ''}
                    <button type="button" class="app-modal-btn app-modal-btn-primary${danger ? ' is-danger' : ''}" data-act="ok">${escHtml(confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.classList.add('no-scroll');

        const okBtn = overlay.querySelector('[data-act="ok"]');
        const cancelBtn = overlay.querySelector('[data-act="cancel"]');
        const focusables = [cancelBtn, okBtn].filter(Boolean);

        const finish = result => {
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (!document.getElementById('sidebar')?.classList.contains('open')) {
                document.body.classList.remove('no-scroll');
            }
            prevFocus?.focus?.();
            resolve(result);
        };

        const onKey = e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
            if (e.key === 'Tab') {
                const first = focusables[0], last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };

        document.addEventListener('keydown', onKey, true);
        okBtn.addEventListener('click', () => finish(true));
        cancelBtn?.addEventListener('click', () => finish(false));
        overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
        (cancelBtn || okBtn).focus();
    });
}
const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

const roleLabels = { statistician: 'Statistician', grammarian: 'Grammarian' };

//  Theme (light / dark) 
// Uses the same reviewer-only key as Thesis_reviewer.js so toggling theme
// here always matches the reviewer's other pages (and never the Admin
// dashboard's theme).

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

// Mobile drawer identical wiring to Thesis_reviewer.js

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

//  Render reviewer identity 

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

//  Tabs (Send / Received) 

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

    setText('pageHeading', isSend ? 'Send back to admin' : 'Received from admin');
    setText('pageSub', isSend
        ? "Attach your reviewed file and send it back once you're satisfied"
        : 'Theses the admin has assigned to you');

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

//  Icons (reused across cards) 

const ICON_DOC = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
function renderAdminNote(raw) {
    if (!raw) return '';
    if (!document.getElementById('rn-styles')) {
        const st = document.createElement('style');
        st.id = 'rn-styles';
        st.textContent = [
            '.rn-wrap{margin-top:14px;display:flex;flex-direction:column;gap:12px}',
            '.rn-note{border-left:3px solid #f5b301;background:rgba(245,179,1,.10);padding:10px 14px;border-radius:0 8px 8px 0}',
            '.rn-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.65;margin-bottom:4px}',
            '.rn-text{font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
            '.rn-details{border:1px solid rgba(127,127,127,.25);border-radius:10px;padding:14px 16px;background:rgba(127,127,127,.05)}',
            '.rn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px 28px;margin-top:10px}',
            '.rn-item{min-width:0}',
            '.rn-label{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;opacity:.6;margin-bottom:2px}',
            '.rn-value{font-size:14px;font-weight:600;line-height:1.4;word-break:break-word}'
        ].join('');
        document.head.appendChild(st);
    }
    const text = String(raw);
    const marker = 'REQUEST DETAILS';
    const at = text.indexOf(marker);
    const noteText = (at >= 0 ? text.slice(0, at) : text).trim();
    let html = '';
    if (noteText) {
        html += '<div class="rn-note"><div class="rn-title">Admin\'s note</div><div class="rn-text">' + escHtml(noteText) + '</div></div>';
    }
    if (at >= 0) {
        const items = text.slice(at + marker.length).split('\n')
            .map(function (l) { return l.trim(); })
            .filter(Boolean)
            .map(function (line) {
                const i = line.indexOf(': ');
                const label = i > 0 ? line.slice(0, i) : '';
                const value = i > 0 ? line.slice(i + 2) : line;
                return '<div class="rn-item"><div class="rn-label">' + escHtml(label || 'Info') + '</div><div class="rn-value">' + escHtml(value || '-') + '</div></div>';
            });
        if (items.length) {
            html += '<div class="rn-details"><div class="rn-title">Request details</div><div class="rn-grid">' + items.join('') + '</div></div>';
        }
    }
    return '<div class="rn-wrap">' + stripStatusItem(html) + '</div>';
}
function splitReviewTitle(t) {
    const title = String((t && t.title) || '');
    if (t && t.file_label) return { title: title, label: t.file_label };
    const m = title.match(/^(.+?)\s[-\u2013\u2014]\s(.+?)\s[-\u2013\u2014]\s(.+)$/);
    if (m) return { title: m[1] + ' - ' + m[2], label: m[3] };
    return { title: title, label: '' };
}
function linkifyLabel(label) {
    return escHtml(String(label)).replace(/(https?:\/\/[^\s<]+)/g, function (u) {
        return '<a href="' + u + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-weight:600">' + u + '</a>';
    });
}
function renderFileRows(t) {
    let items = Array.isArray(t.file_items) ? t.file_items.filter(function (i) { return i && i.url; }) : [];
    if (!items.length && t.file_url) items = [{ url: t.file_url, label: splitReviewTitle(t).label }];
    if (!items.length) return '';
    return '<div class="review-card-files" style="display:flex;flex-direction:column;gap:8px">' + items.map(function (i, n) {
        const dl = items.length > 1 ? '<a class="action-btn" href="' + escHtml(i.url) + '" download>Download</a>' : '';
        const name = items.length > 1 ? 'View file' : 'Original thesis file';
        return '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px"><a class="file-chip" href="' + escHtml(i.url) + '" target="_blank" rel="noopener">' + ICON_DOC + ' ' + name + '</a>' + renderFileLabel(i.label) + dl + '</div>';
    }).join('') + '</div>';
}
function stripStatusItem(html) {
    try {
        const box = document.createElement('div');
        box.innerHTML = html;
        box.querySelectorAll('.rn-grid *').forEach(function (n) {
            const par = n.parentElement;
            if (n.children.length === 0 && /^status:?$/i.test((n.textContent || '').trim()) && par && par.parentElement && par.parentElement.classList.contains('rn-grid')) par.remove();
        });
        return box.innerHTML;
    } catch (e) { return html; }
}
function renderFileLabel(label) {
    if (!label) return '';
    if (!document.getElementById('fl-styles')) {
        const st = document.createElement('style');
        st.id = 'fl-styles';
        st.textContent = [
            '.fl-caption{display:inline-flex;align-items:baseline;gap:8px;flex:1 1 240px;min-width:0;padding:6px 12px;border-left:3px solid rgba(127,127,127,.45);background:rgba(127,127,127,.06);border-radius:0 8px 8px 0}',
            '.fl-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.6;white-space:nowrap}',
            '.fl-text{font-size:13px;line-height:1.45;word-break:break-word}'
        ].join('');
        document.head.appendChild(st);
    }
    return '<span class="fl-caption"><span class="fl-title">Uploaded for</span><span class="fl-text">' + linkifyLabel(label) + '</span></span>';
}
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

//  Populate the send form's thesis dropdown (your pending assignments) 

async function loadThesisOptions() {
    const select = document.getElementById('sendThesis');
    try {
        const res = await fetch(`${ADMIN_API}/reviewer/assignments?status=pending`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        if (!items.length) {
            select.innerHTML = '<option value="" disabled selected>Nothing assigned to you right now</option>';
            return;
        }

        items.sort((a, b) => (a.id || 0) - (b.id || 0));
        select.innerHTML = items.map((t, i) => `
            <option value="${t.id}"${i === 0 ? ' selected' : ''}>${escHtml(splitReviewTitle(t).title || 'Untitled thesis')} \u2014 ${escHtml(t.student_name || t.student?.name || '\u2014')}${i === 0 ? ' (next in line)' : ''}</option>
        `).join('');
    } catch {
        select.innerHTML = '<option value="" disabled selected>Couldn\u2019t load your assignments</option>';
    }
}

/** Preselect a thesis in the Send tab and jump to it (used by the "Send back"
 *  shortcut on a card in the Received tab). */
function preselectAndGoToSend(id) {
    setActiveTab('send');
    const select = document.getElementById('sendThesis');
    if (select) select.value = id;
    document.getElementById('sendNote')?.focus();
}

//  Sent files (what you've already sent back to admin) 

async function resendAssignment(id) {
    const ok = await showDialog({
        title: 'Resend for revision?',
        message: 'This assignment will move back to Received and you can re-upload your reviewed file.',
        confirmText: 'Resend',
        cancelText: 'Cancel',
    });
    if (!ok) return;

    try {
        const res = await fetch(`${ADMIN_API}/reviewer/assignments/${id}/resend`, {
            method: 'POST',
            headers: authHeaders(),
        });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Could not resend. Try again.');
        }
        await loadSent();
        await loadReceived();
    } catch (e) {
        await showDialog({
            title: 'Something went wrong',
            message: e.message || 'Could not resend. Try again.',
            confirmText: 'OK',
        });
    }
}
async function loadSent() {
    const list = document.getElementById('sentList');
    try {
        const res = await fetch(`${ADMIN_API}/reviewer/assignments?status=completed`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        setText('sentCount', String(items.length));

        if (!items.length) {
            list.innerHTML = `<p class="review-empty">You haven't sent anything back yet.</p>`;
            return;
        }

        list.innerHTML = items.map(t => `
            <article class="review-card is-approved" data-id="${t.id}">
                <div class="review-card-icon" aria-hidden="true">${ICON_CHECK}</div>
                <div class="review-card-body">
                    <div class="review-card-top">
                        <div>
                            <div class="review-card-title">${escHtml(splitReviewTitle(t).title || 'Untitled thesis')}</div>
                            <div class="review-card-meta">
                                <span>${escHtml(t.student_name || t.student?.name || '\u2014')}</span>
                                <span>&middot;</span>
                                <span>Sent to Admin</span>
                                <span>&middot;</span>
                                <span>${formatDate(t.completed_at || t.updated_at)}</span>
                            </div>
                        </div>
                        <span class="badge badge-success">Sent</span>
                    </div>

                    ${t.reviewer_note ? `<div class="review-card-note" style="white-space:pre-line"><span>Your note:</span> ${escHtml(t.reviewer_note)}</div>` : ''}

                    <div class="review-card-files">
                        ${t.file_url ? `<a class="file-chip" href="${escHtml(t.file_url)}" target="_blank" rel="noopener">${ICON_DOC} Original file</a>` : ''}
                        ${reviewedChips(t, 'Your reviewed file')}
                    </div>

                    <div class="review-card-actions">
                        <button type="button" class="action-btn" data-resend="${t.id}">Resend</button>
                    </div>
                </div>
            </article>
        `).join('');

        list.querySelectorAll('[data-resend]').forEach(btn => {
            btn.addEventListener('click', () => resendAssignment(btn.dataset.resend));
        });
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load what you've sent. Check your connection and refresh.</p>`;
    }
}

//  Received files (assigned to you by the admin) 

async function loadReceived() {
    const list = document.getElementById('receivedList');
    try {
        const res = await fetch(`${ADMIN_API}/reviewer/assignments?status=pending`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const items = asList(await res.json());

        setText('receivedCount', String(items.length));

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
                            <div class="review-card-title">${escHtml(splitReviewTitle(t).title || 'Untitled thesis')}</div>
                            <div class="review-card-meta">
                                <span>${escHtml(t.student_name || t.student?.name || '\u2014')}</span>
                                <span>&middot;</span>
                                <span>Sent by ${escHtml(t.sent_by || t.admin_name || 'Admin')}</span>
                                <span>&middot;</span>
                                <span>${formatDate(t.assigned_at || t.created_at)}</span>
                            </div>
                        </div>
                        <span class="badge badge-warning">Awaiting your review</span>
                    </div>

                    ${renderAdminNote(t.note)}

                    ${renderFileRows(t)}

                    

                    <div class="review-card-actions">
                        ${(t.file_url && !(t.file_items && t.file_items.length > 1)) ? `
                        <a class="action-btn" href="${escHtml(t.file_url)}" target="_blank" rel="noopener">${ICON_EYE} View</a>
                        <a class="action-btn" href="${escHtml(t.file_url)}" download>${ICON_DOWNLOAD} Download</a>
                        ` : ''}
                        <button type="button" class="action-btn action-btn-primary" data-preselect="${t.id}">
                            ${ICON_CHECK} Satisfied &mdash; send back
                        </button>
                    </div>
                </div>
            </article>
        `).join('');

        list.querySelectorAll('[data-preselect]').forEach(btn => {
            btn.addEventListener('click', () => preselectAndGoToSend(btn.dataset.preselect));
        });
    } catch {
        list.innerHTML = `<p class="review-empty">Couldn't load your assigned theses. Check your connection and refresh.</p>`;
    }
}

//  Send form 

let selectedFile = null;
let sendQueue = [];
const MAX_REVIEW_FILES = 5;
const MAX_REVIEW_MB = 20;

function renderQueue() {
    const list = document.getElementById('sendQueue');
    if (!list) return;
    list.innerHTML = '';
    sendQueue.forEach(function (f, idx) {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;';
        const span = document.createElement('span');
        span.textContent = f.name;
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
        setText('fileDropText', sendQueue.length + (sendQueue.length === 1 ? ' file' : ' files') + ' attached \u2014 click to add more');
    } else {
        resetFileDrop();
    }
}

function addFiles(files) {
    for (const f of files) {
        if (sendQueue.length >= MAX_REVIEW_FILES) {
            showMsg('sendMsg', 'You can attach up to ' + MAX_REVIEW_FILES + ' files.', 'error');
            break;
        }
        if (f.size > MAX_REVIEW_MB * 1024 * 1024) {
            showMsg('sendMsg', f.name + ' is over ' + MAX_REVIEW_MB + ' MB.', 'error');
            continue;
        }
        const dup = sendQueue.some(function (q) { return q.name === f.name && q.size === f.size; });
        if (!dup) sendQueue.push(f);
    }
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
        addFiles(Array.prototype.slice.call(fileInput.files));
        fileInput.value = '';
    });

    ['dragover', 'dragenter'].forEach(evt =>
        dropLabel.addEventListener(evt, e => { e.preventDefault(); dropLabel.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(evt =>
        dropLabel.addEventListener(evt, e => { e.preventDefault(); dropLabel.classList.remove('is-dragover'); }));
    dropLabel.addEventListener('drop', e => {
        addFiles(Array.prototype.slice.call(e.dataTransfer.files));
    });

    document.getElementById('sendForm').addEventListener('submit', async e => {
        e.preventDefault();

        const assignmentId = document.getElementById('sendThesis').value;
        if (!assignmentId) {
            showMsg('sendMsg', 'Choose which assigned thesis to send back first.', 'error');
            return;
        }
        if (!sendQueue.length) {
            showMsg('sendMsg', 'Attach at least one file first.', 'error');
            return;
        }

        const submitBtn = document.getElementById('sendSubmit');
        setBtnLoading(submitBtn, true);
        showMsg('sendMsg', '', null);

        const body = new FormData();
        body.append('note', document.getElementById('sendNote').value.trim());
        sendQueue.forEach(f => body.append('reviewed_files[]', f));

        try {
            const res = await fetch(`${ADMIN_API}/reviewer/assignments/${assignmentId}/complete`, {
                method: 'POST',
                headers: authHeaders(false), // let the browser set the multipart boundary
                body,
            });

            if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Could not send this back. Try again.');
            }

            document.getElementById('sendForm').reset();
            selectedFile = null;
            sendQueue = [];
            renderQueue();
            showMsg('sendMsg', 'Sent to admin!', 'success');
            await Promise.all([loadThesisOptions(), loadSent(), loadReceived()]);
        } catch (err) {
            showMsg('sendMsg', err.message || 'Something went wrong. Try again.', 'error');
        } finally {
            setBtnLoading(submitBtn, false);
        }
    });
}


document.addEventListener('DOMContentLoaded', () => {

    // Guard reviewer roles only (statistician / grammarian)
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
    initTabs();
    initSendForm();

    loadThesisOptions();
    loadSent();
    loadReceived();
});

console.log('CORRECT_FILE_LOADED_v2');
