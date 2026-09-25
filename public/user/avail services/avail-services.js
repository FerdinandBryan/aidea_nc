/* ══════════════════════════════════════════════════
   avail-services.js
   Loads active services from the API and handles
   GCash payment submission — proof image + record
   are saved to the database (not localStorage).

   If a service has requires_research_info = true, the
   Research Info step is built ENTIRELY from whatever
   items the admin configured for that service in
   Services & Pricing (research_requirement_text, a
   JSON array of { text, type } where type is
   'text' | 'file' | 'image'). Nothing about the
   questions themselves is hardcoded here — add,
   remove, or retype an item in the admin panel and
   the student form reflects it immediately.
══════════════════════════════════════════════════ */

const API_BASE = 'http://127.0.0.1:8000/api';

/* ── Upload rules per dynamic item type ──────────── */
const MAX_FILE_MB = 20;   // 'file' items (PDF/DOC/DOCX)
const MAX_IMAGE_MB = 5;    // 'image' items (photos)
const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_FILE_EXT = ['.pdf', '.doc', '.docx'];

// Same meta the admin panel uses, kept in sync so icons/labels match.
const ITEM_TYPE_META = {
    text: { icon: '📝', label: 'Text' },
    file: { icon: '📎', label: 'File' },
    image: { icon: '🖼️', label: 'Image' },
};

let currentResearchItems = [];   // [{ text, type }] for the open service
let researchFieldValues = {};    // idx -> string (text) | { base64, name, size, type } (file/image)
let researchInfoData = null;     // validated payload, set once Continue is clicked

/* ══════════════════════════════════════════════════
   SESSION / USER IDENTITY
══════════════════════════════════════════════════ */
function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function renderUserIdentity() {
    const user = getUser();
    if (!user) return;

    const fullName = user.full_name || user.name || 'Student';
    const course = user.course || 'Student';

    const parts = fullName.trim().split(' ');
    const initials = parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2);

    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-info h4');
    const roleEl = document.querySelector('.user-info p');

    if (avatarEl) avatarEl.textContent = initials.toUpperCase();
    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) roleEl.textContent = course;
}

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

/* ── Reads the admin-configured item list off a service.
   Accepts the current { text, type } format as well as
   legacy plain-string / newline data, same as the admin
   panel, so nothing breaks for older services. ── */
function parseResearchItems(raw) {
    if (!raw) return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return raw.split('\n').map(s => s.trim()).filter(Boolean)
            .map(text => ({ text, type: 'text' }));
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map(item => {
            if (typeof item === 'string') return { text: item, type: 'text' };
            if (item && typeof item === 'object') {
                return {
                    text: item.text || '',
                    type: ITEM_TYPE_META[item.type] ? item.type : 'text',
                };
            }
            return null;
        })
        .filter(item => item && item.text);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
                ${s.requires_research_info ? `<span class="svc-research-badge">📄 Requires research info</span>` : ''}
                <div class="svc-card-price">₱ ${Number(s.price).toLocaleString()} <span>/ session</span></div>
                <button class="btn-avail" onclick="openGcashModal(${s.id})">Pay via GCash</button>
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

    // Pull this service's requirement items straight from the admin config
    // and build the Research Info step from them.
    currentResearchItems = currentService.requires_research_info
        ? parseResearchItems(currentService.research_requirement_text)
        : [];
    resetResearchForm();
    updateStepTabs();
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
    resetResearchForm();
}

/* ── Step tabs: show/hide + relabel the Research Info tab ── */
function updateStepTabs() {
    const requiresResearch = !!(currentService && currentService.requires_research_info);
    const researchTab = document.getElementById('gmStepResearchTab');
    researchTab.style.display = requiresResearch ? 'block' : 'none';

    const visibleTabs = [
        document.getElementById('gmStep1Tab'),
        ...(requiresResearch ? [researchTab] : []),
        document.getElementById('gmStep2Tab'),
        document.getElementById('gmStep3Tab'),
    ];
    visibleTabs.forEach((tab, i) => {
        tab.textContent = `${i + 1} · ${tab.dataset.stepName}`;
    });
}

/* ── Step navigation ─────────────────────────────── */
function hideAllStepBodies() {
    document.getElementById('gmBodyStep1').style.display = 'none';
    document.getElementById('gmBodyResearch').style.display = 'none';
    document.getElementById('gmBodyStep2').style.display = 'none';
    document.getElementById('gmBodyStep3').style.display = 'none';
}

function setTabState(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'gm-step' + (state ? ' ' + state : '');
}

function goToStep1() {
    hideAllStepBodies();
    document.getElementById('gmBodyStep1').style.display = 'block';
    setTabState('gmStep1Tab', 'active');
    setTabState('gmStepResearchTab', '');
    setTabState('gmStep2Tab', '');
    setTabState('gmStep3Tab', '');
}

function goToStepResearch() {
    hideAllStepBodies();
    document.getElementById('gmBodyResearch').style.display = 'block';
    setTabState('gmStep1Tab', 'done');
    setTabState('gmStepResearchTab', 'active');
    setTabState('gmStep2Tab', '');
    setTabState('gmStep3Tab', '');
}

function goToStep2() {
    hideAllStepBodies();
    document.getElementById('gmBodyStep2').style.display = 'block';
    setTabState('gmStep1Tab', 'done');
    if (currentService?.requires_research_info) setTabState('gmStepResearchTab', 'done');
    setTabState('gmStep2Tab', 'active');
    setTabState('gmStep3Tab', '');
}

function goToStep3() {
    hideAllStepBodies();
    document.getElementById('gmBodyStep3').style.display = 'block';
    setTabState('gmStep1Tab', 'done');
    if (currentService?.requires_research_info) setTabState('gmStepResearchTab', 'done');
    setTabState('gmStep2Tab', 'done');
    setTabState('gmStep3Tab', 'active');
}

/* From Step 1, go to Research Info if required, else straight to Upload Proof */
function proceedFromStep1() {
    if (currentService?.requires_research_info) {
        goToStepResearch();
    } else {
        goToStep2();
    }
}

/* Back button on Upload Proof returns to Research Info if it was required */
function goBackFromProof() {
    if (currentService?.requires_research_info) {
        goToStepResearch();
    } else {
        goToStep1();
    }
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
   RESEARCH INFO STEP — fully dynamic, driven by
   currentResearchItems (admin-configured per service)
══════════════════════════════════════════════════ */
function resetResearchForm() {
    researchFieldValues = {};
    researchInfoData = null;
    renderResearchFields(currentResearchItems);
}

function renderResearchFields(items) {
    const wrap = document.getElementById('riDynamicFieldsWrap');
    if (!wrap) return;

    if (!items.length) {
        wrap.innerHTML = '<p style="font-size:.82rem;color:#9ca3af;">No additional details required for this service.</p>';
        return;
    }

    wrap.innerHTML = items.map((item, i) => {
        if (item.type === 'file' || item.type === 'image') {
            const isImage = item.type === 'image';
            const hint = isImage ? `PNG or JPG — max ${MAX_IMAGE_MB} MB` : `PDF, DOC, or DOCX — max ${MAX_FILE_MB} MB`;
            const upIcon = isImage ? '🖼️' : '📄';
            return `
                <div class="form-group">
                    <label>${escapeHtml(item.text)} <span style="color:#ef4444;">*</span></label>
                    <div class="gm-upload-zone ri-dyn-upload" data-idx="${i}">
                        <div class="up-icon">${upIcon}</div>
                        <div class="ri-dyn-prompt">
                            <p><strong>Click to upload</strong> or drag and drop</p>
                            <p>${hint}</p>
                        </div>
                        <div class="gm-file-name ri-dyn-filename" style="display:none;"></div>
                    </div>
                    <input type="file" class="ri-dyn-file-input" data-idx="${i}"
                        accept="${isImage ? 'image/*' : '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}"
                        style="display:none;" />
                    <div class="gm-file-status ri-dyn-status" data-idx="${i}"></div>
                </div>`;
        }

        // default: text
        return `
            <div class="form-group">
                <label>${escapeHtml(item.text)} <span style="color:#ef4444;">*</span></label>
                <input type="text" class="ri-dyn-input" data-idx="${i}" placeholder="Enter ${escapeHtml(item.text)}" />
            </div>`;
    }).join('');

    // Wire up file/image upload zones
    wrap.querySelectorAll('.ri-dyn-upload').forEach(zone => {
        const idx = zone.dataset.idx;
        const input = wrap.querySelector(`.ri-dyn-file-input[data-idx="${idx}"]`);
        if (!input) return;

        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleDynamicFile(idx, file, items[idx].type);
        });

        input.addEventListener('change', () => {
            const file = input.files[0];
            if (file) handleDynamicFile(idx, file, items[idx].type);
        });
    });

    // Wire up text inputs (keep value in sync as the student types)
    wrap.querySelectorAll('.ri-dyn-input').forEach(input => {
        input.addEventListener('input', () => {
            researchFieldValues[input.dataset.idx] = input.value;
        });
    });
}

/* ── Validate + read a file/image item's upload ──── */
async function handleDynamicFile(idx, file, type) {
    const wrap = document.getElementById('riDynamicFieldsWrap');
    const zone = wrap.querySelector(`.ri-dyn-upload[data-idx="${idx}"]`);
    const prompt = zone?.querySelector('.ri-dyn-prompt');
    const nameEl = zone?.querySelector('.ri-dyn-filename');
    const statusEl = wrap.querySelector(`.ri-dyn-status[data-idx="${idx}"]`);
    if (!zone || !statusEl) return;

    const isImage = type === 'image';

    if (isImage) {
        if (!file.type.startsWith('image/')) {
            statusEl.textContent = '❌ Only image files (PNG, JPG, etc.) are accepted.';
            statusEl.style.color = '#ef4444';
            delete researchFieldValues[idx];
            return;
        }
    } else {
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        const typeOk = ALLOWED_FILE_TYPES.includes(file.type) || ALLOWED_FILE_EXT.includes(ext);
        if (!typeOk) {
            statusEl.textContent = '❌ Only PDF, DOC, or DOCX files are accepted.';
            statusEl.style.color = '#ef4444';
            delete researchFieldValues[idx];
            return;
        }
    }

    const maxMb = isImage ? MAX_IMAGE_MB : MAX_FILE_MB;
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > maxMb) {
        statusEl.textContent = `❌ File is ${sizeMb.toFixed(1)} MB — the maximum allowed is ${maxMb} MB.`;
        statusEl.style.color = '#ef4444';
        delete researchFieldValues[idx];
        return;
    }

    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(file);
        });

        researchFieldValues[idx] = { base64, name: file.name, size: file.size, type: file.type };

        if (prompt) prompt.style.display = 'none';
        if (nameEl) {
            nameEl.style.display = 'block';
            nameEl.textContent = `${isImage ? '🖼️' : '📄'} ${file.name} (${sizeMb.toFixed(1)} MB)`;
        }
        statusEl.textContent = '✅ Ready to submit.';
        statusEl.style.color = '#00aa5a';
    } catch (err) {
        console.error('Dynamic file read failed:', err);
        delete researchFieldValues[idx];
        statusEl.textContent = '❌ Failed to read file. Please try again.';
        statusEl.style.color = '#ef4444';
    }
}

/* ── Validate every dynamic item is filled, then move on ── */
function proceedFromResearch() {
    for (let i = 0; i < currentResearchItems.length; i++) {
        const item = currentResearchItems[i];
        const val = researchFieldValues[i];

        if (item.type === 'text') {
            if (!val || !String(val).trim()) {
                return showToast(`Please fill in "${item.text}".`, 'error');
            }
        } else {
            if (!val || !val.base64) {
                return showToast(`Please upload "${item.text}".`, 'error');
            }
        }
    }

    // Build the structured payload straight from the admin's item config
    // plus what the student entered/uploaded — no fixed field names.
    researchInfoData = currentResearchItems.map((item, i) => {
        const val = researchFieldValues[i];
        if (item.type === 'text') {
            return { label: item.text, type: 'text', value: val };
        }
        return {
            label: item.text,
            type: item.type,
            file_name: val?.name || null,
            file_base64: val?.base64 || null,
        };
    });

    goToStep2();
}

/* ══════════════════════════════════════════════════
   SUBMIT PAYMENT
   Converts proof image to base64 and POSTs the full
   payment record (plus the dynamic research items, if
   applicable) to POST /api/payments. The backend stores
   it (status = 'Pending') and admin can Approve → Paid
   or Reject.
══════════════════════════════════════════════════ */
async function submitPayment() {
    const proofFile = document.getElementById('gmProofInput').files[0];
    const ref = document.getElementById('gmRefInput').value.trim();

    if (!proofFile) return showToast('Please upload your GCash payment screenshot.', 'error');
    if (!ref) return showToast('Please enter the GCash reference number.', 'error');
    if (ref.length < 6) return showToast('Reference number looks too short.', 'error');

    if (currentService?.requires_research_info && !researchInfoData) {
        return showToast('Please complete the Research Info step first.', 'error');
    }

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
        const user = getUser() || {};
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

            /* Dynamic requirement items, exactly as configured by the admin
               for this service — text answers and/or uploaded files/images. */
            ...(currentService.requires_research_info && researchInfoData ? {
                research_items: researchInfoData,
            } : {}),
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
   SIDEBAR NAV GROUPS (MAIN / SERVICES / EVENTS)
   Click a group label to expand/collapse it.
══════════════════════════════════════════════════ */
function initNavGroups() {
    const toggles = document.querySelectorAll('.nav-group-toggle');

    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const group = toggle.closest('.nav-group');
            if (!group) return;
            group.classList.toggle('open');
        });
    });

    const activeGroup = document.querySelector('.nav-group .nav-item.active')?.closest('.nav-group');
    if (activeGroup) activeGroup.classList.add('open');
}

/* ══════════════════════════════════════════════════
   SIDEBAR FOOTER DROPDOWN (My Profile / Sign Out)
══════════════════════════════════════════════════ */
function initSidebarDropdown() {
    const sidebarUser = document.getElementById('sidebarUser');
    const dropdown = document.getElementById('userDropdown');
    const signOutBtn = document.getElementById('dropdownSignOutBtn');
    if (!sidebarUser || !dropdown) return;

    function closeDropdown() {
        sidebarUser.classList.remove('open');
    }

    sidebarUser.addEventListener('click', (e) => {
        if (dropdown.contains(e.target)) return;
        sidebarUser.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!sidebarUser.contains(e.target)) closeDropdown();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
    });

    if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDropdown();
            openSignOutModal();
        });
    }
}

/* ══════════════════════════════════════════════════
   SIGN OUT CONFIRMATION MODAL
══════════════════════════════════════════════════ */
function initSignOutModal() {
    const overlay = document.getElementById('signoutModalOverlay');
    const cancelBtn = document.getElementById('signoutCancelBtn');
    const confirmBtn = document.getElementById('signoutConfirmBtn');
    if (!overlay) return;

    cancelBtn?.addEventListener('click', closeSignOutModal);
    confirmBtn?.addEventListener('click', performSignOut);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSignOutModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            closeSignOutModal();
        }
    });
}

function openSignOutModal() {
    document.getElementById('signoutModalOverlay')?.classList.add('open');
}

function closeSignOutModal() {
    document.getElementById('signoutModalOverlay')?.classList.remove('open');
}

async function performSignOut() {
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                },
            });
        } catch {
            // ignore network errors — clear session locally regardless
        }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
    window.location.href = '../login/login.html';
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    renderUserIdentity();
    loadAndRenderServices();
    initUploadZone();
    initNavGroups();
    initSidebarDropdown();
    initSignOutModal();

    document.getElementById('gmClose').addEventListener('click', closeGcashModal);
    document.getElementById('gmCancelBtn').addEventListener('click', closeGcashModal);
    document.getElementById('gcashModalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeGcashModal();
    });
});