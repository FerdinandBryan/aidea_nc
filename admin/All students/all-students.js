// all-students.js — Admin side
// Uses the same session, theme, drawer and sign-out behaviour as dashboard.js.

const API_BASE = 'http://127.0.0.1:8000/api';
const LOGIN_URL = '../../user/login/login.html';
const PAGE_SIZE = 6;

let currentPage = 1;
let filtered = [];
let allStudents = [];

const $ = id => document.getElementById(id);

// ── Session helpers ────────────────────────────────────────────────────────

function getToken() {
    return localStorage.getItem('auth_token') || null;
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function authHeaders() {
    return {
        'Authorization': `Bearer ${getToken()}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

// fetch wrapper: adds the bearer token and redirects to login on 401
async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options.headers || {}) },
    });
    if (res.status === 401) {
        clearSession();
        window.location.href = LOGIN_URL;
        throw new Error('Unauthorized');
    }
    return res;
}

// ── Utilities ──────────────────────────────────────────────────────────────

const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fullName(s) {
    return [s.fname, s.lname].filter(Boolean).join(' ') || 'Unnamed';
}

function initials(s) {
    return fullName(s).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Overlays (modals) ──────────────────────────────────────────────────────

function focusables(root) {
    return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.type !== 'hidden' && !el.closest('[hidden]'));
}

// lock page scroll while a modal or the mobile drawer is open
function syncScrollLock() {
    const modalOpen = !!document.querySelector('.modal-backdrop:not([hidden])');
    const drawerOpen = !!$('sidebar')?.classList.contains('open');
    document.body.classList.toggle('no-scroll', modalOpen || drawerOpen);
}

function openOverlay(el, { focus, returnTo } = {}) {
    el._returnTo = returnTo || document.activeElement;
    el.hidden = false;
    syncScrollLock();
    (focus || focusables(el)[0])?.focus();
}

function closeOverlay(el) {
    el.hidden = true;
    syncScrollLock();
    el._returnTo?.focus?.();
}

function initOverlays() {
    document.addEventListener('keydown', e => {
        const open = document.querySelector('.modal-backdrop:not([hidden])');
        if (!open) return;

        if (e.key === 'Escape') { e.preventDefault(); closeOverlay(open); return; }

        // keep keyboard focus inside the dialog
        if (e.key === 'Tab') {
            const items = focusables(open);
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    // click on a dark backdrop closes that modal
    document.querySelectorAll('.modal-backdrop').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) closeOverlay(m); });
    });
}

// ── Sign out ───────────────────────────────────────────────────────────────

function performSignOut() {
    if (getToken()) {
        fetch(`${API_BASE}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => { });
    }
    clearSession();
    window.location.href = LOGIN_URL;
}

function initSignOutModal() {
    const modal = $('signOutModal');
    const trigger = $('signOutBtn');
    const cancel = $('signOutCancel');
    const confirmBtn = $('signOutConfirm');
    const profileBtn = $('profileBtn');
    const profileMenu = $('profileMenu');
    if (!modal || !trigger || !cancel || !confirmBtn) return;

    trigger.addEventListener('click', () => {
        // close the small profile menu first
        if (profileMenu) profileMenu.hidden = true;
        profileBtn?.setAttribute('aria-expanded', 'false');
        openOverlay(modal, { focus: cancel, returnTo: profileBtn });
    });
    cancel.addEventListener('click', () => closeOverlay(modal));
    confirmBtn.addEventListener('click', performSignOut);
}

// ── Theme (light / dark) ───────────────────────────────────────────────────

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
        try { localStorage.setItem('aidea_theme', theme); } catch { }
    }
    const btn = $('themeBtn');
    if (btn) btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
}

function initTheme() {
    applyTheme(currentTheme(), false);

    $('themeBtn')?.addEventListener('click', () => {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    // follow the OS setting until the user picks one manually
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
        let saved = null;
        try { saved = localStorage.getItem('aidea_theme'); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
}

// ── Mobile drawer ──────────────────────────────────────────────────────────

function initDrawer() {
    const sidebar = $('sidebar');
    const scrim = $('scrim');
    const btn = $('menuBtn');
    if (!sidebar || !scrim || !btn) return;

    const open = () => {
        sidebar.classList.add('open');
        scrim.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        syncScrollLock();
    };
    const close = () => {
        sidebar.classList.remove('open');
        scrim.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        syncScrollLock();
    };

    btn.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) close(); });
}

// ── Profile menu (sidebar footer) ──────────────────────────────────────────

function initProfileMenu() {
    const btn = $('profileBtn');
    const menu = $('profileMenu');
    if (!btn || !menu) return;

    const setOpen = open => {
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    };

    btn.addEventListener('click', e => {
        e.stopPropagation();
        setOpen(menu.hidden);
    });

    // click anywhere else closes the menu
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

// ── Admin identity in sidebar ──────────────────────────────────────────────

function renderAdminIdentity(user) {
    const name = [user.fname, user.lname].filter(Boolean).join(' ') || 'Admin';
    const parts = name.trim().split(/\s+/);
    const ini = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

    const avatar = document.querySelector('.footer-avatar');
    const nameEl = document.querySelector('.footer-name');
    if (avatar) avatar.textContent = ini;
    if (nameEl) nameEl.textContent = name;
}

// ── Students table ─────────────────────────────────────────────────────────

function render() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);
    const tbody = $('studentsBody');

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty">No students found.</td></tr>`;
        renderPagination();
        return;
    }

    tbody.innerHTML = rows.map((s, i) => `
        <tr>
            <td data-label="No.">${start + i + 1}</td>
            <td data-label="Name">
                <div class="avatar-cell">
                    <span class="avatar" aria-hidden="true">${escHtml(initials(s))}</span>
                    <strong>${escHtml(fullName(s))}</strong>
                </div>
            </td>
            <td data-label="Email">${escHtml(s.email || '—')}</td>
        </tr>
    `).join('');

    renderPagination();
}

// 1 … 4 5 6 … 12 — always first, last and the current page's neighbours
function pageList(current, total) {
    const pages = [...new Set([1, total, current - 1, current, current + 1])]
        .filter(p => p >= 1 && p <= total)
        .sort((a, b) => a - b);
    const out = [];
    pages.forEach((p, i) => {
        if (i && p - pages[i - 1] > 1) out.push('…');
        out.push(p);
    });
    return out;
}

function renderPagination() {
    const wrap = $('pagination');
    const info = $('pageInfo');
    const btns = $('pageBtns');
    const total = Math.ceil(filtered.length / PAGE_SIZE);

    wrap.hidden = !filtered.length;
    if (!filtered.length) return;

    const start = (currentPage - 1) * PAGE_SIZE;
    info.textContent = `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`;

    if (total <= 1) { btns.innerHTML = ''; return; }

    btns.innerHTML =
        `<button type="button" class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>` +
        pageList(currentPage, total).map(p => p === '…'
            ? `<span class="page-gap" aria-hidden="true">…</span>`
            : `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`
        ).join('') +
        `<button type="button" class="page-btn" data-page="${currentPage + 1}" ${currentPage === total ? 'disabled' : ''}>Next</button>`;
}

function goPage(n) {
    currentPage = n;
    render();
}

function applyFilter() {
    const q = $('searchInput').value.trim().toLowerCase();
    filtered = allStudents.filter(s =>
        fullName(s).toLowerCase().includes(q)
        || (s.email || '').toLowerCase().includes(q)
    );
    currentPage = 1;
    render();
}

// ── API calls ──────────────────────────────────────────────────────────────

async function fetchStudents() {
    try {
        const res = await api('/students');
        if (!res.ok) throw new Error(`Failed to fetch students (${res.status})`);
        allStudents = asList(await res.json());
        filtered = [...allStudents];
        setText('studentCount', `${allStudents.length} registered ${allStudents.length === 1 ? 'student' : 'students'}`);
        applyFilter();   // keeps any active search after a save
    } catch (err) {
        console.error(err);
        setText('studentCount', 'Unable to load students');
        $('studentsBody').innerHTML =
            `<tr><td colspan="3" class="empty error">Couldn’t load students. Check your connection and refresh.</td></tr>`;
        $('pagination').hidden = true;
    }
}

async function saveStudent(formData, id = null) {
    const res = await api(id ? `/students/${id}` : '/students', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(formData),
    });
    if (!res.ok) {
        throw await res.json().catch(() => ({}));   // Laravel validation payload
    }
    return res.json();
}

// Not wired to a button yet (the table has no action column) — kept from the previous version.
async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) return;
    try {
        const res = await api(`/students/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        await fetchStudents();
    } catch (err) {
        alert('Failed to delete student.');
        console.error(err);
    }
}

// ── Password helpers (same rules as the register page) ─────────────────────

function checkStrength(pass) {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[!@#$%^&*]/.test(pass)) score++;
    return score;
}

function updateStrengthUI(pass) {
    const score = checkStrength(pass);
    const wrap = $('passStrength');
    const bar = $('strengthFill');
    const label = $('strengthLabel');
    const levels = [
        { pct: '25%', color: '#ef4444', text: 'Very weak' },
        { pct: '50%', color: '#f97316', text: 'Weak' },
        { pct: '75%', color: '#22c55e', text: 'Strong' },
        { pct: '100%', color: '#16a34a', text: 'Very strong' },
    ];
    wrap.hidden = !pass;
    if (!pass) return;
    const lvl = levels[Math.max(0, score - 1)];
    bar.style.width = lvl.pct;
    bar.style.background = lvl.color;
    label.textContent = lvl.text;
    label.style.color = lvl.color;
}

function updateHints(pass) {
    const hints = {
        hint8char: [pass.length >= 8, 'At least 8 characters'],
        hintUpper: [/[A-Z]/.test(pass), 'One uppercase letter'],
        hintNum: [/[0-9]/.test(pass), 'One number'],
        hintSpecial: [/[!@#$%^&*]/.test(pass), 'One special character (!@#$)'],
    };
    Object.entries(hints).forEach(([id, [ok, text]]) => {
        const el = $(id);
        if (!el) return;
        el.textContent = `${ok ? '✓' : '○'} ${text}`;
        el.classList.toggle('met', ok);
    });
}

function resetPasswordUI() {
    ['fieldPassword', 'fieldConfirm'].forEach(id => { $(id).type = 'password'; });
    document.querySelectorAll('.toggle-pass').forEach(b => {
        b.classList.remove('showing');
        b.setAttribute('aria-label', 'Show password');
    });
    updateStrengthUI('');
    updateHints('');
}

// password fields are only for creating an account, not for editing
function setAddMode(isAdd) {
    document.querySelectorAll('#studentForm [data-add-only]').forEach(el => { el.hidden = !isAdd; });
}

function validateNewAccount(data, confirm) {
    const errors = {};
    if (!data.fname) errors.fname = ['First name is required'];
    if (!data.lname) errors.lname = ['Last name is required'];
    if (!data.email) errors.email = ['Email is required'];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = ['Enter a valid email address'];

    if (!data.password) errors.password = ['Password is required'];
    else if (data.password.length < 8) errors.password = ['Password must be at least 8 characters'];
    else if (checkStrength(data.password) < 2) errors.password = ['Password is too weak. Add uppercase, numbers, or symbols'];

    if (!confirm) errors.password_confirmation = ['Please confirm the password'];
    else if (data.password !== confirm) errors.password_confirmation = ['Passwords do not match'];

    return errors;
}

// ── Add / edit student modal ───────────────────────────────────────────────

function clearFormErrors() {
    document.querySelectorAll('#studentForm .field-error').forEach(el => el.textContent = '');
    const box = $('formError');
    box.hidden = true;
    box.textContent = '';
}

function showFormMessage(msg) {
    const box = $('formError');
    box.textContent = msg;
    box.hidden = false;
}

function showFormErrors(errors) {
    clearFormErrors();
    const map = {
        fname: 'errorFname', lname: 'errorLname', mi: 'errorMi', email: 'errorEmail',
        password: 'errorPassword', password_confirmation: 'errorConfirm',
    };
    const rest = [];
    Object.entries(errors).forEach(([field, messages]) => {
        const msg = Array.isArray(messages) ? messages[0] : messages;
        const el = map[field] && $(map[field]);
        if (el) el.textContent = msg;
        else rest.push(msg);
    });
    if (rest.length) showFormMessage(rest.join(' '));
}

function openAddModal() {
    setText('modalTitle', 'Add student');
    $('studentForm').reset();
    $('editStudentId').value = '';
    setAddMode(true);
    resetPasswordUI();
    clearFormErrors();
    openOverlay($('studentModal'), { focus: $('fieldFname') });
}

// Not wired to a button yet — kept from the previous version.
function openEditModal(id) {
    const student = allStudents.find(s => s.id === id);
    if (!student) return;
    setText('modalTitle', 'Edit student');
    $('editStudentId').value = student.id;
    setAddMode(false);
    $('fieldFname').value = student.fname || '';
    $('fieldLname').value = student.lname || '';
    $('fieldMi').value = student.mi || '';
    $('fieldEmail').value = student.email || '';
    clearFormErrors();
    openOverlay($('studentModal'), { focus: $('fieldFname') });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    clearFormErrors();

    const id = $('editStudentId').value;
    const formData = {
        fname: $('fieldFname').value.trim(),
        lname: $('fieldLname').value.trim(),
        mi: $('fieldMi').value.trim() || null,
        email: $('fieldEmail').value.trim().toLowerCase(),
    };

    // creating a new account: include and validate the password
    if (!id) {
        formData.password = $('fieldPassword').value;
        formData.password_confirmation = $('fieldConfirm').value;
        const errors = validateNewAccount(formData, formData.password_confirmation);
        if (Object.keys(errors).length) { showFormErrors(errors); return; }
    }

    const saveBtn = $('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        await saveStudent(formData, id || null);
        closeOverlay($('studentModal'));
        await fetchStudents();
    } catch (err) {
        if (err.errors) {
            showFormErrors(err.errors);
        } else {
            // Error = network/other failure; plain object = Laravel JSON with a message
            showFormMessage(!(err instanceof Error) && err.message
                ? err.message
                : 'Couldn’t save the student. Check your connection and try again.');
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save student';
    }
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Guard — admin only
    const user = getUser();
    if (!getToken() || !user || !user.is_admin) {
        window.location.href = LOGIN_URL;
        return;
    }

    // Shell
    renderAdminIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initOverlays();
    initSignOutModal();

    // Students
    $('searchInput').addEventListener('input', applyFilter);
    $('addStudentBtn').addEventListener('click', openAddModal);
    $('studentForm').addEventListener('submit', handleFormSubmit);

    // Emails are lowercase only: typed or pasted capitals are converted as you go
    // (the field is type="text" + inputmode="email" so the caret position can be kept)
    $('fieldEmail').addEventListener('input', e => {
        const el = e.target;
        const lower = el.value.toLowerCase();
        if (lower === el.value) return;
        const { selectionStart, selectionEnd } = el;
        el.value = lower;
        el.setSelectionRange(selectionStart, selectionEnd);
    });

    // Password strength + hints
    $('fieldPassword').addEventListener('input', e => {
        updateStrengthUI(e.target.value);
        updateHints(e.target.value);
    });

    // Show / hide password eyes
    document.querySelectorAll('.toggle-pass').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.classList.toggle('showing', show);
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });

    $('cancelBtn').addEventListener('click', () => closeOverlay($('studentModal')));
    $('pageBtns').addEventListener('click', e => {
        const btn = e.target.closest('[data-page]');
        if (btn && !btn.disabled) goPage(Number(btn.dataset.page));
    });

    fetchStudents();
});