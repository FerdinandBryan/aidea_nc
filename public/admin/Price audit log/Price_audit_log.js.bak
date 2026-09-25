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
            `<tr><td colspan="8" style="text-align:center;padding:24px;color:#ef4444;">
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

function render() {
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
                    <td><span class="reason-text">${log.reason}</span></td>
                    <td>${log.datetime}</td>
                </tr>
            `;
        }).join('')
        : `<tr><td colspan="8" style="text-align:center;padding:24px;color:#8b90a7;">No audit entries yet.</td></tr>`;
}

function applyFilter() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const svc = document.getElementById('filterService').value;
    filtered = auditLogs.filter(l => {
        const id = String(l.id).toLowerCase();
        const svc = (l.service || '').toLowerCase();
        const reason = (l.reason || '').toLowerCase();
        return (id.includes(q) || svc.includes(q) || reason.includes(q)) &&
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