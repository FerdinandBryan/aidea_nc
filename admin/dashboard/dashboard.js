// dashboard.js — Admin side
// Pulls real data from Laravel API using auth_token from localStorage.

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
        // keep scroll locked if the mobile drawer is still open behind the modal
        if (!document.getElementById('sidebar')?.classList.contains('open')) {
            document.body.classList.remove('no-scroll');
        }
        profileBtn?.focus();
    };

    trigger.addEventListener('click', open);
    cancel.addEventListener('click', close);
    confirmBtn.addEventListener('click', performSignOut);

    // click on the dark backdrop closes it
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.addEventListener('keydown', e => {
        if (modal.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        // keep keyboard focus inside the dialog
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
            if (res.status === 401) {          // token expired
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

const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

const PAID = ['completed', 'paid'];
const isPaid = p => PAID.includes(String(p.status || '').toLowerCase());
const isPending = p => String(p.status || '').toLowerCase() === 'pending';

// ── Utilities ──────────────────────────────────────────────────────────────

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function statusBadge(s) {
    const key = String(s || '').toLowerCase();
    const map = {
        completed: 'badge-success', paid: 'badge-success', approved: 'badge-success',
        pending: 'badge-warning', under_review: 'badge-warning',
        cancelled: 'badge-danger', rejected: 'badge-danger',
    };
    const label = s
        ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
        : '—';
    return `<span class="badge ${map[key] || ''}">${escHtml(label)}</span>`;
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function peso(n) {
    return '₱' + Number(n || 0).toLocaleString('en-PH');
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ── Theme (light / dark) ───────────────────────────────────────────────────

const charts = { revenue: null, donut: null };

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

    // follow the OS setting until the user picks one manually
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
        let saved = null;
        try { saved = localStorage.getItem('aidea_theme'); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
}

function restyleCharts() {
    const { revenue, donut } = charts;
    if (revenue) {
        const ds = revenue.data.datasets[0];
        ds.borderColor = cssVar('--chart-line');
        ds.backgroundColor = cssVar('--chart-fill');
        ds.pointBackgroundColor = cssVar('--surface');
        ds.pointBorderColor = cssVar('--chart-line');
        revenue.options.scales.x.ticks.color = cssVar('--chart-text');
        revenue.options.scales.y.ticks.color = cssVar('--chart-text');
        revenue.options.scales.y.grid.color = cssVar('--chart-grid');
        revenue.update('none');
    }
    if (donut) {
        donut.data.datasets[0].borderColor = cssVar('--surface');
        donut.update('none');
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

    // click anywhere else closes the menu
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

// ── Load summary stats ─────────────────────────────────────────────────────
// Tries GET /api/admin/stats — falls back to individual endpoints if unavailable.

async function loadStats() {
    try {
        const data = await load('/admin/stats');
        setText('stat-students', data.total_students ?? '—');
        setText('stat-submissions', data.total_submissions ?? '—');
        setText('stat-pending', data.pending_payments ?? '—');
        setText('stat-revenue', data.total_revenue != null ? peso(data.total_revenue) : '₱0');
        setText('stat-feedback', data.avg_feedback ?? '—');
    } catch {
        await loadStatsFallback();
    }
}

async function loadStatsFallback() {
    const [students, submissions, payments, feedback] = await Promise.allSettled([
        load('/students'),
        load('/thesis/list'),
        load('/payments'),
        load('/admin/feedbacks/stats'),
    ]);

    if (students.status === 'fulfilled') setText('stat-students', asList(students.value).length);
    if (submissions.status === 'fulfilled') setText('stat-submissions', asList(submissions.value).length);

    if (payments.status === 'fulfilled') {
        const arr = asList(payments.value);
        setText('stat-pending', arr.filter(isPending).length);
        setText('stat-revenue', peso(arr.filter(isPaid).reduce((s, p) => s + Number(p.amount || 0), 0)));
    }

    if (feedback.status === 'fulfilled') setText('stat-feedback', feedback.value.average_rating ?? '—');
}

// ── Recent transactions ────────────────────────────────────────────────────

async function loadRecentTransactions() {
    const tbody = document.getElementById('txnBody');
    if (!tbody) return;

    try {
        const list = asList(await load('/payments')).slice(0, 5);

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty">No transactions yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(p => `
            <tr>
                <td data-label="Student"><strong>${escHtml(p.student || p.student_name || '—')}</strong></td>
                <td data-label="Service">${escHtml(p.service || '—')}</td>
                <td data-label="Amount">${peso(p.amount)}</td>
                <td data-label="GCash ref"><code>${escHtml(p.gcash_ref || p.gcashRef || p.ref || '—')}</code></td>
                <td data-label="Status">${statusBadge(p.status)}</td>
                <td data-label="Date">${formatDate(p.date || p.created_at)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.warn('Transactions error:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="empty">Couldn’t load transactions. Check your connection and refresh.</td></tr>`;
    }
}

// ── Recent thesis submissions ──────────────────────────────────────────────

async function loadRecentSubmissions() {
    const tbody = document.getElementById('submissionsBody');
    if (!tbody) return;

    try {
        const list = asList(await load('/thesis/list')).slice(0, 5);

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty">No submissions yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(t => `
            <tr>
                <td data-label="Title"><strong>${escHtml(t.title || '—')}</strong></td>
                <td data-label="Student">${escHtml(t.user?.name ?? t.student_name ?? '—')}</td>
                <td data-label="Date">${formatDate(t.created_at)}</td>
                <td data-label="Status">${statusBadge(t.status)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.warn('Submissions error:', err);
        tbody.innerHTML = `<tr><td colspan="4" class="empty">Couldn’t load submissions. Check your connection and refresh.</td></tr>`;
    }
}

// ── Revenue chart (current year, completed payments) ──────────────────────

async function initRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = new Date().getFullYear();
    const monthly = new Array(12).fill(0);

    try {
        asList(await load('/payments')).forEach(p => {
            if (!isPaid(p)) return;
            const d = new Date(p.date || p.created_at);
            if (!isNaN(d) && d.getFullYear() === year) monthly[d.getMonth()] += Number(p.amount || 0);
        });
    } catch { /* keep zeroes */ }

    setText('revenueYear', `Completed payments by month, ${year}`);

    const compact = v => v >= 1000000 ? '₱' + (v / 1000000) + 'M'
        : v >= 1000 ? '₱' + (v / 1000) + 'k' : '₱' + v;

    charts.revenue = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Revenue',
                data: monthly,
                borderColor: cssVar('--chart-line'),
                backgroundColor: cssVar('--chart-fill'),
                pointBackgroundColor: cssVar('--surface'),
                pointBorderColor: cssVar('--chart-line'),
                pointBorderWidth: 2,
                pointRadius: 3.5,
                pointHoverRadius: 6,
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    callbacks: { label: ctx => peso(ctx.parsed.y) },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { color: cssVar('--chart-text'), font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                },
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: cssVar('--chart-grid') },
                    ticks: { color: cssVar('--chart-text'), font: { size: 11 }, callback: compact, maxTicksLimit: 6 },
                },
            },
        },
    });
}

// ── Services donut (payments per service) ─────────────────────────────────

const DONUT_COLORS = ['#2563eb', '#ffc72c', '#60a5fa', '#e09f00', '#1e3a8a', '#93c5fd'];

async function initDonutChart() {
    const canvas = document.getElementById('donutChart');
    if (!canvas || typeof Chart === 'undefined') return;

    let labels = ['No data yet'];
    let values = [1];
    let colors = ['#cbd5e1'];
    let hasData = false;

    try {
        const byService = {};
        asList(await load('/payments')).forEach(p => {
            const svc = p.service || 'Other';
            byService[svc] = (byService[svc] || 0) + 1;
        });
        if (Object.keys(byService).length) {
            labels = Object.keys(byService);
            values = Object.values(byService);
            colors = labels.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]);
            hasData = true;
        }
    } catch { /* keep placeholder */ }

    charts.donut = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: cssVar('--surface'),
                borderWidth: 3,
                hoverOffset: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: { legend: { display: false }, tooltip: { enabled: hasData } },
        },
    });

    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
        const total = values.reduce((a, b) => a + b, 0);
        legendEl.innerHTML = hasData
            ? labels.map((lbl, i) => `
                <div class="legend-item">
                    <span class="lbl"><span class="dot" style="background:${colors[i]}"></span><span>${escHtml(lbl)}</span></span>
                    <strong>${total ? Math.round((values[i] / total) * 100) : 0}%</strong>
                </div>`).join('')
            : `<div class="legend-item"><span class="lbl">No payments recorded yet.</span></div>`;
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

    // UI wiring first so the page is interactive immediately
    renderAdminIdentity(user);
    setText('todayLabel', new Date().toLocaleDateString('en-PH', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }));
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    // Data — all widgets share the same cached requests
    loadStats();
    loadRecentTransactions();
    loadRecentSubmissions();
    initRevenueChart();
    initDonutChart();
});