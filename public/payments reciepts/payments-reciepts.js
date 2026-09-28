/* ══════════════════════════════════════════════════
   payments-reciepts.js  (Student Side)
   Reads this student's payments from
   GET /api/payments?student=<name>
   Status: Pending | Paid | Rejected
══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

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
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
    }

    /* ══════════════════════════════════════════════════
       LOAD PAYMENTS from API
       Filters to only this logged-in student's records.
    ══════════════════════════════════════════════════ */
    const user = JSON.parse(localStorage.getItem('aidea_user') || '{}');
    const currentStudent = user.full_name || user.name || '';

    async function getPayments() {
        // Pass student name as a query param so the backend can filter server-side.
        // Falls back to client-side filter if the API returns all records.
        const all = await apiFetch(`/payments?student=${encodeURIComponent(currentStudent)}`);
        // Extra client-side guard in case the backend ignores the param
        return all.filter(p => p.student === currentStudent);
    }

    let payments = [];
    let searchTerm = '';
    let statusFilter = '';

    /* ══════════════════════════════════════════════════
       SUMMARY CARDS
    ══════════════════════════════════════════════════ */
    function updateSummary() {
        const paid = payments.filter(p => p.status === 'Paid');
        const pending = payments.filter(p => p.status === 'Pending');
        const total = paid.reduce((s, p) => s + Number(p.amount), 0);

        animateCount('summaryTotal', '₱ ' + total.toLocaleString());
        animateCount('summaryPaid', paid.length);
        animateCount('summaryPending', pending.length);
        animateCount('summaryReceipts', paid.length);
    }

    function animateCount(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    /* ══════════════════════════════════════════════════
       BADGE
    ══════════════════════════════════════════════════ */
    function badgeHTML(status) {
        if (status === 'Paid') return '<span class="badge badge-paid">✅ Paid</span>';
        if (status === 'Rejected') return '<span class="badge badge-failed">❌ Rejected</span>';
        return '<span class="badge badge-pending">⏳ Pending</span>';
    }

    /* ══════════════════════════════════════════════════
       RENDER TABLE
    ══════════════════════════════════════════════════ */
    function render() {
        const tbody = document.getElementById('payTableBody');
        const empty = document.getElementById('payEmpty');
        const q = searchTerm;

        const filtered = payments.filter(p => {
            const ref = p.ref || String(p.id) || '';
            const gcashRef = p.gcash_ref || p.gcashRef || '';
            const matchSearch = !q
                || ref.toLowerCase().includes(q)
                || p.service.toLowerCase().includes(q)
                || gcashRef.toLowerCase().includes(q);
            const matchStatus = !statusFilter || p.status === statusFilter;
            return matchSearch && matchStatus;
        });

        tbody.innerHTML = filtered.map((p, i) => `
            <tr>
                <td><span class="ref-num">${p.ref || p.id}</span></td>
                <td>${p.service}</td>
                <td>${p.date || p.date_iso || p.dateISO || '—'}</td>
                <td>₱ ${Number(p.amount).toLocaleString()}</td>
                <td>${p.method}</td>
                <td>${badgeHTML(p.status)}</td>
                <td>
                    ${p.status === 'Paid'
                ? `<button class="btn-receipt" onclick="openReceipt(${i}, window.filteredPayments)">🧾 View</button>`
                : p.status === 'Pending'
                    ? `<button class="btn-na" disabled title="Awaiting admin approval">🕐 Pending</button>`
                    : `<button class="btn-na" disabled title="Payment was rejected">❌ Rejected</button>`
            }
                </td>
            </tr>
        `).join('');

        empty.style.display = filtered.length === 0 ? 'block' : 'none';
        window.filteredPayments = filtered;
    }

    /* ══════════════════════════════════════════════════
       RECEIPT MODAL
    ══════════════════════════════════════════════════ */
    window.openReceipt = (i, list) => {
        const p = (list || payments)[i];
        if (!p || p.status !== 'Paid') return;

        const gcashRef = p.gcash_ref || p.gcashRef || '—';
        const studentId = p.student_id || p.studentId || '2021-00123';

        document.getElementById('rRefNum').textContent = p.ref || p.id;
        document.getElementById('receiptBody').innerHTML = `
            <div class="r-row"><span class="r-label">Student</span>      <span class="r-value">${p.student || currentStudent}</span></div>
            <div class="r-row"><span class="r-label">Student ID</span>   <span class="r-value">${studentId}</span></div>
            <div class="r-row"><span class="r-label">Service</span>      <span class="r-value">${p.service}</span></div>
            <div class="r-row"><span class="r-label">Date</span>         <span class="r-value">${p.date || p.date_iso || p.dateISO || '—'}</span></div>
            <div class="r-row"><span class="r-label">GCash Ref #</span>  <span class="r-value">${gcashRef}</span></div>
            <div class="r-row"><span class="r-label">Method</span>       <span class="r-value">${p.method}</span></div>
            <div class="r-row"><span class="r-label">Status</span>       <span class="r-value">${badgeHTML(p.status)}</span></div>
            <div class="r-row total"><span class="r-label">Total Amount</span><span class="r-value">₱ ${Number(p.amount).toLocaleString()}</span></div>
        `;
        document.getElementById('receiptModal').style.display = 'flex';
    };

    document.getElementById('receiptClose')?.addEventListener('click', () => {
        document.getElementById('receiptModal').style.display = 'none';
    });
    document.getElementById('receiptModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('receiptModal'))
            document.getElementById('receiptModal').style.display = 'none';
    });

    /* ── Search / Filter ─────────────────────────────── */
    document.getElementById('paySearch')?.addEventListener('input', e => {
        searchTerm = e.target.value.toLowerCase();
        render();
    });
    document.getElementById('statusFilter')?.addEventListener('change', e => {
        statusFilter = e.target.value;
        render();
    });

    /* ── Sign out ────────────────────────────────────── */
    document.querySelector('.btn-signout')?.addEventListener('click', () => {
        if (confirm('Sign out?')) window.location.href = '../../login/login.html';
    });

    /* ── Init: load from API then render ─────────────── */
    async function init() {
        try {
            payments = await getPayments();
        } catch (err) {
            console.error('Failed to load payments:', err);
            payments = [];
        }
        updateSummary();
        render();
    }

    init();
});