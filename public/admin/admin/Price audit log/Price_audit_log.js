// Price_audit_log.js — AIDEA Admin | Laravel API

const API_BASE = 'http://127.0.0.1:8000/api';

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
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
    }
    return res.json();
}

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
            `<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">
                ❌ Failed to load audit log. Please try again.
            </td></tr>`;
    }
}

function populateServiceFilter() {
    const sel = document.getElementById('filterService');
    const names = [...new Set(auditLogs.map(l => l.service))].sort();
    sel.innerHTML = `<option value="">All Services</option>` +
        names.map(n => `<option value="${n}">${n}</option>`).join('');
}

function updateSummary() {
    const getDiff = l =>
        parseFloat(l.newPrice ?? l.new_price ?? 0) -
        parseFloat(l.oldPrice ?? l.old_price ?? 0);

    document.getElementById('sum-total').textContent   = auditLogs.length;
    document.getElementById('sum-up').textContent      = auditLogs.filter(l => getDiff(l) > 0).length;
    document.getElementById('sum-down').textContent    = auditLogs.filter(l => getDiff(l) < 0).length;
    document.getElementById('sum-showing').textContent = filtered.length;
}

function render() {
    updateSummary();
    document.getElementById('auditBody').innerHTML = filtered.length
        ? filtered.map(log => {
            // Handle both camelCase and snake_case from API
            const oldPrice = parseFloat(log.oldPrice ?? log.old_price ?? 0);
            const newPrice = parseFloat(log.newPrice ?? log.new_price ?? 0);
            const diff = newPrice - oldPrice;
            const up = diff > 0;
            return `
                <tr>
                    <td><span class="log-id">${log.id}</span></td>
                    <td><strong>${log.service}</strong></td>
                    <td>₱ ${oldPrice.toLocaleString()}</td>
                    <td>₱ ${newPrice.toLocaleString()}</td>
                    <td class="${up ? 'change-up' : 'change-down'}">
                        ${up ? '▲' : '▼'} ₱ ${Math.abs(diff).toLocaleString()}
                    </td>
                    <td>${log.by}</td>
                    <td>${log.datetime}</td>
                </tr>
            `;
        }).join('')
        : `<tr><td colspan="7" style="text-align:center;padding:24px;color:#8b90a7;">No audit entries yet.</td></tr>`;
}

function applyFilter() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const svc = document.getElementById('filterService').value;
    filtered = auditLogs.filter(l => {
        const id = String(l.id).toLowerCase();
        const svc = (l.service || '').toLowerCase();
        return (id.includes(q) || svc.includes(q)) &&
            (!filterSvc || l.service === filterSvc);
    });
    render();
}

document.addEventListener('DOMContentLoaded', () => {
    loadAuditLogs();
    document.getElementById('searchInput').addEventListener('input', applyFilter);
    document.getElementById('filterService').addEventListener('change', applyFilter);
    document.getElementById('homeBtn').addEventListener('click', () =>
        location.href = '../dashboard/dashboard.html'
    );
    document.getElementById('signOutBtn').addEventListener('click', () => {
        if (confirm('Sign out?')) window.location.href = '../../login/login.html';
    });
});