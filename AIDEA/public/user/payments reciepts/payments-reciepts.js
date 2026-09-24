/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   payments-reciepts.js  (Student Side)
   Reads this student's payments from
   GET /api/payments?student=<name>
   Status: Pending | Paid | Rejected
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

document.addEventListener('DOMContentLoaded', () => {

    const API_BASE = 'http://127.0.0.1:8000/api';

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       API HELPER
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       LOAD PAYMENTS from API
       Filters to only this logged-in student's records.
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    const user = JSON.parse(localStorage.getItem('aidea_user') || '{}');
    const currentStudent = user.full_name || user.name || [user.fname, user.lname].filter(Boolean).join(' ');

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

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       SUMMARY CARDS
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    function updateSummary() {
        const paid = payments.filter(p => p.status === 'Paid');
        const pending = payments.filter(p => p.status === 'Pending');
        const total = paid.reduce((s, p) => s + Number(p.amount), 0);

        animateCount('summaryTotal', 'â‚± ' + total.toLocaleString());
        animateCount('summaryPaid', paid.length);
        animateCount('summaryPending', pending.length);
        animateCount('summaryReceipts', paid.length);
    }

    function animateCount(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       BADGE
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    function badgeHTML(status) {
        if (status === 'Paid') return '<span class="badge badge-paid">âœ… Paid</span>';
        if (status === 'Rejected') return '<span class="badge badge-failed">âŒ Rejected</span>';
        return '<span class="badge badge-pending">â³ Pending</span>';
    }

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       RENDER TABLE
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
                <td>${p.date || p.date_iso || p.dateISO || 'â€”'}</td>
                <td>â‚± ${Number(p.amount).toLocaleString()}</td>
                <td>${p.method}</td>
                <td>${badgeHTML(p.status)}</td>
                <td>
                    ${p.status === 'Paid'
                ? `<button class="btn-receipt" onclick="openReceipt(${i}, window.filteredPayments)">ðŸ§¾ View</button>`
                : p.status === 'Pending'
                    ? `<button class="btn-na" disabled title="Awaiting admin approval">ðŸ• Pending</button>`
                    : `<button class="btn-na" disabled title="Payment was rejected">âŒ Rejected</button>`
            }
                </td>
            </tr>
        `).join('');

        empty.style.display = filtered.length === 0 ? 'block' : 'none';
        window.filteredPayments = filtered;
    }

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       RECEIPT MODAL
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    window.openReceipt = (i, list) => {
        const p = (list || payments)[i];
        if (!p || p.status !== 'Paid') return;

        const gcashRef = p.gcash_ref || p.gcashRef || 'â€”';
        const studentId = p.student_id || p.studentId || '2021-00123';

        document.getElementById('rRefNum').textContent = p.ref || p.id;
        document.getElementById('receiptBody').innerHTML = `
            <div class="r-row"><span class="r-label">Student</span>      <span class="r-value">${p.student || currentStudent}</span></div>
            <div class="r-row"><span class="r-label">Student ID</span>   <span class="r-value">${studentId}</span></div>
            <div class="r-row"><span class="r-label">Service</span>      <span class="r-value">${p.service}</span></div>
            <div class="r-row"><span class="r-label">Date</span>         <span class="r-value">${p.date || p.date_iso || p.dateISO || 'â€”'}</span></div>
            <div class="r-row"><span class="r-label">GCash Ref #</span>  <span class="r-value">${gcashRef}</span></div>
            <div class="r-row"><span class="r-label">Method</span>       <span class="r-value">${p.method}</span></div>
            <div class="r-row"><span class="r-label">Status</span>       <span class="r-value">${badgeHTML(p.status)}</span></div>
            <div class="r-row total"><span class="r-label">Total Amount</span><span class="r-value">â‚± ${Number(p.amount).toLocaleString()}</span></div>
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

    /* â”€â”€ Search / Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    document.getElementById('paySearch')?.addEventListener('input', e => {
        searchTerm = e.target.value.toLowerCase();
        render();
    });
    document.getElementById('statusFilter')?.addEventListener('change', e => {
        statusFilter = e.target.value;
        render();
    });

    /* â”€â”€ Sign out â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    document.querySelector('.btn-signout')?.addEventListener('click', () => {
        if (confirm('Sign out?')) window.location.href = '../../login/login.html';
    });

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       CERTIFICATES (sent by admin from Payments)
       GET /api/certificates -> { "<payment_id>": { url, name } }
    â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
    function cEsc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function cNo(id) { return 'RCP-' + String(id).padStart(4, '0'); }
    function cIsPdf(c) { return /\.pdf(\?|$)/i.test(c.name) || /\.pdf(\?|$)/i.test(c.url); }
    function cDate(p) {
        const raw = p.date_iso || p.dateISO || p.date || null;
        if (!raw) return '\u2014';
        const d = new Date(raw);
        return isNaN(d) ? raw : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    let certItems = [];

    function certPreview(p) {
        const c = p.certificate;
        if (cIsPdf(c)) {
            return '<button type="button" class="cert-preview cert-preview-pdf" data-view="' + p.id + '">' +
                '<strong>PDF</strong><span>' + cEsc(c.name) + '</span></button>';
        }
        return '<button type="button" class="cert-preview" data-view="' + p.id + '">' +
            '<img src="' + cEsc(c.url) + '" alt="Certificate" loading="lazy" /></button>';
    }

    function renderCertificates() {
        const grid = document.getElementById('certGrid');
        if (!grid) return;
        grid.setAttribute('aria-busy', 'false');

        if (certItems.length === 0) {
            grid.innerHTML = '<div class="cert-empty"><strong>No certificates yet</strong>' +
                '<div>Your certificate will appear here once the admin sends it.</div></div>';
            return;
        }

        grid.innerHTML = certItems.map((p, i) => `
            <div class="receipt-card" style="animation-delay:${i * 0.04}s">
                <div class="rc-header">
                    <span class="rc-no">${cNo(p.id)}</span>
                    <span class="badge badge-paid">Completed</span>
                </div>
                <div class="rc-service">${cEsc(p.service)}</div>
                ${certPreview(p)}
                <div class="rc-meta">
                    <span>GCash: ${cEsc(p.gcash_ref || p.gcashRef || '\u2014')}</span>
                    <span>${cDate(p)}</span>
                </div>
                <div class="rc-meta"><span>Ref: ${cEsc(p.ref || '\u2014')} \u00B7 ${cEsc(p.method || 'GCash')}</span></div>
                <div class="rc-actions">
                    <button class="btn-receipt" data-view="${p.id}">View</button>
                    <button class="btn-receipt" data-dl="${p.id}">Download</button>
                </div>
            </div>
        `).join('');
    }

    async function downloadCert(id) {
        const p = certItems.find(x => x.id === id);
        if (!p) return;
        try {
            const res = await fetch(p.certificate.url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = p.certificate.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } catch (e) {
            window.open(p.certificate.url, '_blank', 'noopener');
        }
    }

    function viewCert(id) {
        const p = certItems.find(x => x.id === id);
        if (!p) return;
        const c = p.certificate;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay cert-viewer-overlay';
        overlay.innerHTML = `
            <div class="cert-viewer" role="dialog" aria-modal="true" aria-label="Certificate">
                <div class="cert-viewer-head">
                    <div>
                        <h3>Certificate</h3>
                        <p>${cEsc(p.service)} \u00B7 ${cNo(p.id)}</p>
                    </div>
                    <button class="modal-close" data-close="1" aria-label="Close">\u2715</button>
                </div>
                <div class="cert-viewer-media">
                    ${cIsPdf(c)
                ? '<iframe src="' + cEsc(c.url) + '" title="Certificate"></iframe>'
                : '<img src="' + cEsc(c.url) + '" alt="Certificate" />'}
                </div>
                <div class="cert-viewer-actions">
                    <button class="btn-ghost" data-close="1">Close</button>
                    <button class="btn-print" data-download="1">Download</button>
                </div>
            </div>`;

        const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
        const onKey = e => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', e => {
            if (e.target === overlay || e.target.closest('[data-close]')) close();
            else if (e.target.closest('[data-download]')) downloadCert(id);
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
    }

    document.getElementById('certGrid')?.addEventListener('click', e => {
        const v = e.target.closest('[data-view]');
        if (v) { viewCert(Number(v.getAttribute('data-view'))); return; }
        const d = e.target.closest('[data-dl]');
        if (d) downloadCert(Number(d.getAttribute('data-dl')));
    });

    async function loadCertificates() {
        try {
            const list = (await getPayments()).filter(p => p.status === 'Paid');
            let map = {};
            try { map = await apiFetch('/certificates'); } catch (e) { console.warn('Certificates unavailable:', e); }
            list.forEach(p => { p.certificate = (map && map[p.id]) || null; });
            certItems = list.filter(p => p.certificate && p.certificate.url);
        } catch (err) {
            console.error('Failed to load certificates:', err);
            certItems = [];
        }
        renderCertificates();
    }

    loadCertificates();

    /* â”€â”€ Init: load from API then render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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