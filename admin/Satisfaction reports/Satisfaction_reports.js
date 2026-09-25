// Satisfaction_reports.js — Admin side
// Same session/theme/drawer/sign-out pattern as dashboard.js, plus the
// satisfaction-report widgets (stats, rating breakdown, service chart, reviews).

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

function authHeaders() {
    return {
        'Authorization': `Bearer ${getToken()}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
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

// Confirmation modal (replaces the browser's confirm() dialog)
function initSignOutModal() {
    const modal = document.getElementById('signOutModal');
    const trigger = document.getElementById('signOutBtn');
    const cancel = document.getElementById('signOutCancel');
    const confirmBtn = document.getElementById('signOutConfirm');
    const profileBtn = document.getElementById('profileBtn');
    const profileMenu = document.getElementById('profileMenu');
    if (!modal || !trigger || !cancel || !confirmBtn) return;

    const open = () => {
        // close the small profile menu first
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

// ── API helpers (one request per endpoint, shared by every widget) ─────────

const _cache = new Map();

function load(path) {
    if (!_cache.has(path)) {
        _cache.set(path, (async () => {
            const res = await fetch(`${ADMIN_API}${path}`, { headers: authHeaders() });
            if (res.status === 401) {
                clearSession();
                window.location.href = LOGIN_URL;
                throw new Error('Unauthorized');
            }
            if (!res.ok) throw new Error(`${path} ${res.status}`);
            return res.json();
        })());
    }
    return _cache.get(path);
}

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

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function starString(n) {
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
}

// A review counts as "NEW" for its first 24 hours, based on when it was
// submitted — not on read/unread state, since that's no longer tracked here.
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
function isNewReview(f) {
    const raw = f.created_at || f.date;
    if (!raw) return false;
    const t = new Date(raw).getTime();
    if (isNaN(t)) return false;
    return (Date.now() - t) < NEW_WINDOW_MS;
}

// Shopee-style privacy mask: keep the first and last letter of each name
// part, hide everything in between behind asterisks — e.g. "Benjamin Cruz"
// becomes "B******n C**z".
function maskName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Anonymous';
    return parts.map(word => {
        if (word.length <= 2) return word.charAt(0) + '*'.repeat(word.length || 1);
        return word.charAt(0) + '*'.repeat(word.length - 2) + word.charAt(word.length - 1);
    }).join(' ');
}

function maskedInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return ((parts[0][0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── Theme (light / dark) ───────────────────────────────────────────────────

const charts = { service: null };

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
    restyleCharts();
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

function restyleCharts() {
    const { service } = charts;
    if (service) {
        const ds = service.data.datasets[0];
        ds.backgroundColor = cssVar('--chart-line');
        service.options.scales.x.ticks.color = cssVar('--chart-text');
        service.options.scales.y.ticks.color = cssVar('--chart-text');
        service.options.scales.y.grid.color = cssVar('--chart-grid');
        service.update('none');
    }
}

// ── Mobile drawer ──────────────────────────────────────────────────────────

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

// ── Profile menu (sidebar footer) ──────────────────────────────────────────

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

// ── Render admin identity in sidebar ──────────────────────────────────────

function renderAdminIdentity(user) {
    const fullName = [user.fname, user.lname].filter(Boolean).join(' ') || 'Admin';
    const parts = fullName.trim().split(/\s+/);
    const ini = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

    const footerName = document.querySelector('.footer-name');
    const footerAvatar = document.querySelector('.footer-avatar');
    const footerRole = document.querySelector('.footer-role');
    if (footerAvatar) footerAvatar.textContent = ini;
    if (footerName) footerName.textContent = fullName;
    if (footerRole) footerRole.textContent = 'Administrator';
}

// ── Stats + rating breakdown + service chart ───────────────────────────────

let newCount = 0;

function updateNewBadge() {
    const badge = document.getElementById('newBadge');
    if (badge) {
        badge.textContent = newCount;
        badge.hidden = newCount <= 0;
    }
    setText('stat-new', newCount);
}

function renderRatingRows(breakdown, total) {
    const box = document.getElementById('ratingRows');
    if (!box) return;
    box.innerHTML = '';
    [5, 4, 3, 2, 1].forEach(n => {
        const count = Number(breakdown?.[n]) || 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'rating-row';
        row.innerHTML = `
            <span class="rating-label">${n}<span aria-hidden="true">★</span></span>
            <span class="rating-bar-bg"><span class="rating-bar-fill" style="width:${pct}%"></span></span>
            <span class="rating-count">${count}</span>
        `;
        box.appendChild(row);
    });
}

async function loadStats() {
    try {
        const s = await load('/admin/feedbacks/stats');
        const total = Number(s.total_count) || 0;
        const avg = Number(s.average_rating) || 0;

        setText('chipRating', total ? avg.toFixed(1) : '—');
        setText('stat-total', total || 0);
        setText('stat-average', total ? avg.toFixed(1) : '—');

        renderRatingRows(s.breakdown || {}, total);
        initServiceChart(s.per_type || {});
    } catch (err) {
        console.warn('Stats error:', err);
        setText('chipRating', '—');
        ['stat-total', 'stat-average'].forEach(id => setText(id, '—'));
        renderRatingRows({}, 0);
        initServiceChart({});
    }
}

function initServiceChart(perType) {
    const canvas = document.getElementById('serviceChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = Object.keys(perType);
    const values = labels.map(l => Number(perType[l]) || 0);

    if (charts.service) { charts.service.destroy(); charts.service = null; }

    if (!labels.length) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    charts.service = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: cssVar('--chart-line'),
                borderRadius: 7,
                maxBarThickness: 42,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { displayColors: false },
            },
            scales: {
                y: {
                    min: 0, max: 5,
                    border: { display: false },
                    grid: { color: cssVar('--chart-grid') },
                    ticks: { color: cssVar('--chart-text'), font: { size: 11 } },
                },
                x: {
                    border: { display: false },
                    grid: { display: false },
                    ticks: { color: cssVar('--chart-text'), font: { size: 11.5 } },
                },
            },
        },
    });
}

// ── Reviews ──────────────────────────────────────────────────────────────

let reviewPage = 1;
let reviewLastPage = 1;

function reviewNode(f) {
    const wrap = document.createElement('div');
    wrap.className = 'review-item';

    const avatar = document.createElement('div');
    avatar.className = 'review-avatar';
    avatar.textContent = maskedInitials(f.student_name);
    wrap.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'review-body';

    body.innerHTML = `
        <div class="review-head">
            <span class="review-name">${escHtml(maskName(f.student_name))}</span>
            ${isNewReview(f) ? '<span class="review-new">NEW</span>' : ''}
            <span class="review-stars" aria-hidden="true">${starString(f.rating)}</span>
        </div>
        <div class="review-meta">${escHtml(f.feedback_type || '')}${f.reference ? ' · ' + escHtml(f.reference) : ''}</div>
        <div class="review-text">${escHtml(f.comment || '')}</div>
        <div class="review-foot">${escHtml(f.date || '')}${f.recommend ? ' · Would recommend: ' + escHtml(f.recommend) : ''}</div>
    `;

    wrap.appendChild(body);
    return wrap;
}

async function loadReviews(reset) {
    const list = document.getElementById('reviewList');
    if (!list) return;

    try {
        const data = await load(`/admin/feedbacks?page=${reviewPage}`);
        const pg = data.feedbacks || {};
        const items = pg.data || [];
        reviewLastPage = pg.last_page || 1;

        if (reset) newCount = 0;
        newCount += items.filter(isNewReview).length;
        updateNewBadge();

        if (reset) list.innerHTML = '';
        const oldMore = document.getElementById('loadMoreBtn');
        if (oldMore) oldMore.remove();

        if (!items.length && reset) {
            list.innerHTML = '<p class="review-empty">No reviews yet. They will appear here once students submit feedback.</p>';
            return;
        }

        items.forEach(f => list.appendChild(reviewNode(f)));

        if (reviewPage < reviewLastPage) {
            const more = document.createElement('button');
            more.id = 'loadMoreBtn';
            more.type = 'button';
            more.className = 'btn-more';
            more.textContent = 'Load more';
            more.addEventListener('click', async () => {
                reviewPage++;
                more.disabled = true;
                more.textContent = 'Loading…';
                try { await loadReviews(false); }
                catch (e) { reviewPage--; more.disabled = false; more.textContent = 'Load more'; console.warn(e); }
            });
            list.appendChild(more);
        }
    } catch (err) {
        console.warn('Reviews error:', err);
        list.innerHTML = '<p class="review-empty">Couldn’t load reviews. Check your connection and refresh.</p>';
    }
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

    loadStats();
    reviewPage = 1;
    loadReviews(true);
});