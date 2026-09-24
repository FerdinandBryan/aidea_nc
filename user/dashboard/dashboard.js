// dashboard.js — Student side
// Self-contained: reads the session from localStorage and calls the Laravel API.

const DASH_API = 'http://127.0.0.1:8000/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme'; // student-side preference (admin uses its own key)

// ── Session ────────────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem('auth_token') || null;

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function authHeaders() {
    return { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/json' };
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

async function api(path) {
    const res = await fetch(`${DASH_API}${path}`, { headers: authHeaders() });
    if (res.status === 401) {
        clearSession();
        window.location.href = LOGIN_URL;
        throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
}

const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

// ── Utilities ──────────────────────────────────────────────────────────────

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMonth(iso) {
    const d = new Date(iso);
    return iso && !isNaN(d) ? d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '—';
}

function statusBadge(status) {
    const key = String(status || '').toLowerCase().replace(/\s+/g, '_');
    const map = {
        approved: ['badge-success', 'Approved'],
        rejected: ['badge-danger', 'Rejected'],
        under_review: ['badge-warning', 'Under review'],
        pending: ['badge-warning', 'Pending'],
        revision: ['badge-warning', 'For revision'],
    };
    const [cls, label] = map[key] ?? ['', status || '—'];
    return `<span class="badge ${cls}">${escHtml(label)}</span>`;
}

// ── Theme (light / dark) ───────────────────────────────────────────────────

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

    // follow the OS setting until the student picks one manually
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', e => {
        let saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    });
}

// ── Mobile drawer ──────────────────────────────────────────────────────────

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

// ── Profile menu + sign-out modal ──────────────────────────────────────────

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
        fetch(`${DASH_API}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => { });
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
        if (e.key === 'Tab') { // keep focus inside the dialog
            if (e.shiftKey && document.activeElement === cancel) { e.preventDefault(); confirmBtn.focus(); }
            else if (!e.shiftKey && document.activeElement === confirmBtn) { e.preventDefault(); cancel.focus(); }
        }
    });
}

// ── Identity ───────────────────────────────────────────────────────────────

function renderUserIdentity(user) {
    const fullName = user.full_name || user.name
        || [user.fname, user.lname].filter(Boolean).join(' ') || 'Student';
    const parts = fullName.trim().split(/\s+/);
    const initials = (parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2)).toUpperCase();

    const q = s => document.querySelector(s);
    if (q('.footer-avatar')) q('.footer-avatar').textContent = initials;
    if (q('.footer-name')) q('.footer-name').textContent = fullName;
    if (q('.footer-role')) q('.footer-role').textContent = user.course || 'Student';

    setText('welcome', `Welcome back, ${parts[0]}!`);
    setText('todayLabel', new Date().toLocaleDateString('en-PH', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }));
}

// ── Data ───────────────────────────────────────────────────────────────────

async function loadDashboardStats() {
    try {
        const d = await api('/dashboard/stats');
        setText('stat-submissions', d.submissions ?? '—');
        setText('stat-approved', d.approved ?? '—');
        setText('stat-paid', '₱' + Number(d.total_paid || 0).toLocaleString('en-PH'));
        setText('stat-rating', d.avg_rating ?? '—');
    } catch (err) {
        console.warn('Stats error:', err);
    }
}

async function loadRecentSubmissions() {
    const tbody = document.getElementById('thesis-tbody');
    if (!tbody) return;

    try {
        const list = asList(await api('/submissions?limit=5'));
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty">No submissions yet. Submit your first thesis to get started.</td></tr>`;
            return;
        }
        tbody.innerHTML = list.map(t => `
            <tr>
                <td data-label="Title"><strong>${escHtml(t.title)}</strong></td>
                <td data-label="Submitted">${formatMonth(t.submitted_at)}</td>
                <td data-label="Status">${statusBadge(t.status)}</td>
                <td data-label="Actions"><button class="btn-action" type="button" onclick="viewThesis(${Number(t.id)})">View</button></td>
            </tr>`).join('');
    } catch (err) {
        console.warn('Submissions error:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="empty">Couldn’t load submissions. Check your connection and refresh.</td></tr>`;
    }
}

async function loadUpcomingEvents() {
    const listEl = document.getElementById('event-list');
    if (!listEl) return;

    try {
        const events = asList(await api('/events/upcoming'));
        if (!events.length) {
            listEl.innerHTML = `<p class="event-empty">No upcoming events.</p>`;
            return;
        }
        const pin = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;

        listEl.innerHTML = events.map(ev => {
            const d = new Date(ev.starts_at);
            const valid = !isNaN(d);
            const month = valid ? d.toLocaleString('en-US', { month: 'short' }).toUpperCase() : '—';
            const day = valid ? d.getDate() : '';
            const time = valid ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            const where = [ev.location, time].filter(Boolean).join(', ');
            return `
                <div class="event-item">
                    <div class="event-date"><span class="month">${month}</span><span class="day">${day}</span></div>
                    <div>
                        <p class="event-title">${escHtml(ev.title)}</p>
                        <p class="event-loc">${pin}<span>${escHtml(where)}</span></p>
                    </div>
                </div>`;
        }).join('');
    } catch (err) {
        console.warn('Events error:', err);
        listEl.innerHTML = `<p class="event-empty">Couldn’t load events.</p>`;
    }
}

function viewThesis(id) {
    window.location.href = `../my submission/my-submissions.html?id=${id}`;
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!getToken() || !user) {
        window.location.href = LOGIN_URL;
        return;
    }

    // UI first so the page is interactive immediately
    renderUserIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    loadDashboardStats();
    loadRecentSubmissions();
    loadUpcomingEvents();
});