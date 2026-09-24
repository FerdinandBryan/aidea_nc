// Price_audit_log.js — AIDEA Admin | Laravel API
// Shares the theme / drawer / sign-out UI wiring with dashboard.js so both
// pages behave identically.

const API_BASE = 'http://127.0.0.1:8000/api';
const LOGIN_URL = '../../user/login/login.html';

// ── Session / API helpers ───────────────────────────────────────────────────

function getToken() {
    return localStorage.getItem('auth_token') || null;
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

async function apiFetch(path, options = {}) {
    const token = getToken();
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
        clearSession();
        window.location.href = LOGIN_URL;
        throw new Error('Unauthorized');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
    }
    return res.json();
}

// ── Sign out ─────────────────────────────────────────────────────────────

function performSignOut() {
    if (getToken()) {
        apiFetch('/logout', { method: 'POST' }).catch(() => { });
    }
    clearSession();
    window.location.href = LOGIN_URL;
}

// Confirmation modal (replaces the old browser confirm() dialog)
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

// ── Theme (light / dark) ────────────────────────────────────────────────

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

    // follow the OS setting until the user picks one manually
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
        let saved = null;
        try { saved = localStorage.getItem('aidea_theme'); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
}

// ── Mobile drawer ────────────────────────────────────────────────────────

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

// ── Profile menu (sidebar footer) ───────────────────────────────────────

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

function renderAdminIdentity(user) {
    const fullName = [user?.fname, user?.lname].filter(Boolean).join(' ') || 'Admin';
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

// ── Formatting helpers ──────────────────────────────────────────────────

// Shows the responsible person's name instead of the generic "Admin"
function displayName(name) {
    if (!name || !String(name).trim()) return '\u2014';
    return String(name).trim().toLowerCase() === 'admin' ? 'ROMAILYN FLORES' : name;
}

// Shows dates as: 2026-09-09 / 11:20 PM
function formatDate(value) {
    if (!value) return '\u2014';
    const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return String(value);
    let h = parseInt(m[4], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${m[1]}-${m[2]}-${m[3]} / ${h}:${m[5]} ${ampm}`;
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Audit log data ──────────────────────────────────────────────────────

let auditLogs = [];
let filtered = [];

async function loadAuditLogs() {
    try {
        auditLogs = await apiFetch('/price-audit-logs');
        filtered = [...auditLogs];
        populateServiceFilter();
        render();
    } catch (err) {
        console.error('Failed to load audit logs:', err);
        document.getElementById('auditBody').innerHTML =
            `<tr><td colspan="7" style="text-align:center;padding:32px 14px;color:var(--bad-fg);">
                Couldn't load the audit log. Check your connection and refresh.
            </td></tr>`;
    }
}

function populateServiceFilter() {
    const sel = document.getElementById('filterService');
    const names = [...new Set(auditLogs.map(l => l.service))].sort();
    sel.innerHTML = `<option value="">All Services</option>` +
        names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
}

function updateSummary() {
    const getDiff = l =>
        parseFloat(l.newPrice ?? l.new_price ?? 0) -
        parseFloat(l.oldPrice ?? l.old_price ?? 0);

    document.getElementById('sum-total').textContent = auditLogs.length;
    document.getElementById('sum-up').textContent = auditLogs.filter(l => getDiff(l) > 0).length;
    document.getElementById('sum-down').textContent = auditLogs.filter(l => getDiff(l) < 0).length;
}

function render() {
    updateSummary();
    document.getElementById('auditBody').innerHTML = filtered.length
        ? filtered.map(log => {
            const oldPrice = parseFloat(log.oldPrice ?? log.old_price ?? 0);
            const newPrice = parseFloat(log.newPrice ?? log.new_price ?? 0);
            const diff = newPrice - oldPrice;
            const up = diff > 0;
            return `
                <tr>
                    <td data-label="Log ID"><span class="log-id">${escHtml(log.id)}</span></td>
                    <td data-label="Service"><strong>${escHtml(log.service)}</strong></td>
                    <td data-label="Old Price">₱ ${oldPrice.toLocaleString()}</td>
                    <td data-label="New Price">₱ ${newPrice.toLocaleString()}</td>
                    <td data-label="Change" class="${up ? 'change-up' : 'change-down'}">
                        ${up ? '▲' : '▼'} ₱ ${Math.abs(diff).toLocaleString()}
                    </td>
                    <td data-label="Changed By">${escHtml(displayName(log.by ?? log.changed_by))}</td>
                    <td data-label="Date &amp; Time">${escHtml(formatDate(log.datetime ?? log.changed_at))}</td>
                </tr>
            `;
        }).join('')
        : `<tr><td colspan="7" style="text-align:center;padding:32px 14px;color:var(--muted);">No audit entries yet.</td></tr>`;
}

function applyFilter() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const filterSvc = document.getElementById('filterService').value;
    filtered = auditLogs.filter(l => {
        const id = String(l.id).toLowerCase();
        const svc = (l.service || '').toLowerCase();
        return (id.includes(q) || svc.includes(q)) &&
            (!filterSvc || l.service === filterSvc);
    });
    render();
}

// ── PRINT REPORT ─────────────────────────────────────────────────────────

function printReport() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    const serviceFilter = document.getElementById('filterService').value || 'All Services';
    const searchVal = document.getElementById('searchInput').value || '';

    const increases = filtered.filter(l => {
        const o = parseFloat(l.oldPrice ?? l.old_price ?? 0);
        const n = parseFloat(l.newPrice ?? l.new_price ?? 0);
        return n > o;
    }).length;
    const decreases = filtered.filter(l => {
        const o = parseFloat(l.oldPrice ?? l.old_price ?? 0);
        const n = parseFloat(l.newPrice ?? l.new_price ?? 0);
        return n < o;
    }).length;

    const rows = filtered.map(log => {
        const oldPrice = parseFloat(log.oldPrice ?? log.old_price ?? 0);
        const newPrice = parseFloat(log.newPrice ?? log.new_price ?? 0);
        const diff = newPrice - oldPrice;
        const up = diff > 0;
        return `
            <tr>
                <td>${escHtml(log.id)}</td>
                <td><strong>${escHtml(log.service)}</strong></td>
                <td>₱ ${oldPrice.toLocaleString()}</td>
                <td>₱ ${newPrice.toLocaleString()}</td>
                <td style="color:${up ? '#14764a' : '#b42323'};font-weight:700;">
                    ${up ? '▲' : '▼'} ₱ ${Math.abs(diff).toLocaleString()}
                </td>
                <td>${escHtml(displayName(log.by ?? log.changed_by))}</td>
                <td>${escHtml(formatDate(log.datetime ?? log.changed_at))}</td>
            </tr>`;
    }).join('');

    const printHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <title>Price Audit Log Report — AIDEA</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; color: #0e1a3a; background: #fff; padding: 32px 40px; font-size: 13px; }

        .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #0e1a3a; }
        .report-logo { display: flex; align-items: center; gap: 12px; }
        .logo-icon { width: 42px; height: 42px; background: #f5b301; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #0a1a3f; font-size: 14px; }
        .logo-text h1 { font-size: 20px; font-weight: 800; }
        .logo-text p { font-size: 11px; color: #5f6d8c; }
        .report-meta { text-align: right; }
        .report-meta h2 { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
        .report-meta p { font-size: 11px; color: #5f6d8c; }

        .summary { display: flex; gap: 14px; margin-bottom: 22px; }
        .sum-card { flex: 1; border: 1px solid #e2e7f1; border-radius: 10px; padding: 14px 16px; }
        .sum-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #5f6d8c; margin-bottom: 5px; }
        .sum-val { font-size: 22px; font-weight: 800; }
        .sum-val.green { color: #14764a; }
        .sum-val.red { color: #b42323; }
        .sum-val.blue { color: #1d4ed8; }

        .filters-row { font-size: 11px; color: #5f6d8c; margin-bottom: 16px; }
        .filters-row strong { color: #0e1a3a; }

        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead th { background: #0e1a3a; color: #fff; padding: 10px 12px; text-align: left; font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; font-weight: 700; }
        tbody tr { border-bottom: 1px solid #e2e7f1; }
        tbody tr:nth-child(even) { background: #f8f9fd; }
        tbody td { padding: 10px 12px; vertical-align: top; }

        .report-footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e2e7f1; display: flex; justify-content: space-between; font-size: 11px; color: #5f6d8c; }

        @media print {
            body { padding: 16px 20px; }
            @page { margin: 12mm; }
        }
    </style>
</head>
<body>
    <div class="report-header">
        <div class="report-logo">
            <div class="logo-icon">AI</div>
            <div class="logo-text">
                <h1>AIDEA Admin</h1>
                <p>Norzagaray College Research Management Platform</p>
            </div>
        </div>
        <div class="report-meta">
            <h2>Price Audit Log Report</h2>
            <p>Generated: ${dateStr} at ${timeStr}</p>
            <p>Generated by: Admin</p>
        </div>
    </div>

    <div class="summary">
        <div class="sum-card">
            <div class="sum-label">Total Entries</div>
            <div class="sum-val blue">${filtered.length}</div>
        </div>
        <div class="sum-card">
            <div class="sum-label">Price Increases</div>
            <div class="sum-val green">▲ ${increases}</div>
        </div>
        <div class="sum-card">
            <div class="sum-label">Price Decreases</div>
            <div class="sum-val red">▼ ${decreases}</div>
        </div>
        <div class="sum-card">
            <div class="sum-label">Service Filter</div>
            <div class="sum-val" style="font-size:14px;color:#0e1a3a;">${escHtml(serviceFilter)}</div>
        </div>
    </div>

    <div class="filters-row">
        Showing <strong>${filtered.length}</strong> of <strong>${auditLogs.length}</strong> entries
        ${searchVal ? `| Search: <strong>"${escHtml(searchVal)}"</strong>` : ''}
        | Service: <strong>${escHtml(serviceFilter)}</strong>
    </div>

    <table>
        <thead>
            <tr>
                <th>Log ID</th>
                <th>Service</th>
                <th>Old Price</th>
                <th>New Price</th>
                <th>Change</th>
                <th>Changed By</th>
                <th>Date &amp; Time</th>
            </tr>
        </thead>
        <tbody>
            ${rows || `<tr><td colspan="7" style="text-align:center;padding:20px;color:#5f6d8c;">No entries to display.</td></tr>`}
        </tbody>
    </table>

    <div class="report-footer">
        <span>AIDEA — Norzagaray College Research Management Platform</span>
        <span>Confidential — For Internal Use Only</span>
        <span>Page 1</span>
    </div>

    <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1000,height=700');
    win.document.write(printHTML);
    win.document.close();
}

// ── EXPORT CSV ───────────────────────────────────────────────────────────

function exportCSV() {
    if (!filtered.length) {
        alert('No data to export.');
        return;
    }
    const headers = ['Log ID', 'Service', 'Old Price', 'New Price', 'Change', 'Changed By', 'Date & Time'];
    const rows = filtered.map(log => {
        const o = parseFloat(log.oldPrice ?? log.old_price ?? 0);
        const n = parseFloat(log.newPrice ?? log.new_price ?? 0);
        const diff = n - o;
        return [
            log.id,
            `"${log.service}"`,
            o,
            n,
            (diff >= 0 ? '+' : '') + diff,
            `"${displayName(log.by ?? log.changed_by)}"`,
            `"${formatDate(log.datetime ?? log.changed_at)}"`
        ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Boot ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Guard — admin only
    const user = getUser();
    if (!getToken() || !user || !user.is_admin) {
        window.location.href = LOGIN_URL;
        return;
    }

    // UI wiring first so the page is interactive immediately
    renderAdminIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    // Data
    loadAuditLogs();
    document.getElementById('searchInput').addEventListener('input', applyFilter);
    document.getElementById('filterService').addEventListener('change', applyFilter);
    document.getElementById('printBtn').addEventListener('click', printReport);
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
});