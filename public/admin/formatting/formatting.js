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