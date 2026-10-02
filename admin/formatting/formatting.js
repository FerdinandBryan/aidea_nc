// formatting.js
// Format Template Manager — AIDEA Admin
// Stores templates in localStorage under 'aidea_format_templates'
// Each template is used by Thesis_format_plagiarism.js to validate submissions.

const LOGIN_URL = '../../user/login/login.html';

/* ══════════════════════════════════════════════
   SHARED UI — theme / drawer / profile menu / sign-out
   (same behaviour as dashboard.js and Price_audit_log.js
   so every AIDEA Admin page feels identical)
══════════════════════════════════════════════ */

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

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
        let saved = null;
        try { saved = localStorage.getItem('aidea_theme'); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
}

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

function performSignOut() {
    try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('aidea_user');
    } catch { }
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

/* ══════════════════════════════════════════════
   STORAGE HELPERS
══════════════════════════════════════════════ */
const STORAGE_KEY = 'aidea_format_templates';

function getTemplates() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
}
function saveTemplates(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let templates = [];
let filtered = [];
let editingId = null;        // null = create, number = edit
let pendingDeleteId = null;
let tplSelectedFile = null;  // File object for the uploaded reference

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    // Shared shell UI first so the page is interactive immediately
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    templates = getTemplates();
    filtered = [...templates];

    // Seed demo templates if empty
    if (templates.length === 0) seedDemoTemplates();

    applyFilter();
    updateStats();

    // Toggle label
    document.getElementById('tplActive').addEventListener('change', function () {
        document.getElementById('toggleLabel').textContent = this.checked ? 'Active' : 'Inactive';
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
    });

    // Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['createModal', 'viewModal', 'deleteModal'].forEach(id => closeModal(id));
        }
    });
});

/* ══════════════════════════════════════════════
   SEED DEMO DATA
══════════════════════════════════════════════ */
function seedDemoTemplates() {
    const demos = [
        {
            id: 1,
            name: 'Standard Thesis Format 2025',
            type: 'Final Defense',
            description: 'Official Norzagaray College thesis format for final defense submissions.',
            active: true,
            rules: [
                { name: 'Title Page', type: 'Required', detail: 'Must include title, authors, course, year, and adviser.' },
                { name: 'Abstract', type: 'Required', detail: 'Minimum 150 words. Summarize objectives, methods, results, conclusions.' },
                { name: 'Table of Contents', type: 'Required', detail: 'Must list all chapters and sections with page numbers.' },
                { name: 'Font & Spacing', type: 'Style', detail: 'Times New Roman 12pt, double-spaced, 1-inch margins.' },
                { name: 'Citation Style', type: 'Style', detail: 'APA 7th edition.' },
                { name: 'Minimum Pages', type: 'Length', detail: 'At least 60 pages excluding appendices.' },
                { name: 'File Format', type: 'File', detail: 'PDF only for final submission.' },
            ],
            file: null,
            createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        },
        {
            id: 2,
            name: 'Proposal Submission Format',
            type: 'Proposal',
            description: 'Format requirements for initial thesis proposals.',
            active: true,
            rules: [
                { name: 'Cover Page', type: 'Required', detail: 'Proposed title, proponents, course, academic year.' },
                { name: 'Background of Study', type: 'Required', detail: 'Minimum 1 page narrative.' },
                { name: 'Statement of Problem', type: 'Required', detail: 'Numbered list of problems to be addressed.' },
                { name: 'Objectives', type: 'Required', detail: 'General and specific objectives listed separately.' },
                { name: 'Scope & Delimitation', type: 'Required', detail: 'Define boundaries of the study.' },
                { name: 'Font & Spacing', type: 'Style', detail: 'Times New Roman 12pt, double-spaced.' },
            ],
            file: null,
            createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        },
        {
            id: 3,
            name: 'Revised Final Format',
            type: 'Revised Final',
            description: 'For thesis revised after panel defense. Includes panel comments section.',
            active: false,
            rules: [
                { name: 'Panel Revision Sheet', type: 'Required', detail: 'Must attach signed panel revision checklist.' },
                { name: 'Abstract', type: 'Required', detail: 'Updated to reflect revisions.' },
                { name: 'Signature Page', type: 'Required', detail: 'Signed by adviser and dean.' },
                { name: 'File Format', type: 'File', detail: 'PDF with bookmarks.' },
            ],
            file: null,
            createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        },
    ];
    saveTemplates(demos);
    templates = demos;
    filtered = [...templates];
}

/* ══════════════════════════════════════════════
   STATS
══════════════════════════════════════════════ */
function updateStats() {
    document.getElementById('st-total').textContent = templates.length;
    document.getElementById('st-active').textContent = templates.filter(t => t.active).length;
    document.getElementById('st-files').textContent = templates.filter(t => t.file).length;
    const ruleCount = templates.reduce((sum, t) => sum + (t.rules?.length || 0), 0);
    document.getElementById('st-rules').textContent = ruleCount;
}

/* ══════════════════════════════════════════════
   FILTER & RENDER TABLE
══════════════════════════════════════════════ */
function applyFilter() {
    const q = (document.getElementById('searchInput').value || '').toLowerCase();
    const tp = document.getElementById('filterType').value;

    filtered = templates.filter(t =>
        (!q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)) &&
        (!tp || t.type === tp)
    );
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('templateBody');

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <div class="empty-state-icon">📐</div>
                    <p>${templates.length === 0 ? 'No templates yet. Click <strong>+ Format Template</strong> to create one.' : 'No templates match your filter.'}</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((t, i) => {
        const statusBadge = t.active
            ? `<span class="badge badge-success">Active</span>`
            : `<span class="badge badge-neutral">Inactive</span>`;
        const typeBadge = `<span class="badge badge-info">${t.type}</span>`;
        const fileChip = t.file
            ? `<span class="file-chip">📎 ${truncate(t.file.name, 18)}</span>`
            : `<span style="color:var(--muted);font-size:12px;">—</span>`;
        return `
        <tr>
            <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
            <td>
                <div class="tpl-name">${t.name}</div>
                <div class="tpl-desc">${t.description || '—'}</div>
            </td>
            <td>${typeBadge}</td>
            <td>
                <span style="font-weight:600;color:var(--text);">${t.rules?.length || 0}</span>
                <span style="font-size:11px;color:var(--muted);"> rules</span>
            </td>
            <td>${fileChip}</td>
            <td>${statusBadge}</td>
            <td style="font-size:12px;color:var(--muted);">${formatDate(t.createdAt)}</td>
            <td class="action-cell">
                <button class="btn-action" onclick="openViewModal(${t.id})">View</button>
                <button class="btn-action" onclick="openEditModal(${t.id})">Edit</button>
                <button class="btn-action danger" onclick="openDeleteModal(${t.id})">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

/* ══════════════════════════════════════════════
   RULE ROWS (in create/edit modal)
══════════════════════════════════════════════ */
function addRuleRow(name = '', type = '', detail = '') {
    const container = document.getElementById('rulesContainer');
    const uid = Date.now() + Math.random();
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.dataset.uid = uid;
    row.innerHTML = `
        <input type="text" placeholder="Rule name (e.g. Abstract)" value="${escapeAttr(name)}" class="rule-name" />
        <select class="rule-type">
            ${['Required', 'Style', 'Length', 'File', 'Optional'].map(o =>
        `<option ${o === type ? 'selected' : ''}>${o}</option>`
    ).join('')}
        </select>
        <button class="btn-remove-rule" onclick="removeRuleRow(this)" title="Remove">×</button>
        <input type="text" placeholder="Details / expectation (optional)" value="${escapeAttr(detail)}" class="rule-detail" style="grid-column:1/-1;margin-top:2px;" />
    `;
    container.appendChild(row);
}

function removeRuleRow(btn) {
    btn.closest('.rule-row').remove();
}

function collectRules() {
    const rows = document.querySelectorAll('#rulesContainer .rule-row');
    return Array.from(rows).map(r => ({
        name: r.querySelector('.rule-name').value.trim(),
        type: r.querySelector('.rule-type').value,
        detail: r.querySelector('.rule-detail').value.trim(),
    })).filter(r => r.name);
}

/* ══════════════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════════════ */
function handleTplFile(file) {
    if (!file) return;
    tplSelectedFile = file;
    const info = document.getElementById('tplFileInfo');
    info.style.display = 'block';
    info.textContent = `📎 ${file.name}  (${formatSize(file.size)})`;
}
function handleTplDrop(e) {
    e.preventDefault();
    document.getElementById('tplDropzone').classList.remove('dragover');
    handleTplFile(e.dataTransfer.files[0]);
}

/* ══════════════════════════════════════════════
   CREATE MODAL
══════════════════════════════════════════════ */
function openCreateModal() {
    editingId = null;
    tplSelectedFile = null;

    document.getElementById('createModalTitle').textContent = 'New Format Template';
    document.getElementById('tplName').value = '';
    document.getElementById('tplType').value = '';
    document.getElementById('tplDesc').value = '';
    document.getElementById('tplActive').checked = true;
    document.getElementById('toggleLabel').textContent = 'Active';
    document.getElementById('tplFileInfo').style.display = 'none';
    document.getElementById('rulesContainer').innerHTML = '';

    // Add 3 starter rules
    addRuleRow('Title Page', 'Required', 'Must include title, authors, course, year, adviser.');
    addRuleRow('Abstract', 'Required', 'Minimum 150 characters.');
    addRuleRow('File Format', 'File', 'PDF, DOC, or DOCX only.');

    openModal('createModal');
}

/* ══════════════════════════════════════════════
   EDIT MODAL
══════════════════════════════════════════════ */
function openEditModal(id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    tplSelectedFile = null;

    document.getElementById('createModalTitle').textContent = 'Edit Format Template';
    document.getElementById('tplName').value = t.name;
    document.getElementById('tplType').value = t.type;
    document.getElementById('tplDesc').value = t.description || '';
    document.getElementById('tplActive').checked = t.active;
    document.getElementById('toggleLabel').textContent = t.active ? 'Active' : 'Inactive';

    const info = document.getElementById('tplFileInfo');
    if (t.file) {
        info.style.display = 'block';
        info.textContent = `📎 ${t.file.name}  (${formatSize(t.file.size)})`;
    } else {
        info.style.display = 'none';
    }

    const container = document.getElementById('rulesContainer');
    container.innerHTML = '';
    (t.rules || []).forEach(r => addRuleRow(r.name, r.type, r.detail));

    closeModal('viewModal');
    openModal('createModal');
}

/* ══════════════════════════════════════════════
   SAVE TEMPLATE
══════════════════════════════════════════════ */
function saveTemplate() {
    const name = document.getElementById('tplName').value.trim();
    const type = document.getElementById('tplType').value;

    if (!name) { showToast('Template name is required.', 'warning'); return; }
    if (!type) { showToast('Please select a submission type.', 'warning'); return; }

    const rules = collectRules();
    const active = document.getElementById('tplActive').checked;

    // Serialize file metadata (we can't store the actual File object in localStorage)
    let fileData = null;
    if (tplSelectedFile) {
        fileData = { name: tplSelectedFile.name, size: tplSelectedFile.size, type: tplSelectedFile.type };
    }

    if (editingId !== null) {
        // Update
        const idx = templates.findIndex(t => t.id === editingId);
        if (idx > -1) {
            templates[idx] = {
                ...templates[idx],
                name, type,
                description: document.getElementById('tplDesc').value.trim(),
                active, rules,
                file: tplSelectedFile ? fileData : templates[idx].file,
            };
        }
        showToast(`Template "${name}" updated.`, 'success');
    } else {
        // Create
        const newId = templates.length ? Math.max(...templates.map(t => t.id)) + 1 : 1;
        templates.push({
            id: newId, name, type,
            description: document.getElementById('tplDesc').value.trim(),
            active, rules,
            file: fileData,
            createdAt: new Date().toISOString(),
        });
        showToast(`Template "${name}" created.`, 'success');
    }

    saveTemplates(templates);
    filtered = [...templates];
    applyFilter();
    updateStats();
    closeModal('createModal');
}

/* ══════════════════════════════════════════════
   VIEW MODAL
══════════════════════════════════════════════ */
function openViewModal(id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;

    document.getElementById('viewModalTitle').textContent = t.name;
    document.getElementById('viewEditBtn').onclick = () => openEditModal(id);

    const rulesHtml = (t.rules || []).length === 0
        ? `<div style="font-size:12px;color:var(--muted);padding:8px 0;">No rules defined.</div>`
        : `<div class="view-rules-list">
            ${t.rules.map(r => `
                <div class="view-rule-row">
                    <div class="view-rule-dot"></div>
                    <div>
                        <div class="view-rule-name">${r.name} <span class="badge badge-neutral" style="font-size:10px;padding:1px 6px;">${r.type}</span></div>
                        ${r.detail ? `<div class="view-rule-type">${r.detail}</div>` : ''}
                    </div>
                </div>`).join('')}
          </div>`;

    const fileHtml = t.file
        ? `<div class="file-card-view">
            <div class="file-card-icon">${fileIcon(t.file.name)}</div>
            <div>
                <div class="file-card-name">${t.file.name}</div>
                <div class="file-card-meta">${formatSize(t.file.size)} · ${(t.file.name.split('.').pop() || '').toUpperCase()}</div>
            </div>
            <div class="file-card-btns">
                <button class="btn-file-dl" onclick="showToast('File is stored as reference. Upload again to re-download.','info')">Download</button>
            </div>
          </div>`
        : `<div style="font-size:12px;color:var(--muted);margin-top:4px;">No reference file attached.</div>`;

    document.getElementById('viewModalBody').innerHTML = `
        <div class="view-meta-grid">
            <div class="view-meta-item">
                <div class="view-meta-label">Type</div>
                <div class="view-meta-value"><span class="badge badge-info">${t.type}</span></div>
            </div>
            <div class="view-meta-item">
                <div class="view-meta-label">Status</div>
                <div class="view-meta-value">
                    ${t.active
            ? `<span class="badge badge-success">Active</span>`
            : `<span class="badge badge-neutral">Inactive</span>`}
                </div>
            </div>
            <div class="view-meta-item">
                <div class="view-meta-label">Rules</div>
                <div class="view-meta-value">${t.rules?.length || 0} defined</div>
            </div>
            <div class="view-meta-item">
                <div class="view-meta-label">Created</div>
                <div class="view-meta-value">${formatDate(t.createdAt)}</div>
            </div>
        </div>
        ${t.description ? `<div class="view-desc">${t.description}</div>` : ''}

        <div class="view-section-title">Formatting Rules</div>
        ${rulesHtml}

        <div class="view-section-title" style="margin-top:18px;">Reference File</div>
        ${fileHtml}
    `;

    openModal('viewModal');
}

/* ══════════════════════════════════════════════
   DELETE
══════════════════════════════════════════════ */
function openDeleteModal(id) {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    pendingDeleteId = id;
    document.getElementById('deleteTemplateName').textContent = `"${t.name}"`;
    document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
    openModal('deleteModal');
}
function confirmDelete() {
    if (pendingDeleteId === null) return;
    const name = templates.find(t => t.id === pendingDeleteId)?.name || '';
    templates = templates.filter(t => t.id !== pendingDeleteId);
    saveTemplates(templates);
    filtered = [...templates];
    applyFilter();
    updateStats();
    closeModal('deleteModal');
    showToast(`Template "${name}" deleted.`, 'info');
    pendingDeleteId = null;
}

/* ══════════════════════════════════════════════
   MODAL HELPERS (template create/edit/view/delete modals —
   distinct from the shared sign-out modal above)
══════════════════════════════════════════════ */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function formatDate(raw) {
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}
function fileIcon(name) {
    if (!name) return '📁';
    const ext = name.split('.').pop().toLowerCase();
    return { pdf: '📄', doc: '📝', docx: '📝' }[ext] || '📁';
}
function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}
function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function showToast(msg, type = 'info') {
    const wrap = document.getElementById('toastWrap');
    const colors = { success: '#22c55e', warning: '#f59e0b', info: '#3b82f6', error: '#ef4444' };
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

/* ══════════════════════════════════════════════
   EXPORT: getActiveTemplate(type)
   Called by Thesis_format_plagiarism.js to get
   the active template rules for a given submission type.
   Usage:
     const tpl = getActiveTemplateForType('Final Defense');
     if (tpl) { /* use tpl.rules * / }
══════════════════════════════════════════════ */
window.getActiveTemplateForType = function (submissionType) {
    const all = getTemplates();
    // Prefer exact type match; fall back to 'General'
    return all.find(t => t.active && t.type === submissionType)
        || all.find(t => t.active && t.type === 'General')
        || null;
};

/**
 * getFormatRulesForThesis(thesis)
 * Returns an array of rule-check objects that
 * Thesis_format_plagiarism.js can run on a thesis object.
 *
 * Built-in rules always run. If a matching active template
 * exists, its custom rules are appended as required checks.
 */
window.getFormatRulesForThesis = function (thesis) {
    const builtIn = [
        { label: 'Title', check: t => t.title?.trim().length > 0, pass: 'Present', fail: 'Missing title' },
        { label: 'Abstract', check: t => t.abstract?.trim().length >= 150, pass: 'Sufficient length (≥150 chars)', fail: `Too short (${thesis.abstract?.trim().length || 0} chars, min 150)` },
        { label: 'Adviser', check: t => t.adviser?.trim().length > 0, pass: 'Named', fail: 'Adviser not specified' },
        { label: 'Authors', check: t => t.authors && t.authors !== '—', pass: 'Provided', fail: 'No authors listed' },
        { label: 'Course', check: t => t.course?.trim().length > 0, pass: 'Specified', fail: 'Course missing' },
        { label: 'Academic Year', check: t => /\d{4}/.test(t.year ?? ''), pass: 'Valid format', fail: 'Invalid or missing year' },
        { label: 'Submission Type', check: t => t.service?.trim().length > 0, pass: 'Specified', fail: 'Submission type missing' },
        { label: 'File Attached', check: t => !!t.file, pass: 'File present', fail: 'No file submitted' },
        { label: 'File Type', check: t => ['pdf', 'doc', 'docx'].includes((t.file?.name?.split('.').pop() || '').toLowerCase()), pass: 'Accepted format (PDF/DOC/DOCX)', fail: 'Unsupported file type' },
    ];

    const tpl = window.getActiveTemplateForType(thesis.service || '');
    if (!tpl || !tpl.rules?.length) return builtIn;

    // Append custom template rules as static checks
    const customRules = tpl.rules.map(r => ({
        label: r.name,
        check: () => null,          // null = manual (admin must verify)
        pass: 'Requires manual review',
        fail: 'Requires manual review',
        manual: true,
        detail: r.detail,
        ruleType: r.type,
    }));

    return [...builtIn, ...customRules];
};

/* LOAD_THESIS_CHECKLIST: fills the rule rows from the Thesis Format and Assessment Checklist */
const THESIS_CHECKLIST = [
  "# General Guidelines",
  "S|The font style used in all parts of the manuscript is Times New Roman.",
  "S|The font size used in all parts of the manuscript is 12.",
  "S|Margins are strictly followed (left 1.5 inches, right 1 inch, top and bottom 1 inch).",
  "S|The manuscript is printed on short bond paper (8.5 by 11 inches).",
  "S|Pagination is found in the upper right corner on every page EXCEPT on the Chapter pages.",
  "S|Pagination in the preliminary pages uses small-letter Roman numerals.",
  "S|Pagination on the Title Page and Approval Sheet is not shown.",
  "S|The manuscript is double-spaced.",
  "R|The references used are within the last ten (10) years, except for theories.",
  "R|The manuscript contains correct and proper citations.",
  "# Preliminary Pages",
  "R|The manuscript has the required TITLE PAGE.",
  "R|The manuscript has the required APPROVAL SHEET.",
  "L|The manuscript has the required ACKNOWLEDGEMENT. Maximum of 2 pages.",
  "R|The manuscript has the required ABSTRACT.",
  "L|The abstract is one paragraph, single-spaced, about 250 to 350 words in length.",
  "R|The abstract contains the general purpose of the study, participants and sampling technique, research design, statistical treatment, significant/major findings, conclusions, and recommendations.",
  "O|The abstract may contain recommendations for a universal or broader application or implications of the study.",
  "S|Keywords (5 words, italicized): must include the critical concept/variables, respondents, research design and research locale.",
  "R|The manuscript has the required TABLE OF CONTENTS.",
  "R|The manuscript has the required LIST OF TABLES.",
  "R|The manuscript has the required LIST OF FIGURES.",
  "R|The manuscript has the required LIST OF APPENDICES.",
  "# Chapter 1 - Introduction",
  "R|The Introduction leads the reader from a general subject area to a specific topic of inquiry.",
  "R|The Introduction includes a Literature Review.",
  "L|The Introduction has a maximum of 3 pages.",
  "R|The first paragraph contains a global situation analysis of the problem, cohesively written and supported by related literature and studies from different continents, with at least ten (10) in-text citations.",
  "R|The second paragraph presents an ASEAN situational analysis of the problem, including local studies in the country, with at least ten (10) in-text citations.",
  "R|The third paragraph compares or contrasts global and ASEAN literature or studies. It includes the research gap (what is known and what is missing) and states the importance of addressing it. Gaps may be theoretical/conceptual, methodological, or contextual.",
  "R|The fourth paragraph states the importance of the study, including the main objective, scope, possible key results, solutions, and implications based on the literature analysis.",
  "# Chapter 1 - Theoretical Framework / Philosophical Underpinning",
  "R|The Theoretical Framework (quantitative) or Philosophical Underpinning (qualitative) is presented and discussed in textual form with at least one (1) in-text citation, using the SEC format.",
  "R|S - State: states the theory or philosophical underpinning, its proponent/s, and its main idea or principle, with at least one (1) in-text citation.",
  "R|E - Explain: explains the key concepts or principles of the theory in relation to the study and how they help explain the variables, concepts, or phenomenon. Avoids merely defining or describing the theory.",
  "R|C - Connect: connects the theory directly to the study, showing why it is appropriate and how it serves as the foundation of the study.",
  "# Chapter 1 - Conceptual Framework",
  "R|A model or research paradigm shows a visual representation of the expected relationship between variables.",
  "R|There is a written or textual description of the model or research paradigm.",
  "# Chapter 1 - Statement of the Problem",
  "R|The Statement of the Problem states the general objective/purpose of the study.",
  "R|The 2nd paragraph provides the specific objectives in question form that are measurable and attainable.",
  "# Chapter 1 - Hypothesis (Quantitative Research)",
  "R|The Hypothesis/Hypotheses states the numbered null hypothesis of the study.",
  "# Chapter 1 - Scope and Limitations",
  "R|The Scope and Limitations are in one to three paragraphs and contain the general purpose, participants and sampling technique, research design, instrument, limitations, and statistical treatment.",
  "# Chapter 1 - Significance of the Study",
  "R|There is a preliminary statement.",
  "R|The Significance convinces the reader that the study contributes to stakeholders: solving educational problems, bridging a knowledge gap, improving social conditions, enriching research instruments and methods, and supporting government thrusts.",
  "R|Beneficiaries are arranged from those who benefit the most to the least.",
  "# Chapter 1 - Definition of Terms",
  "R|There is a preliminary statement on how the terms or variables are used (operationally or contextually).",
  "S|The terms are in bold text.",
  "S|The terms are alphabetically arranged.",
  "S|Each definition starts with the statement \"This refers to...\".",
  "# Chapter 2 - Review of Related Literature and Studies",
  "R|There is a preliminary statement or short description of what to expect in Chapter 2.",
  "R|The literature review synthesizes the meaning of the study variables through in-text citations.",
  "R|The literature review is in a thematic format based on the variables.",
  "R|The Synthesis summarizes the main findings and insights of the reviewed literature and studies, highlighting common themes, trends, and gaps.",
  "R|The Synthesis connects the findings to the researcher's own topic.",
  "# Chapter 3 - Methodology",
  "R|There is a preliminary statement or short description of what to expect in Chapter 3.",
  "R|Method of Research: the type of research is presented and discussed with at least two (2) in-text citations.",
  "R|Method of Research: the research design used is explained.",
  "R|Population and Sampling: the respondents and the research locale are presented and discussed.",
  "R|Population and Sampling: the sampling technique is explained.",
  "O|Population and Sampling: a table for the distribution of respondents is presented and discussed (if any).",
  "R|Research Instrument: the first paragraph describes the survey questionnaire (adapted/adopted or researcher-made), including construction, development, parts, contents, and scales used.",
  "R|Research Instrument: for adapted/adopted instruments, the source is discussed with at least one (1) in-text citation; for researcher-made questionnaires, the construction is explained thoroughly.",
  "R|Research Instrument: the second paragraph describes the validity and reliability test results, indicating the appendix letter.",
  "R|Data Gathering: the first part presents the procedure, including approval and permission from the head of the institution/agency and the actual data collection.",
  "R|Data Gathering: the second part discusses ethical considerations, including the Data Protection Act, Data Privacy Notice (for Google Form or online collection), and Informed Consent.",
  "R|Data Analysis: the first paragraph presents how the data is analyzed.",
  "R|Data Analysis (quantitative): descriptive and inferential statistical tools are presented with their use and formulas.",
  "O|Data Analysis (qualitative): the process of coding and creating themes is described in paragraph form.",
  "R|Ethical Considerations - Ethical Approval and Consent: states the permission secured and explains informed consent/assent and voluntary participation.",
  "R|Ethical Considerations - Protection of Participants: explains how rights, welfare, confidentiality, and data privacy were protected.",
  "R|Ethical Considerations - Research Integrity: states how academic integrity, proper citation, honest reporting, and ethical standards were observed.",
  "# Chapter 4 - Presentation, Analysis and Interpretation of Data",
  "R|There is a preliminary statement or short description of what to expect in Chapter 4.",
  "S|The presentation follows the order of the SOP, with the appropriate number and a heading/title in sentence case, bold, without a period.",
  "S|The tables are correctly numbered and titled.",
  "S|There are no hanging tables.",
  "R|The presentation of each variable indicates interesting and significant facts (in textual format) found in every table.",
  "R|There is a discussion and interpretation of results in each table, answering the research question and critically evaluating the results.",
  "R|The discussion reviews previous findings and existing knowledge for each table with at least 2 or 3 in-text citations.",
  "R|Hypothesis testing results are interpreted and reviewed against related findings that corroborate or contradict each significant variable, with at least 2-3 in-text citations.",
  "R|The discussion presents the implications of the findings for policy and practice.",
  "# Chapter 5 - Summary of Findings, Conclusions, and Recommendations",
  "R|There is a preliminary statement or short description of what to expect in Chapter 5.",
  "R|Summary of Findings follows the order of the SOP, with appropriate numbering, in textual format.",
  "R|Conclusions: the first part provides an introductory statement.",
  "R|Conclusions follow the order of the SOP with appropriate numbering, discussing the practical implications of the study.",
  "R|Recommendations: the first part provides an introductory statement.",
  "R|Recommendations follow the order from the most to the least beneficial entity, with appropriate numbering, based on the limitations/weaknesses.",
  "R|The last recommendation suggests topics for further research.",
  "# References",
  "S|The word REFERENCES is bold, capital, font size 38, centered, and in the middle of the page.",
  "R|References are alphabetically arranged with hanging indention (APA 6th or 7th edition), and only traceable/online sources are used in Chapters 1 to 4.",
  "# Appendices",
  "S|The word APPENDICES is bold, capital, font size 38, centered, and in the middle of the page.",
  "R|Appendix A - Permission/Approval Letter: scanned and signed letter from the head of the institution/agency, secured before data gathering.",
  "R|Appendix B - Questionnaire/Interview Guide: the instruments are included.",
  "R|Appendix C - Informed Consent/Assent Form: the consent/assent form is included.",
  "R|Appendix D - Certificate of Validation: scanned and signed validation form from the panel.",
  "R|Appendix E - Certificate of Editing: signed grammarian's certificate.",
  "O|Appendix F - Reliability Test Results (if any): scanned and signed results with a summary of computations.",
  "R|Appendix G - Certificate of Data Analysis: signed statistician's certificate.",
  "O|Appendix G - Qualitative research: certificate that the data were thematically analyzed with proper codes and themes.",
  "L|Appendix H - Certificate of Similarity and AI Checking: Turnitin or PlagScan used; at most 15% similarity and AI result.",
  "R|Appendix I - Documentation: pictures of the data gathering.",
  "R|Appendix J - Sample Tally Sheet: the sample tally sheet used in the study.",
  "L|Appendix K - Curriculum Vitae: a CV with a 1.5 by 1.5 inch picture, maximum of one (1) page per author."
];

function loadThesisChecklist() {
    const typeMap = { R: 'Required', S: 'Style', L: 'Length', O: 'Optional', F: 'File' };
    const container = document.getElementById('rulesContainer');
    if (!container) return;
    container.innerHTML = '';
    let section = '';
    let count = 0;
    THESIS_CHECKLIST.forEach(function (line) {
        if (line.charAt(0) === '#') { section = line.slice(2); return; }
        const code = line.charAt(0);
        const text = line.slice(2);
        const words = text.split(' ');
        const label = section + ': ' + words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');
        addRuleRow(label, typeMap[code] || 'Required', text);
        count++;
    });
    const nameEl = document.getElementById('tplName');
    const descEl = document.getElementById('tplDesc');
    if (nameEl && !nameEl.value.trim()) nameEl.value = 'Thesis Format and Assessment Checklist';
    if (descEl && !descEl.value.trim()) descEl.value = 'Standard criteria for the thesis manuscript: general guidelines, preliminary pages, Chapters 1 to 5, references, and appendices.';
    showToast(count + ' checklist rules loaded. Review them, then Save.', 'success');
}

(function initChecklistButton() {
    function add() {
        const addBtn = document.querySelector('.btn-add-rule');
        if (!addBtn || document.getElementById('btnLoadChecklist')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'btnLoadChecklist';
        b.className = addBtn.className;
        b.style.marginRight = '8px';
        b.textContent = 'Load thesis checklist';
        b.addEventListener('click', loadThesisChecklist);
        addBtn.parentNode.insertBefore(b, addBtn);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();