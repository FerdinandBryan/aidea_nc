// manage-account.js — Admin "Manage Account" page
// Same session/theme/drawer conventions as dashboard.js, plus profile + password forms.

const ADMIN_API = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../../user/login/login.html';

// ── Session helpers ────────────────────────────────────────────────────────

function getToken() {
    return localStorage.getItem('auth_token') || null;
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function setUser(user) {
    try { localStorage.setItem('aidea_user', JSON.stringify(user)); } catch { }
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

// ── Sign out ───────────────────────────────────────────────────────────────

function performSignOut() {
    if (getToken()) {
        fetch(`${ADMIN_API}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => { });
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
            const first = cancel, last = confirmBtn;
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
}

// ── Utilities ──────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function initialsOf(fname, lname) {
    const f = (fname || '').trim();
    const l = (lname || '').trim();
    if (f && l) return (f[0] + l[0]).toUpperCase();
    if (f) return f.slice(0, 2).toUpperCase();
    return 'AD';
}

function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
}

function showMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-success', 'is-error');
    if (type) el.classList.add(type === 'success' ? 'is-success' : 'is-error');
}

// ── Theme (light / dark) — identical wiring to dashboard.js ───────────────

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

// ── Mobile drawer — identical wiring to dashboard.js ───────────────────────

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

// ── Profile menu (sidebar footer) — identical wiring to dashboard.js ──────

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

// ── Render admin identity (sidebar footer + account summary card) ─────────

function renderAdminIdentity(user) {
    const fullName = [user.fname, user.lname].filter(Boolean).join(' ') || 'Admin';
    const ini = initialsOf(user.fname, user.lname);

    const footerName = document.querySelector('.footer-name');
    const footerAvatar = document.querySelector('.footer-avatar');
    const footerRole = document.querySelector('.footer-role');
    if (footerAvatar) footerAvatar.textContent = ini;
    if (footerName) footerName.textContent = fullName;
    if (footerRole) footerRole.textContent = 'Administrator';

    setText('accountAvatar', ini);
    setText('accountName', fullName);
    setText('accountEmail', user.email || '');
}

// ── Load current admin profile into the form ───────────────────────────────
// Tries GET /api/admin/profile — falls back to the cached user object.

async function loadProfile() {
    const cached = getUser();
    if (cached) {
        renderAdminIdentity(cached);
        document.getElementById('fname').value = cached.fname || '';
        document.getElementById('lname').value = cached.lname || '';
        document.getElementById('email').value = cached.email || '';
    }

    try {
        const res = await fetch(`${ADMIN_API}/admin/profile`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) return; // keep the cached values shown above
        const data = await res.json();
        const user = data.data || data.user || data;
        if (!user) return;

        setUser({ ...cached, ...user });
        renderAdminIdentity(user);
        document.getElementById('fname').value = user.fname || '';
        document.getElementById('lname').value = user.lname || '';
        document.getElementById('email').value = user.email || '';
    } catch {
        // offline / endpoint unavailable — cached values already shown
    }
}

// ── Profile form submit ─────────────────────────────────────────────────────

function initProfileForm() {
    const form = document.getElementById('profileForm');
    const saveBtn = document.getElementById('profileSaveBtn');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;

        const payload = {
            fname: document.getElementById('fname').value.trim(),
            lname: document.getElementById('lname').value.trim(),
            email: document.getElementById('email').value.trim(),
        };

        setBtnLoading(saveBtn, true);
        showMsg('profileMsg', '', null);

        try {
            const res = await fetch(`${ADMIN_API}/admin/profile`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });

            if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Could not save your changes.');
            }

            const data = await res.json().catch(() => ({}));
            const updated = data.data || data.user || payload;
            setUser({ ...getUser(), ...updated });
            renderAdminIdentity({ ...getUser(), ...updated });
            showMsg('profileMsg', 'Profile updated.', 'success');
        } catch (err) {
            showMsg('profileMsg', err.message || 'Something went wrong. Try again.', 'error');
        } finally {
            setBtnLoading(saveBtn, false);
        }
    });
}

// ── Password form submit ────────────────────────────────────────────────────

function initPasswordForm() {
    const form = document.getElementById('passwordForm');
    const saveBtn = document.getElementById('passwordSaveBtn');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;

        const current = document.getElementById('currentPassword').value;
        const next = document.getElementById('newPassword').value;
        const confirm = document.getElementById('confirmPassword').value;

        if (next !== confirm) {
            showMsg('passwordMsg', 'New password and confirmation do not match.', 'error');
            return;
        }
        if (next.length < 8) {
            showMsg('passwordMsg', 'New password must be at least 8 characters.', 'error');
            return;
        }

        setBtnLoading(saveBtn, true);
        showMsg('passwordMsg', '', null);

        try {
            const res = await fetch(`${ADMIN_API}/admin/change-password`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    current_password: current,
                    password: next,
                    password_confirmation: confirm,
                }),
            });

            if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Could not update your password.');
            }

            form.reset();
            showMsg('passwordMsg', 'Password updated.', 'success');
        } catch (err) {
            showMsg('passwordMsg', err.message || 'Something went wrong. Try again.', 'error');
        } finally {
            setBtnLoading(saveBtn, false);
        }
    });
}

// ── Reviewer accounts (statistician / grammarian) ───────────────────────────

const asList = raw => Array.isArray(raw) ? raw : (raw?.data ?? []);

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function roleBadgeHtml(role) {
    const label = role === 'statistician' ? 'Statistician' : role === 'grammarian' ? 'Grammarian' : role || '—';
    const cls = role === 'statistician' ? 'badge-role-statistician' : role === 'grammarian' ? 'badge-role-grammarian' : '';
    return `<span class="badge ${cls}">${escHtml(label)}</span>`;
}

async function loadReviewerAccounts() {
    const tbody = document.getElementById('reviewerAccountsBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${ADMIN_API}/admin/reviewers`, { headers: authHeaders() });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        const list = asList(await res.json());

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty">No reviewer accounts yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(r => `
            <tr data-id="${r.id}">
                <td data-label="Name"><strong>${escHtml([r.fname, r.lname].filter(Boolean).join(' ') || '—')}</strong></td>
                <td data-label="Email">${escHtml(r.email || '—')}</td>
                <td data-label="Role">${roleBadgeHtml(r.role)}</td>
                <td data-label="Created">${formatDate(r.created_at)}</td>
                <td data-label="">
                    <button type="button" class="row-action-btn" data-remove-reviewer="${r.id}">Remove</button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('[data-remove-reviewer]').forEach(btn => {
            btn.addEventListener('click', () => removeReviewerAccount(btn.dataset.removeReviewer));
        });
    } catch {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">Couldn't load reviewer accounts. Check your connection and refresh.</td></tr>`;
    }
}

async function removeReviewerAccount(id) {
    if (!window.confirm('Remove this reviewer account? They will no longer be able to log in.')) return;

    try {
        const res = await fetch(`${ADMIN_API}/admin/reviewers/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
        if (!res.ok) throw new Error();
        await loadReviewerAccounts();
    } catch {
        window.alert("Couldn't remove that account. Try again.");
    }
}

function initCreateReviewerForm() {
    const form = document.getElementById('createReviewerForm');
    const saveBtn = document.getElementById('createReviewerBtn');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;

        const password = document.getElementById('revPassword').value;
        const confirm = document.getElementById('revPasswordConfirm').value;

        if (password !== confirm) {
            showMsg('createReviewerMsg', 'Password and confirmation do not match.', 'error');
            return;
        }
        if (password.length < 8) {
            showMsg('createReviewerMsg', 'Password must be at least 8 characters.', 'error');
            return;
        }

        const payload = {
            fname: document.getElementById('revFname').value.trim(),
            lname: document.getElementById('revLname').value.trim(),
            email: document.getElementById('revEmail').value.trim(),
            role: document.getElementById('revRole').value,
            password,
            password_confirmation: confirm,
        };

        setBtnLoading(saveBtn, true);
        showMsg('createReviewerMsg', '', null);

        try {
            const res = await fetch(`${ADMIN_API}/admin/reviewers`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });

            if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Could not create this account.');
            }

            form.reset();
            showMsg('createReviewerMsg', 'Account created.', 'success');
            await loadReviewerAccounts();
        } catch (err) {
            showMsg('createReviewerMsg', err.message || 'Something went wrong. Try again.', 'error');
        } finally {
            setBtnLoading(saveBtn, false);
        }
    });
}

// ── Show/hide password toggles ──────────────────────────────────────────────

function initPasswordToggles() {
    document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.setAttribute('aria-pressed', String(show));
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Guard — admin only
    const user = getUser();
    if (!getToken() || !user || !user.is_admin) {
        window.location.href = LOGIN_URL;
        return;
    }

    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();
    initPasswordToggles();
    initProfileForm();
    initPasswordForm();
    initCreateReviewerForm();

    loadProfile();
    loadReviewerAccounts();
});