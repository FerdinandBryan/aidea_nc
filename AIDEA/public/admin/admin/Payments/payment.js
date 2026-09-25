/* ══════════════════════════════════════════════════
   AIDEA Admin — payment.js
   Reads ALL payments from GET /api/payments.
   Admin can Approve (→ Paid) or Reject any Pending.
══════════════════════════════════════════════════ */

const API_BASE = 'http://127.0.0.1:8000/api';

/* ══════════════════════════════════════════════════
   API HELPER
══════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════
   APPROVE / REJECT — PATCH /api/payments/{id}/approve|reject
══════════════════════════════════════════════════ */
async function updatePaymentStatus(id, action) {
    // action: 'approve' | 'reject'
    return apiFetch(`/payments/${id}/${action}`, { method: 'PATCH' });
}

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
let allPayments = [];
let filtered = [];
let searchTerm = '';
let statusFilter = '';
let viewingPayment = null;

/* ══════════════════════════════════════════════════
   STATUS BADGE
══════════════════════════════════════════════════ */
function statusBadge(s) {
    // Normalise naming between student-side and admin-side
    const display = s === 'Paid' ? 'Completed' : s === 'Rejected' ? 'Cancelled' : s;
    const cls = {
        Completed: 'badge-success',
        Pending: 'badge-warning',
        Cancelled: 'badge-danger',
    };
    return `<span class="badge ${cls[display] || ''}">${display}</span>`;
}

/* ══════════════════════════════════════════════════
   SUMMARY MINI-STATS
══════════════════════════════════════════════════ */
function updateStats() {
    const completed = allPayments.filter(p => p.status === 'Completed' || p.status === 'Paid');
    const pending = allPayments.filter(p => p.status === 'Pending');
    const cancelled = allPayments.filter(p => p.status === 'Cancelled' || p.status === 'Rejected');

    const totalRev = allPayments.reduce((s, p) => s + Number(p.amount), 0);
    const compRev = completed.reduce((s, p) => s + Number(p.amount), 0);
    const pendRev = pending.reduce((s, p) => s + Number(p.amount), 0);
    const cancRev = cancelled.reduce((s, p) => s + Number(p.amount), 0);

    const stats = document.querySelectorAll('.mini-stat strong');
    if (stats[0]) stats[0].textContent = '₱ ' + totalRev.toLocaleString();
    if (stats[1]) stats[1].textContent = '₱ ' + compRev.toLocaleString();
    if (stats[2]) stats[2].textContent = '₱ ' + pendRev.toLocaleString();
    if (stats[3]) stats[3].textContent = '₱ ' + cancRev.toLocaleString();
}

/* ══════════════════════════════════════════════════
   RENDER TABLE
══════════════════════════════════════════════════ */
function render() {
    const q = searchTerm.toLowerCase();
    filtered = allPayments.filter(p => {
        const matchQ = !q || p.student.toLowerCase().includes(q)
            || (p.gcash_ref || p.gcashRef || '').toLowerCase().includes(q)
            || (p.ref || '').toLowerCase().includes(q);
        const normStatus = p.status === 'Paid' ? 'Completed'
            : p.status === 'Rejected' ? 'Cancelled'
                : p.status;
        const matchSt = !statusFilter || normStatus === statusFilter;
        return matchQ && matchSt;
    });

    const isPending = p => p.status === 'Pending';

    document.getElementById('paymentsBody').innerHTML = filtered.map((p, i) => `
        <tr class="${isPending(p) ? 'row-pending' : ''}">
            <td>
                <strong>${p.student}</strong>
                <br><small style="color:#8b90a7;">${p.student_id || p.studentId || ''}</small>
            </td>
            <td>${p.service}</td>
            <td>₱ ${Number(p.amount).toLocaleString()}</td>
            <td><code>${p.gcash_ref || p.gcashRef || '—'}</code></td>
            <td>${statusBadge(p.status)}</td>
            <td>${p.date || p.date_iso || p.dateISO || '—'}</td>
            <td class="action-cell">
                <button class="btn-action btn-view" onclick="openViewModal(${i})">🔍 View</button>
                ${isPending(p)
            ? `<button class="btn-action btn-approve" onclick="approvePayment(${p.id})">✅ Approve</button>
                       <button class="btn-action btn-reject"  onclick="rejectPayment(${p.id})">❌ Reject</button>`
            : (p.status === 'Completed' || p.status === 'Paid')
                ? `<button class="btn-action btn-receipt" onclick="openViewModal(${i})">🧾 Receipt</button>`
                : `<span style="color:#9ca3af;font-size:.8rem;">—</span>`
        }
            </td>
        </tr>
    `).join('');
}

/* ══════════════════════════════════════════════════
   APPROVE / REJECT
══════════════════════════════════════════════════ */
async function approvePayment(id) {
    if (!confirm('Approve this payment?')) return;
    try {
        await updatePaymentStatus(id, 'approve');
        await reload();
        showToast('✅ Payment approved!', 'success');
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to approve payment.', 'error');
    }
}

async function rejectPayment(id) {
    if (!confirm('Reject this payment? The student will see it as Rejected.')) return;
    try {
        await updatePaymentStatus(id, 'reject');
        await reload();
        showToast('❌ Payment rejected.', 'error');
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to reject payment.', 'error');
    }
}

/* ══════════════════════════════════════════════════
   VIEW MODAL (proof image + details)
══════════════════════════════════════════════════ */
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderResearchInfo(p) {
    const raw = p.research_items;
    if (!raw) return '';

    let items;
    try {
        items = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return '';
    }
    if (!Array.isArray(items) || !items.length) return '';

    const rows = items.map(item => {
        if (item.type === 'text') {
            return `<div class="vm-row">
                        <span class="vm-label">${escapeHtml(item.label)}</span>
                        <span class="vm-val">${escapeHtml(item.value || '-')}</span>
                    </div>`;
        }
        if (item.type === 'image' && item.file_base64) {
            return `<div style="margin-bottom:.75rem;">
                        <div class="vm-label" style="margin-bottom:.4rem;">${escapeHtml(item.label)}</div>
                        <img src="${item.file_base64}" alt="${escapeHtml(item.file_name || 'Image')}"
                             style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;border:1.5px solid #e5e7eb;" />
                    </div>`;
        }
        if (item.type === 'file' && item.file_base64) {
            return `<div class="vm-row">
                        <span class="vm-label">${escapeHtml(item.label)}</span>
                        <a href="${item.file_base64}" download="${escapeHtml(item.file_name || 'file')}"
                           style="color:#2563eb;font-weight:700;text-decoration:none;">
                            (file) ${escapeHtml(item.file_name || 'Download')}
                        </a>
                    </div>`;
        }
        return `<div class="vm-row">
                    <span class="vm-label">${escapeHtml(item.label)}</span>
                    <span class="vm-val" style="color:#9ca3af;">No data submitted</span>
                </div>`;
    }).join('');

    return `<div style="margin-top:.25rem;padding-top:.75rem;border-top:1.5px dashed #e5e7eb;">
                <div class="vm-label" style="font-weight:800;color:#1a1d2e;margin-bottom:.5rem;">Research Info</div>
                ${rows}
            </div>`;
}
function openViewModal(i) {
    const p = filtered[i];
    if (!p) return;
    viewingPayment = p;

    const modal = document.getElementById('viewModal');
    const body = document.getElementById('viewModalBody');
    const gcashRef = p.gcash_ref || p.gcashRef || '—';
    const studentId = p.student_id || p.studentId || '—';
    const proofSrc = p.proof_image || p.proofImage || null;

    body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:.75rem;">
            <div class="vm-row"><span class="vm-label">Reference #</span><span class="vm-val">${p.ref || p.id}</span></div>
            <div class="vm-row"><span class="vm-label">Student</span><span class="vm-val">${p.student} <small style="color:#8b90a7;">(${studentId})</small></span></div>
            <div class="vm-row"><span class="vm-label">Service</span><span class="vm-val">${p.service}</span></div>
            <div class="vm-row"><span class="vm-label">Amount</span><span class="vm-val" style="font-weight:800;color:#1a1d2e;">₱ ${Number(p.amount).toLocaleString()}</span></div>
            <div class="vm-row"><span class="vm-label">GCash Ref #</span><span class="vm-val"><code>${gcashRef}</code></span></div>
            <div class="vm-row"><span class="vm-label">Date</span><span class="vm-val">${p.date || p.date_iso || p.dateISO || '—'}</span></div>
            <div class="vm-row"><span class="vm-label">Status</span><span class="vm-val">${statusBadge(p.status)}</span></div>
            ${renderResearchInfo(p)}
            ${proofSrc
            ? `<div>
                       <div class="vm-label" style="margin-bottom:.5rem;">Payment Proof</div>
                       <img src="${proofSrc}" alt="Payment Proof"
                            style="width:100%;max-height:280px;object-fit:contain;border-radius:10px;border:1.5px solid #e5e7eb;" />
                   </div>`
            : `<div class="vm-row"><span class="vm-label">Payment Proof</span><span class="vm-val" style="color:#9ca3af;">No image uploaded</span></div>`
        }
            ${p.status === 'Pending'
            ? `<div style="display:flex;gap:.6rem;margin-top:.5rem;">
                       <button class="btn-action btn-approve" style="flex:1;padding:.7rem;"
                           onclick="approvePayment(${p.id});closeViewModal()">✅ Approve</button>
                       <button class="btn-action btn-reject"  style="flex:1;padding:.7rem;"
                           onclick="rejectPayment(${p.id});closeViewModal()">❌ Reject</button>
                   </div>`
            : ''
        }
        </div>
    `;

    modal.style.display = 'flex';
}

function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
    viewingPayment = null;
}

/* ══════════════════════════════════════════════════
   RELOAD — fetch fresh data from API
══════════════════════════════════════════════════ */
async function reload() {
    try {
        allPayments = await apiFetch('/payments');
    } catch (err) {
        console.error('Failed to load payments:', err);
        showToast('❌ Failed to load payments.', 'error');
        allPayments = [];
    }
    updateStats();
    render();
}

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
    const colors = { success: '#22c55e', error: '#ef4444' };
    let t = document.getElementById('adminPayToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'adminPayToast';
        t.style.cssText = `
            position:fixed;bottom:2rem;right:2rem;
            padding:.8rem 1.4rem;border-radius:10px;
            font-size:.85rem;font-weight:700;color:#fff;
            box-shadow:0 4px 20px rgba(0,0,0,.2);z-index:9999;
            transform:translateY(20px);opacity:0;transition:all .3s;
            pointer-events:none;
        `;
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = colors[type] || colors.success;
    t.style.transform = 'translateY(0)';
    t.style.opacity = '1';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
        t.style.transform = 'translateY(20px)';
        t.style.opacity = '0';
    }, 3500);
}

/* ══════════════════════════════════════════════════
   DOM READY
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    /* ── Inject View Modal HTML into page ── */
    const modalHTML = `
        <div id="viewModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400;align-items:center;justify-content:center;padding:1rem;">
            <div style="background:#fff;border-radius:20px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 12px 60px rgba(0,0,0,.22);">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:1.2rem 1.6rem;border-bottom:1px solid #e5e7eb;">
                    <h3 style="font-size:1rem;font-weight:800;font-family:'Space Grotesk',sans-serif;">Payment Details</h3>
                    <button onclick="closeViewModal()" style="background:#f3f4f6;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:.9rem;">✕</button>
                </div>
                <div id="viewModalBody" style="padding:1.4rem 1.6rem;"></div>
            </div>
        </div>
        <style>
            .vm-row      { display:flex; justify-content:space-between; align-items:center; padding:.5rem 0; border-bottom:1px solid #f3f4f6; font-size:.88rem; }
            .vm-label    { color:#6b7280; font-weight:600; }
            .vm-val      { color:#1a1d2e; font-weight:500; text-align:right; }
            .row-pending td { background:rgba(245,158,11,.04); }
            .action-cell { display:flex; gap:.4rem; flex-wrap:wrap; align-items:center; }
            .btn-approve { background:#16a34a!important; color:#fff!important; border-color:#16a34a!important; }
            .btn-approve:hover { background:#15803d!important; }
            .btn-reject  { background:#dc2626!important; color:#fff!important; border-color:#dc2626!important; }
            .btn-reject:hover  { background:#b91c1c!important; }
            .btn-receipt { background:#2563eb!important; color:#fff!important; border-color:#2563eb!important; }
            .btn-view    { background:#f3f4f6; color:#374151; }
        </style>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    /* ── Close modal on overlay click ── */
    document.addEventListener('click', e => {
        const modal = document.getElementById('viewModal');
        if (e.target === modal) closeViewModal();
    });

    /* ── Search & filter ── */
    document.getElementById('searchInput')?.addEventListener('input', e => {
        searchTerm = e.target.value;
        render();
    });
    document.getElementById('filterStatus')?.addEventListener('change', e => {
        statusFilter = e.target.value;
        render();
    });

    /* ── Nav buttons ── */
    document.getElementById('homeBtn')?.addEventListener('click', () =>
        location.href = '../dashboard/dashboard.html'
    );
    document.getElementById('signOutBtn')?.addEventListener('click', () => {
        if (confirm('Sign out?')) window.location.href = '../../login/login.html';
    });

    /* ── Initial load from API ── */
    reload();
});