/* ══════════════════════════════════════════════════
   AIDEA — login.js
   Authenticates against POST /api/login (Laravel).
   Stores token + user object in localStorage so
   all other pages can read the session.
══════════════════════════════════════════════════ */

const API_BASE = 'http://127.0.0.1:8000/api';

/* ── Roles that get routed to the thesis reviewer page
      instead of the normal dashboard. Reviewer accounts
      (created from Manage Account → Create reviewer account)
      are NOT admins — is_admin is false for them — so this
      check has to run independently of the is_admin branch. ── */
const THESIS_REVIEWER_ROLES = ['statistician', 'grammarian'];
const LIBRARIAN_ROLES = ['librarian'];

/**
 * Decide where a logged-in user should land, based on
 * is_admin AND role. Checked in this order:
 *   1. reviewer role (statistician / grammarian) → Thesis_reviewer.html
 *   2. is_admin                                  → admin dashboard
 *   3. everyone else                             → regular dashboard
 */
function resolveRedirect(user) {
    const role = (user.role || user.position || '').toString().trim().toLowerCase();

    if (LIBRARIAN_ROLES.includes(role)) {
        return '../../admin/librarian/librarian_dashboard.html';
    }

    if (THESIS_REVIEWER_ROLES.includes(role)) {
        return '../../admin/thesis reviewer/Thesis_reviewer.html';
    }
    if (user.is_admin) {
        return '../../admin/dashboard/dashboard.html';
    }
    return '../dashboard/dashboard.html';
}

document.addEventListener('DOMContentLoaded', () => {

    /* ── GUARD: only run login logic on the login page ── */
    const isLoginPage = document.getElementById('loginForm') !== null;
    if (!isLoginPage) return;

    /* ── If already logged in, redirect away ───── */
    const existingToken = localStorage.getItem('auth_token');
    const existingUser = safeParseUser();
    if (existingToken && existingUser) {
        window.location.href = resolveRedirect(existingUser);
        return;
    }

    /* ── TOGGLE PASSWORD VISIBILITY ─────────────── */
    document.getElementById('togglePass')?.addEventListener('click', () => {
        const input = document.getElementById('loginPassword');
        const eyeShow = document.getElementById('eyeIconShow');
        const eyeHide = document.getElementById('eyeIconHide');
        if (input.type === 'password') {
            input.type = 'text';
            eyeShow.style.display = 'none';
            eyeHide.style.display = 'inline';
        } else {
            input.type = 'password';
            eyeShow.style.display = 'inline';
            eyeHide.style.display = 'none';
        }
    });

    /* ── REMEMBER ME — restore saved email ── */
    const savedEmail = localStorage.getItem('aidea_remember_email');
    if (savedEmail) {
        document.getElementById('loginEmail').value = savedEmail;
        document.getElementById('rememberMe').checked = true;
    }

    /* ── FORM SUBMIT ────────────────────────────── */
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);

        const payload = {
            email: document.getElementById('loginEmail').value.trim(),
            password: document.getElementById('loginPassword').value,
        };

        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            setLoading(false);

            if (data.success) {
                /* ── Save session to localStorage ── */
                localStorage.setItem('auth_token', data.token);
                localStorage.setItem('aidea_user', JSON.stringify(data.user));

                /* ── Remember me ── */
                if (document.getElementById('rememberMe').checked) {
                    localStorage.setItem('aidea_remember_email', payload.email);
                } else {
                    localStorage.removeItem('aidea_remember_email');
                }

                showToast('Login successful! Redirecting…', 'success');
                setTimeout(() => {
                    window.location.href = resolveRedirect(data.user);
                }, 1200);
            } else {
                showToast(data.message || 'Invalid credentials.', 'error');
            }

        } catch (err) {
            setLoading(false);
            console.error(err);
            showToast('Server error. Make sure Laravel is running.', 'error');
        }
    });

    /* ── VALIDATION ─────────────────────────────── */
    function validateForm() {
        clearErrors();
        let valid = true;

        const email = document.getElementById('loginEmail').value.trim();
        if (!email) {
            showFieldError('errEmail', 'Email is required');
            document.getElementById('loginEmail').classList.add('error');
            valid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showFieldError('errEmail', 'Enter a valid email address');
            document.getElementById('loginEmail').classList.add('error');
            valid = false;
        }

        const pass = document.getElementById('loginPassword').value;
        if (!pass) {
            showFieldError('errPassword', 'Password is required');
            document.getElementById('loginPassword').classList.add('error');
            valid = false;
        } else if (pass.length < 6) {
            showFieldError('errPassword', 'Password must be at least 6 characters');
            document.getElementById('loginPassword').classList.add('error');
            valid = false;
        }

        return valid;
    }

    function clearErrors() {
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        document.querySelectorAll('input.error').forEach(el => el.classList.remove('error'));
    }

    function showFieldError(id, msg) {
        const el = document.getElementById(id);
        if (el) el.textContent = msg;
    }

    /* ── LOADING STATE ──────────────────────────── */
    function setLoading(on) {
        const btn = document.getElementById('loginBtn');
        const text = document.getElementById('loginBtnText');
        const spinner = document.getElementById('loginBtnSpinner');
        btn.disabled = on;
        text.style.display = on ? 'none' : 'inline';
        spinner.style.display = on ? 'inline-block' : 'none';
    }

    /* ── TOAST ──────────────────────────────────── */
    function showToast(msg, type = 'info') {
        const wrap = document.getElementById('toastWrap');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    /* ── HELPERS ────────────────────────────────── */
    function safeParseUser() {
        try { return JSON.parse(localStorage.getItem('aidea_user')); }
        catch { return null; }
    }

});

/* ══════════════════════════════════════════════════
   SESSION HELPERS — import in any other page:

   Usage (top of any protected page's JS file):
   ─────────────────────────────────────────
   const session = AideaSession.require();
   // session.token  → Bearer token for API calls
   // session.user   → { id, fname, lname, mi, email, is_admin, role, ... }

══════════════════════════════════════════════════ */
window.AideaSession = {

    /** Get current user object or null */
    getUser() {
        try { return JSON.parse(localStorage.getItem('aidea_user')); }
        catch { return null; }
    },

    /** Get current token or null */
    getToken() {
        return localStorage.getItem('auth_token') || null;
    },

    /**
     * Call at the top of any protected page.
     * @returns {{ user, token }} or redirects to login.
     */
    require() {
        const token = this.getToken();
        const user = this.getUser();

        if (!token || !user) {
            window.location.href = this._loginPath();
            return null;
        }

        return { token, user };
    },

    /**
     * Call at the top of any admin-only page.
     * Redirects non-admins to their regular dashboard.
     * @returns {{ user, token }} or redirects.
     */
    requireAdmin() {
        const session = this.require();
        if (!session) return null;

        if (!session.user.is_admin) {
            window.location.href = '../dashboard/dashboard.html';
            return null;
        }

        return session;
    },

    /** Clear session and go to login */
    logout() {
        /* Fire-and-forget — revoke token on server */
        const token = this.getToken();
        if (token) {
            fetch('http://127.0.0.1:8000/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                },
            }).catch(() => { });
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('aidea_user');
        window.location.href = this._loginPath();
    },

    _loginPath() {
        /* Works regardless of how deep the current page is */
        const depth = window.location.pathname.split('/').filter(Boolean).length;
        return '../'.repeat(Math.max(depth - 1, 1)) + 'login/login.html';
    },
};