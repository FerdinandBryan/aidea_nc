/* ══════════════════════════════════════════════════
   avail-services.js
   Loads active services from the API and handles
   GCash payment submission — proof image + record
   are saved to the database (not localStorage).
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
   LOAD & RENDER SERVICES (from Admin API)
══════════════════════════════════════════════════ */
let allServices = [];

async function loadAndRenderServices() {
    const grid = document.getElementById('availServicesGrid');
    grid.innerHTML = '<div style="color:#9ca3af;font-size:.85rem;padding:2rem;">Loading services…</div>';

    try {
        allServices = await apiFetch('/services');
        const active = allServices.filter(s => s.active);

        if (!active.length) {
            grid.innerHTML = '<p style="color:#9ca3af;font-size:.85rem;padding:2rem;">No services available right now.</p>';
            return;
        }

        grid.innerHTML = active.map((s, i) => `
            <div class="svc-card" style="animation-delay:${i * 0.07}s">
                <div class="svc-card-icon">${s.icon && s.icon !== 'undefined' ? s.icon : '🛠️'}</div>
                <div class="svc-card-name">${s.name}</div>
                <p class="svc-card-desc">${s.description || ''}</p>
                <div class="svc-card-price">₱ ${Number(s.price).toLocaleString()} <span>/ session</span></div>
                <button class="btn-avail" onclick="openGcashModal(${s.id})">💚 Pay via GCash</button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load services:', err);
        grid.innerHTML = '<p style="color:#dc2626;font-size:.85rem;padding:2rem;">⚠ Failed to load services. Please try again later.</p>';
    }
}

/* ══════════════════════════════════════════════════
   GCASH MODAL STATE
══════════════════════════════════════════════════ */
let currentService = null;

function openGcashModal(id) {
    currentService = allServices.find(s => s.id === id);
    if (!currentService) return;

    document.getElementById('gmServiceLabel').textContent = currentService.name;
    document.getElementById('gmSvcName').textContent = currentService.name;
    document.getElementById('gmSvcAmount').textContent = '₱ ' + Number(currentService.price).toLocaleString();

    const qrImg = document.getElementById('gmQRImg');
    const qrPlch = document.getElementById('gmQRPlaceholder');
    if (currentService.gcash_qr) {
        qrImg.src = currentService.gcash_qr;
        qrImg.style.display = 'block';
        qrPlch.style.display = 'none';
    } else {
        qrImg.style.display = 'none';
        qrPlch.style.display = 'flex';
    }

    document.getElementById('gmNumText').textContent = currentService.gcash_number || '—';

    goToStep1();
    document.getElementById('gcashModalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeGcashModal() {
    document.getElementById('gcashModalOverlay').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('gmProofInput').value = '';
    const preview = document.getElementById('gmProofPreview');
    preview.style.display = 'none';
    document.getElementById('gmUploadPrompt').style.display = 'block';
    document.getElementById('gmRefInput').value = '';
}

/* ── Step navigation ─────────────────────────────── */
function goToStep1() {
    document.getElementById('gmBodyStep1').style.display = 'block';
    document.getElementById('gmBodyStep2').style.display = 'none';
    document.getElementById('gmBodyStep3').style.display = 'none';
    document.getElementById('gmStep1Tab').className = 'gm-step active';
    document.getElementById('gmStep2Tab').className = 'gm-step';
    document.getElementById('gmStep3Tab').className = 'gm-step';
}

function goToStep2() {
    document.getElementById('gmBodyStep1').style.display = 'none';
    document.getElementById('gmBodyStep2').style.display = 'block';
    document.getElementById('gmBodyStep3').style.display = 'none';
    document.getElementById('gmStep1Tab').className = 'gm-step done';
    document.getElementById('gmStep2Tab').className = 'gm-step active';
    document.getElementById('gmStep3Tab').className = 'gm-step';
}

function goToStep3() {
    document.getElementById('gmBodyStep1').style.display = 'none';
    document.getElementById('gmBodyStep2').style.display = 'none';
    document.getElementById('gmBodyStep3').style.display = 'block';
    document.getElementById('gmStep1Tab').className = 'gm-step done';
    document.getElementById('gmStep2Tab').className = 'gm-step done';
    document.getElementById('gmStep3Tab').className = 'gm-step active';
}

/* ── Copy GCash number ───────────────────────────── */
function copyGcashNum() {
    const num = document.getElementById('gmNumText').textContent;
    if (num === '—') return;
    navigator.clipboard?.writeText(num).then(() => {
        document.getElementById('gmCopyHint').textContent = '✅ Copied!';
        setTimeout(() => document.getElementById('gmCopyHint').textContent = 'Tap number to copy', 2000);
    });
}

/* ══════════════════════════════════════════════════
   SUBMIT PAYMENT
   Converts proof image to base64 and POSTs the full
   payment record to POST /api/payments.
   The backend stores it (status = 'Pending') and
   admin can Approve → Paid  or  Reject.
══════════════════════════════════════════════════ */
async function submitPayment() {
    const proofFile = document.getElementById('gmProofInput').files[0];
    const ref = document.getElementById('gmRefInput').value.trim();

    if (!proofFile) return showToast('Please upload your GCash payment screenshot.', 'error');
    if (!ref) return showToast('Please enter the GCash reference number.', 'error');
    if (ref.length < 6) return showToast('Reference number looks too short.', 'error');

    const submitBtn = document.querySelector('#gmBodyStep2 .gm-btn-next');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
        /* ── Convert proof image to base64 ── */
        const proofB64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(proofFile);
        });

        /* ── Build the payment record ── */
        const now = new Date();
        const user = JSON.parse(localStorage.getItem('aidea_user') || '{}');
        const studentName = user.full_name || user.name || 'Unknown';
        const studentId = user.student_number || user.student_id || '';

        const payload = {
            gcash_ref: ref,
            service: currentService.name,
            service_id: currentService.id,
            student: studentName,
            student_id: studentId,
            date: now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
            date_iso: now.toISOString().split('T')[0],
            amount: currentService.price,
            method: 'GCash',
            status: 'Pending',   // admin must Approve → Paid, or Reject
            proof_image: proofB64,    // base64 stored so admin can view it
        };

        /* ── POST to API ── */
        const created = await apiFetch('/payments', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        console.log('Payment saved to DB:', created);
        showToast('Payment proof submitted!', 'success');
        goToStep3();

    } catch (err) {
        console.error('Payment submission failed:', err);
        showToast('Submission failed: ' + (err.message || JSON.stringify(err)), 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Payment 📨';
    }
}

/* ── Proof image upload preview ──────────────────── */
function initUploadZone() {
    const input = document.getElementById('gmProofInput');
    const preview = document.getElementById('gmProofPreview');
    const prompt = document.getElementById('gmUploadPrompt');
    const zone = document.getElementById('gmUploadZone');

    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            preview.src = e.target.result;
            preview.style.display = 'block';
            prompt.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }
    });
}

/* ── Toast ───────────────────────────────────────── */
function showToast(msg, type = 'success') {
    const t = document.getElementById('payToast');
    t.textContent = msg;
    t.className = 'pay-toast show ' + type;
    setTimeout(() => t.className = 'pay-toast', 3500);
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    loadAndRenderServices();
    initUploadZone();

    document.getElementById('gmClose').addEventListener('click', closeGcashModal);
    document.getElementById('gmCancelBtn').addEventListener('click', closeGcashModal);
    document.getElementById('gcashModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeGcashModal();
    });
    document.getElementById('signoutBtn')?.addEventListener('click', () => {
        if (confirm('Sign out?')) window.location.href = '../../login/login.html';
    });
});