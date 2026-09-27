/* ══════════════════════════════════════════════════
   AIDEA Admin — Receipts.js
   Fetches all payments from GET /api/payments,
   filters to status === 'Paid', and renders them
   as receipt cards (same API helper as payment.js).
══════════════════════════════════════════════════ */

const API_BASE = 'http://127.0.0.1:8000/api';

/* ── API Helper (mirrors payment.js) ────────────── */
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

/* ── State ───────────────────────────────────────── */
let allReceipts = [];   // only Paid payments
let filtered = [];
let searchTerm = '';

/* ── Generate a receipt number from payment id ───── */
function toReceiptNo(id) {
  return 'RCP-' + String(id).padStart(4, '0');
}

/* ── Format date ─────────────────────────────────── */
function formatDate(p) {
  const raw = p.date_iso || p.date || null;
  if (!raw) return '—';
  const d = new Date(raw);
  return isNaN(d) ? raw : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Toast (same style as payment.js) ───────────── */
function showToast(msg, type = 'success') {
  const colors = { success: '#22c55e', error: '#ef4444' };
  let t = document.getElementById('rcpToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'rcpToast';
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

/* ── Print a single receipt ──────────────────────── */
function printReceipt(id) {
  const p = allReceipts.find(r => r.id === id);
  if (!p) return;

  const proofSrc = p.proof_image || p.proofImage || null;
  const studentId = p.student_id || p.studentId || '—';
  const gcashRef = p.gcash_ref || p.gcashRef || '—';

  const win = window.open('', '_blank', 'width=520,height=700');
  win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8"/>
            <title>Receipt — ${toReceiptNo(p.id)}</title>
            <style>
                body   { font-family: Arial, sans-serif; padding: 32px; color: #1a1d2e; max-width: 480px; margin: auto; }
                h2     { text-align: center; font-size: 1.2rem; margin-bottom: 4px; }
                p.sub  { text-align: center; color: #6b7280; font-size: .82rem; margin: 0 0 24px; }
                hr     { border: none; border-top: 1.5px dashed #e5e7eb; margin: 18px 0; }
                .row   { display: flex; justify-content: space-between; padding: 6px 0; font-size: .88rem; border-bottom: 1px solid #f3f4f6; }
                .lbl   { color: #6b7280; font-weight: 600; }
                .val   { font-weight: 500; text-align: right; }
                .amt   { font-size: 1.25rem; font-weight: 800; color: #16a34a; }
                .badge { background: #dcfce7; color: #15803d; border-radius: 20px; padding: 2px 12px; font-size: .78rem; font-weight: 700; }
                img    { width: 100%; max-height: 220px; object-fit: contain; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 12px; }
                .footer{ text-align: center; font-size: .75rem; color: #9ca3af; margin-top: 24px; }
            </style>
        </head>
        <body>
            <h2>🧾 Official Receipt</h2>
            <p class="sub">Norzagaray College — AIDEA</p>
            <div class="row"><span class="lbl">Receipt No.</span><span class="val">${toReceiptNo(p.id)}</span></div>
            <div class="row"><span class="lbl">Ref No.</span><span class="val">${p.ref || '—'}</span></div>
            <div class="row"><span class="lbl">Student</span><span class="val">${p.student} (${studentId})</span></div>
            <div class="row"><span class="lbl">Service</span><span class="val">${p.service}</span></div>
            <div class="row"><span class="lbl">GCash Ref</span><span class="val">${gcashRef}</span></div>
            <div class="row"><span class="lbl">Method</span><span class="val">${p.method || 'GCash'}</span></div>
            <div class="row"><span class="lbl">Date</span><span class="val">${formatDate(p)}</span></div>
            <hr/>
            <div class="row"><span class="lbl">Amount Paid</span><span class="val amt">₱ ${Number(p.amount).toLocaleString()}</span></div>
            <div class="row"><span class="lbl">Status</span><span class="val"><span class="badge">Completed</span></span></div>
            ${proofSrc ? `<img src="${proofSrc}" alt="Payment Proof"/>` : ''}
            <p class="footer">Thank you! This serves as your official receipt.<br/>Printed: ${new Date().toLocaleString('en-PH')}</p>
            <script>window.onload = () => { window.print(); }<\/script>
        </body>
        </html>
    `);
  win.document.close();
}

/* ── Download receipt as HTML file ──────────────── */
function downloadReceipt(id) {
  const p = allReceipts.find(r => r.id === id);
  if (!p) return;

  const proofSrc = p.proof_image || p.proofImage || null;
  const studentId = p.student_id || p.studentId || '—';
  const gcashRef = p.gcash_ref || p.gcashRef || '—';

  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"/>
    <title>Receipt — ${toReceiptNo(p.id)}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #1a1d2e; max-width: 480px; margin: auto; }
        h2   { text-align: center; font-size: 1.2rem; margin-bottom: 4px; }
        p.sub{ text-align: center; color: #6b7280; font-size: .82rem; margin: 0 0 24px; }
        hr   { border: none; border-top: 1.5px dashed #e5e7eb; margin: 18px 0; }
        .row { display:flex; justify-content:space-between; padding:6px 0; font-size:.88rem; border-bottom:1px solid #f3f4f6; }
        .lbl { color:#6b7280; font-weight:600; }
        .val { font-weight:500; text-align:right; }
        .amt { font-size:1.25rem; font-weight:800; color:#16a34a; }
        .badge { background:#dcfce7; color:#15803d; border-radius:20px; padding:2px 12px; font-size:.78rem; font-weight:700; }
        img  { width:100%; max-height:220px; object-fit:contain; border-radius:8px; border:1px solid #e5e7eb; margin-top:12px; }
        .footer { text-align:center; font-size:.75rem; color:#9ca3af; margin-top:24px; }
    </style>
</head>
<body>
    <h2>🧾 Official Receipt</h2>
    <p class="sub">Norzagaray College — AIDEA</p>
    <div class="row"><span class="lbl">Receipt No.</span><span class="val">${toReceiptNo(p.id)}</span></div>
    <div class="row"><span class="lbl">Ref No.</span><span class="val">${p.ref || '—'}</span></div>
    <div class="row"><span class="lbl">Student</span><span class="val">${p.student} (${studentId})</span></div>
    <div class="row"><span class="lbl">Service</span><span class="val">${p.service}</span></div>
    <div class="row"><span class="lbl">GCash Ref</span><span class="val">${gcashRef}</span></div>
    <div class="row"><span class="lbl">Method</span><span class="val">${p.method || 'GCash'}</span></div>
    <div class="row"><span class="lbl">Date</span><span class="val">${formatDate(p)}</span></div>
    <hr/>
    <div class="row"><span class="lbl">Amount Paid</span><span class="val amt">₱ ${Number(p.amount).toLocaleString()}</span></div>
    <div class="row"><span class="lbl">Status</span><span class="val"><span class="badge">Completed</span></span></div>
    ${proofSrc ? `<img src="${proofSrc}" alt="Payment Proof"/>` : ''}
    <p class="footer">Thank you! This serves as your official receipt.</p>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${toReceiptNo(p.id)}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Render receipt cards ────────────────────────── */
function render() {
  const grid = document.getElementById('receiptsGrid');
  const q = searchTerm.toLowerCase();

  filtered = allReceipts.filter(p => {
    const rcpNo = toReceiptNo(p.id).toLowerCase();
    const gcashRef = (p.gcash_ref || p.gcashRef || '').toLowerCase();
    return !q
      || p.student.toLowerCase().includes(q)
      || rcpNo.includes(q)
      || gcashRef.includes(q)
      || (p.ref || '').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#9ca3af;">
                <div style="font-size:2rem;margin-bottom:.5rem;">🧾</div>
                <div style="font-weight:600;">No receipts found</div>
                <div style="font-size:.85rem;margin-top:.25rem;">Approved payments will appear here.</div>
            </div>`;
    return;
  }

  grid.innerHTML = filtered.map((p, i) => `
        <div class="receipt-card" style="animation-delay:${i * 0.05}s">
            <div class="receipt-header">
                <span class="receipt-no">${toReceiptNo(p.id)}</span>
                <span class="badge badge-success">Completed</span>
            </div>
            <div class="receipt-student">${p.student}</div>
            <div class="receipt-service">${p.service}</div>
            <div class="receipt-amount">₱ ${Number(p.amount).toLocaleString()}</div>
            <div class="receipt-meta">
                <span>GCash: ${p.gcash_ref || p.gcashRef || '—'}</span>
                <span>${formatDate(p)}</span>
            </div>
            <div class="receipt-meta" style="margin-top:.25rem;font-size:.75rem;color:#8b90a7;">
                Ref: ${p.ref || '—'} &nbsp;|&nbsp; ${p.method || 'GCash'}
            </div>
            <div class="receipt-actions">
                <button class="btn-dl" onclick="printReceipt(${p.id})">🖨️ Print</button>
                <button class="btn-dl" onclick="downloadReceipt(${p.id})">📥 Download</button>
            </div>
        </div>
    `).join('');
}

/* ── Load from API, keep only Paid ──────────────── */
async function loadReceipts() {
  try {
    const payments = await apiFetch('/payments');
    // Only show payments the admin has approved (status === 'Paid')
    allReceipts = payments.filter(p => p.status === 'Paid');
    render();
  } catch (err) {
    console.error('Failed to load receipts:', err);
    showToast('❌ Failed to load receipts.', 'error');
    document.getElementById('receiptsGrid').innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#ef4444;">
                Could not connect to the server. Make sure Laravel is running.
            </div>`;
  }
}

/* ── DOM Ready ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadReceipts();

  document.getElementById('searchInput')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    render();
  });

  document.getElementById('homeBtn')?.addEventListener('click', () =>
    location.href = '../dashboard/dashboard.html'
  );

  document.getElementById('signOutBtn')?.addEventListener('click', () => {
    if (confirm('Sign out?')) window.location.href = '../../login/login.html';
  });
});