// avail-services.js — Student side
// Same shell behavior as dashboard.js (session, theme, drawer, profile menu,
// sign-out modal) plus the GCash payment flow. Proof image + payment record
// are saved to the database (not localStorage).
//
// If a service has requires_research_info = true, the Research Info step is
// built ENTIRELY from whatever items the admin configured for that service
// in Services & Pricing (research_requirement_text, a JSON array of
// { text, type, optional, options } where type is 'text' | 'file' | 'image' | 'checkbox').
//
// - optional: true  → label shows "(Optional)" and the student may leave it empty.
// - optional: false → label shows a red * and it's required.
// - checkbox        → student ticks one or more of item.options
//                     ({ label, subtitle }). Ticking a box that has a
//                     subtitle reveals a nested input for it.
//
// Nothing about the questions themselves is hardcoded here — add, remove, or
// retype an item in the admin panel and the student form reflects it immediately.

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme';

/* ── Upload rules per dynamic item type ──────────── */
const MAX_FILE_MB = 20;   // 'file' items (PDF/DOC/DOCX)
const MAX_IMAGE_MB = 5;    // 'image' items (photos)
const ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_FILE_EXT = ['.pdf', '.doc', '.docx'];

const ITEM_TYPE_META = {
    text: { icon: '📝', label: 'Text' },
    file: { icon: '📎', label: 'File' },
    image: { icon: '🖼️', label: 'Image' },
    checkbox: { icon: '☑️', label: 'Checkbox' },
};

let currentResearchItems = [];   // [{ text, type, optional, options }] for the open service
let researchFieldValues = {};    // idx -> string | { base64, name, size, type } | { [optIdx]: nestedAnswer }
let researchInfoData = null;     // validated payload, set once Continue is clicked

/* ══════════════════════════════════════════════════
   SESSION
══════════════════════════════════════════════════ */
const getToken = () => localStorage.getItem('auth_token') || null;

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function authHeaders(extra) {
    return { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/json', ...extra };
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: authHeaders({ 'Content-Type': 'application/json', ...options.headers }),
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

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderUserIdentity(user) {
    const fullName = user.full_name || user.name
        || [user.fname, user.lname].filter(Boolean).join(' ') || 'Student';
    const course = user.course || 'Student';
    const parts = fullName.trim().split(/\s+/);
    const initials = (parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2)).toUpperCase();

    const q = s => document.querySelector(s);
    if (q('.footer-avatar')) q('.footer-avatar').textContent = initials;
    if (q('.footer-name')) q('.footer-name').textContent = fullName;
    if (q('.footer-role')) q('.footer-role').textContent = course;
}

/* ══════════════════════════════════════════════════
   THEME (light / dark)
══════════════════════════════════════════════════ */
const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
    document.getElementById('themeBtn')
        ?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    document.querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
}

function initTheme() {
    applyTheme(currentTheme(), false);
    document.getElementById('themeBtn')?.addEventListener('click', () => {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', e => {
        let saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    });
}

/* ══════════════════════════════════════════════════
   MOBILE DRAWER
══════════════════════════════════════════════════ */
function initDrawer() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('scrim');
    const btn = document.getElementById('menuBtn');
    if (!sidebar || !scrim || !btn) return;

    const open = () => {
        sidebar.classList.add('open'); scrim.hidden = false;
        document.body.classList.add('no-scroll'); btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        sidebar.classList.remove('open'); scrim.hidden = true;
        document.body.classList.remove('no-scroll'); btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) close(); });
}

/* ══════════════════════════════════════════════════
   PROFILE MENU + SIGN-OUT MODAL
══════════════════════════════════════════════════ */
function initProfileMenu() {
    const btn = document.getElementById('profileBtn');
    const menu = document.getElementById('profileMenu');
    if (!btn || !menu) return;

    const setOpen = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };

    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
    });
}

function performSignOut() {
    if (getToken()) {
        fetch(`${API_BASE}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => { });
    }
    clearSession();
    window.location.href = LOGIN_URL;
}

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
            if (e.shiftKey && document.activeElement === cancel) { e.preventDefault(); confirmBtn.focus(); }
            else if (!e.shiftKey && document.activeElement === confirmBtn) { e.preventDefault(); cancel.focus(); }
        }
    });
}

/* ── Reads the admin-configured item list off a service. Accepts the current
   { text, type, optional, options } format as well as older { text, type }
   and legacy plain-string / newline data, so nothing breaks for older services. ── */
function normalizeOptions(opts) {
    if (!Array.isArray(opts)) return [];
    return opts
        .map(o => {
            if (typeof o === 'string') return { label: o, subtitle: '' };
            if (o && typeof o === 'object') return { label: String(o.label || ''), subtitle: String(o.subtitle || '') };
            return null;
        })
        .filter(o => o && o.label);
}

function parseResearchItems(raw) {
    if (!raw) return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return raw.split('\n').map(s => s.trim()).filter(Boolean)
            .map(text => ({ text, type: 'text', optional: false, options: [] }));
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map(item => {
            if (typeof item === 'string') {
                return { text: item, type: 'text', optional: false, options: [] };
            }
            if (item && typeof item === 'object') {
                const type = item.type === 'radio' ? 'checkbox' : item.type;   // legacy
                return {
                    text: item.text || '',
                    type: ITEM_TYPE_META[type] ? type : 'text',
                    optional: !!item.optional,
                    options: normalizeOptions(item.options),
                };
            }
            return null;
        })
        .filter(item => item && item.text);
}

/* Label shown above each field:
     optional → Email or Facebook (Optional)
     required → Email or Facebook *            */
function fieldLabelHtml(item) {
    const text = escapeHtml(item.text);
    return item.optional
        ? `${text} <span style="color:var(--muted);font-weight:600;">(Optional)</span>`
        : `${text} <span style="color:#ef4444;">*</span>`;
}

/* ══════════════════════════════════════════════════
   LOAD & RENDER SERVICES
══════════════════════════════════════════════════ */
let allServices = [];

async function loadAndRenderServices() {
    const grid = document.getElementById('availServicesGrid');
    if (!grid) return;
    grid.innerHTML = '<p class="svc-loading">Loading services…</p>';

    try {
        allServices = await apiFetch('/services');
        const active = allServices.filter(s => s.active);

        if (!active.length) {
            grid.innerHTML = '<p class="svc-empty">No services available right now.</p>';
            return;
        }

        grid.innerHTML = active.map((s, i) => `
            <div class="svc-card" style="animation-delay:${i * 0.06}s">
                <div class="svc-card-icon">${s.icon && s.icon !== 'undefined' ? escapeHtml(s.icon) : '🛠️'}</div>
                <div class="svc-card-name">${escapeHtml(s.name)}</div>
                <p class="svc-card-desc">${escapeHtml(s.description || '')}</p>
                ${s.requires_research_info ? `<span class="svc-research-badge">Requires research info</span>` : ''}
                <div class="svc-card-price">₱ ${Number(s.price).toLocaleString()} <span>/ session</span></div>
                <button class="btn-avail" type="button" onclick="openGcashModal(${Number(s.id)})">Pay via GCash</button>
            </div>
        `).join('');

    } catch (err) {
        console.error('Failed to load services:', err);
        grid.innerHTML = '<p class="svc-error">Couldn’t load services. Please try again later.</p>';
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

    currentResearchItems = currentService.requires_research_info
        ? parseResearchItems(currentService.research_requirement_text)
        : [];
    resetResearchForm();
    updateStepTabs();
    goToStep1();
    document.getElementById('gcashModalOverlay').hidden = false;
    document.body.classList.add('no-scroll');
}

function closeGcashModal() {
    document.getElementById('gcashModalOverlay').hidden = true;
    document.body.classList.remove('no-scroll');
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

function proceedFromStep1() {
    if (currentService?.requires_research_info) goToStepResearch();
    else goToStep2();
}

function goBackFromProof() {
    if (currentService?.requires_research_info) goToStepResearch();
    else goToStep1();
}

/* ── Copy GCash number ───────────────────────────── */
function copyGcashNum() {
    const num = document.getElementById('gmNumText').textContent;
    if (num === '—') return;
    navigator.clipboard?.writeText(num).then(() => {
        document.getElementById('gmCopyHint').textContent = 'Copied!';
        setTimeout(() => document.getElementById('gmCopyHint').textContent = 'Tap number to copy', 2000);
    });
}

/* ══════════════════════════════════════════════════
   RESEARCH INFO STEP — fully dynamic
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
        wrap.innerHTML = '<p style="font-size:.82rem;color:var(--muted);">No additional details required for this service.</p>';
        return;
    }

    wrap.innerHTML = items.map((item, i) => {

        if (item.type === 'file' || item.type === 'image') {
            const isImage = item.type === 'image';
            const hint = isImage ? `PNG or JPG — max ${MAX_IMAGE_MB} MB` : `PDF, DOC, or DOCX — max ${MAX_FILE_MB} MB`;
            const upIcon = isImage ? '🖼️' : '📄';
            return `
                <div class="form-group">
                    <label>${fieldLabelHtml(item)}</label>
                    <button type="button" class="gm-upload-zone ri-dyn-upload" data-idx="${i}">
                        <div class="up-icon">${upIcon}</div>
                        <div class="ri-dyn-prompt">
                            <p><strong>Click to upload</strong> or drag and drop</p>
                            <p>${hint}</p>
                        </div>
                        <div class="gm-file-name ri-dyn-filename" style="display:none;"></div>
                    </button>
                    <input type="file" class="ri-dyn-file-input" data-idx="${i}"
                        accept="${isImage ? 'image/*' : '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}"
                        style="display:none;" />
                    <div class="gm-file-status ri-dyn-status" data-idx="${i}"></div>
                </div>`;
        }

        if (item.type === 'checkbox') {
            const boxes = (item.options || []).map((opt, j) => `
                <div class="ri-cb-wrap">
                    <label class="gm-check-item">
                        <input type="checkbox" class="ri-dyn-cb" data-idx="${i}" data-opt="${j}" />
                        ${escapeHtml(opt.label)}
                    </label>
                    ${opt.subtitle ? `
                        <div class="ri-cb-sub" data-idx="${i}" data-opt="${j}"
                            style="display:none;margin:.45rem 0 .2rem .5rem;padding-left:.8rem;border-left:3px solid var(--primary);">
                            <label style="display:block;font-size:.74rem;font-weight:700;color:var(--muted);margin-bottom:.3rem;">
                                ${escapeHtml(opt.subtitle)}${item.optional ? '' : ' <span style="color:#ef4444;">*</span>'}
                            </label>
                            <input type="text" class="ri-dyn-cb-input" data-idx="${i}" data-opt="${j}"
                                placeholder="Enter ${escapeHtml(opt.subtitle)}" />
                        </div>` : ''}
                </div>`).join('');
            return `
                <div class="form-group">
                    <label>${fieldLabelHtml(item)}</label>
                    <div style="display:flex;flex-direction:column;gap:.5rem;">
                        ${boxes || '<span style="font-size:.8rem;color:var(--muted);">No choices set.</span>'}
                    </div>
                </div>`;
        }

        return `
            <div class="form-group">
                <label>${fieldLabelHtml(item)}</label>
                <input type="text" class="ri-dyn-input" data-idx="${i}" placeholder="Enter ${escapeHtml(item.text)}" />
            </div>`;
    }).join('');

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

    wrap.querySelectorAll('.ri-dyn-input').forEach(input => {
        input.addEventListener('input', () => {
            researchFieldValues[input.dataset.idx] = input.value;
        });
    });

    wrap.querySelectorAll('.ri-dyn-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = cb.dataset.idx, opt = cb.dataset.opt;
            const sub = wrap.querySelector(`.ri-cb-sub[data-idx="${idx}"][data-opt="${opt}"]`);
            const subInput = sub?.querySelector('input');

            if (cb.checked) {
                researchFieldValues[idx] = researchFieldValues[idx] || {};
                researchFieldValues[idx][opt] = subInput ? subInput.value : '';
                if (sub) { sub.style.display = 'block'; subInput?.focus(); }
            } else {
                if (researchFieldValues[idx]) delete researchFieldValues[idx][opt];
                if (sub) { sub.style.display = 'none'; if (subInput) subInput.value = ''; }
            }
        });
    });
    wrap.querySelectorAll('.ri-dyn-cb-input').forEach(input => {
        input.addEventListener('input', () => {
            const idx = input.dataset.idx, opt = input.dataset.opt;
            researchFieldValues[idx] = researchFieldValues[idx] || {};
            researchFieldValues[idx][opt] = input.value;
        });
    });
}

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
            statusEl.textContent = 'Only image files (PNG, JPG, etc.) are accepted.';
            statusEl.style.color = '#ef4444';
            delete researchFieldValues[idx];
            return;
        }
    } else {
        const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
        const typeOk = ALLOWED_FILE_TYPES.includes(file.type) || ALLOWED_FILE_EXT.includes(ext);
        if (!typeOk) {
            statusEl.textContent = 'Only PDF, DOC, or DOCX files are accepted.';
            statusEl.style.color = '#ef4444';
            delete researchFieldValues[idx];
            return;
        }
    }

    const maxMb = isImage ? MAX_IMAGE_MB : MAX_FILE_MB;
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > maxMb) {
        statusEl.textContent = `File is ${sizeMb.toFixed(1)} MB — the maximum allowed is ${maxMb} MB.`;
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
            nameEl.textContent = `${file.name} (${sizeMb.toFixed(1)} MB)`;
        }
        statusEl.textContent = 'Ready to submit.';
        statusEl.style.color = 'var(--ok-fg)';
    } catch (err) {
        console.error('Dynamic file read failed:', err);
        delete researchFieldValues[idx];
        statusEl.textContent = 'Failed to read file. Please try again.';
        statusEl.style.color = '#ef4444';
    }
}

function proceedFromResearch() {
    for (let i = 0; i < currentResearchItems.length; i++) {
        const item = currentResearchItems[i];
        const val = researchFieldValues[i];

        if (item.optional) continue;

        if (item.type === 'text') {
            if (!val || !String(val).trim()) {
                return showToast(`Please fill in "${item.text}".`, 'error');
            }
        } else if (item.type === 'checkbox') {
            const ticked = Object.keys(val || {});
            if (!ticked.length) {
                return showToast(`Please tick at least one option for "${item.text}".`, 'error');
            }
            for (const j of ticked) {
                const opt = item.options[j];
                if (opt?.subtitle && !String(val[j] || '').trim()) {
                    return showToast(`Please fill in "${opt.subtitle}" for "${opt.label}".`, 'error');
                }
            }
        } else {
            if (!val || !val.base64) {
                return showToast(`Please upload "${item.text}".`, 'error');
            }
        }
    }

    researchInfoData = currentResearchItems.map((item, i) => {
        const val = researchFieldValues[i];

        if (item.type === 'text') {
            return {
                label: item.text,
                type: 'text',
                optional: item.optional,
                value: val && String(val).trim() ? String(val).trim() : null,
            };
        }
        if (item.type === 'checkbox') {
            const ticked = Object.keys(val || {});
            return {
                label: item.text,
                type: 'checkbox',
                optional: item.optional,
                value: ticked.map(j => ({
                    option: item.options[j].label,
                    subtitle: item.options[j].subtitle || null,
                    answer: String(val[j] || '').trim() || null,
                })),
            };
        }
        return {
            label: item.text,
            type: item.type,
            optional: item.optional,
            file_name: val?.name || null,
            file_base64: val?.base64 || null,
        };
    });

    goToStep2();
}

/* ══════════════════════════════════════════════════
   SUBMIT PAYMENT
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
        const proofB64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('File read failed'));
            reader.readAsDataURL(proofFile);
        });

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
            status: 'Pending',
            proof_image: proofB64,
            ...(currentService.requires_research_info && researchInfoData ? {
                research_items: researchInfoData,
            } : {}),
        };

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
        submitBtn.textContent = 'Submit Payment';
    }
}

/* ── Proof image upload preview ──────────────────── */
function initUploadZone() {
    const input = document.getElementById('gmProofInput');
    const preview = document.getElementById('gmProofPreview');
    const prompt = document.getElementById('gmUploadPrompt');
    const zone = document.getElementById('gmUploadZone');
    if (!input || !zone) return;

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
    return undefined;
}

/* ══════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!getToken() || !user) {
        window.location.href = LOGIN_URL;
        return;
    }

    renderUserIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    loadAndRenderServices();
    initUploadZone();

    document.getElementById('gmClose')?.addEventListener('click', closeGcashModal);
    document.getElementById('gmCancelBtn')?.addEventListener('click', closeGcashModal);
    document.getElementById('gcashModalOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) closeGcashModal();
    });
    document.addEventListener('keydown', e => {
        const overlay = document.getElementById('gcashModalOverlay');
        if (e.key === 'Escape' && overlay && !overlay.hidden) closeGcashModal();
    });
});