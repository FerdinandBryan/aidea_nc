/* ══════════════════════════════════════════════════
   AIDEA – dashboard.js  (fully self-contained)
   No dependency on login.js — reads localStorage
   directly and calls the Laravel API with Bearer token.
══════════════════════════════════════════════════ */

const DASH_API = 'http://127.0.0.1:8000/api';

/* ── Session helpers (inline, no AideaSession needed) ── */
function getToken() {
    return localStorage.getItem('auth_token') || null;
}

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function authHeaders(token) {
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
    };
}

/* ── Guard: redirect to login if no session ─────── */
function requireSession() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
        window.location.href = '../login/login.html';
        return null;
    }
    return { token, user };
}


/* ══════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {

    const session = requireSession();
    if (!session) return;

    const { token, user } = session;

    renderUserIdentity(user);
    initSidebarDropdown();
    initSignOutModal();
    initNavGroups();

    await Promise.all([
        loadDashboardStats(token),
        loadRecentSubmissions(token),
        loadUpcomingEvents(token),
    ]);

    animateStats();
});


/* ────────────────────────────────────────────────
   Render sidebar + topbar from real user object
   ──────────────────────────────────────────────── */
function renderUserIdentity(user) {
    const fullName = user.full_name || user.name || 'Student';
    const course = user.course || 'Student';
    const firstName = fullName.split(' ')[0];

    const parts = fullName.trim().split(' ');
    const initials = parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2);

    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-name');
    const roleEl = document.querySelector('.user-role');
    if (avatarEl) avatarEl.textContent = initials.toUpperCase();
    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) roleEl.textContent = course;

    const subEl = document.querySelector('.page-sub');
    if (subEl) subEl.textContent = `Welcome back, ${firstName}!`;
}


/* ────────────────────────────────────────────────
   Sidebar nav groups (MAIN / SERVICES / EVENTS)
   Click a group label to expand/collapse it.
   ──────────────────────────────────────────────── */
function initNavGroups() {
    const toggles = document.querySelectorAll('.nav-group-toggle');

    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const group = toggle.closest('.nav-group');
            if (!group) return;

            // If the group contains the currently active nav-item, keep
            // things simple: any group can be open independently of others.
            group.classList.toggle('open');
        });
    });

    // Auto-expand whichever group holds the active page link.
    const activeGroup = document.querySelector('.nav-group .nav-item.active')?.closest('.nav-group');
    if (activeGroup) activeGroup.classList.add('open');
}


/* ────────────────────────────────────────────────
   Sidebar footer dropdown (My Profile / Sign Out)
   Clicking the footer no longer navigates directly —
   it toggles a small menu instead.
   ──────────────────────────────────────────────── */
function initSidebarDropdown() {
    const sidebarUser = document.getElementById('sidebarUser');
    const dropdown = document.getElementById('userDropdown');
    const signOutBtn = document.getElementById('dropdownSignOutBtn');
    if (!sidebarUser || !dropdown) return;

    function closeDropdown() {
        sidebarUser.classList.remove('open');
    }

    // Toggle the dropdown when the footer itself is clicked,
    // but not when a menu item inside it is clicked.
    sidebarUser.addEventListener('click', (e) => {
        if (dropdown.contains(e.target)) return;
        sidebarUser.classList.toggle('open');
    });

    // Close when clicking anywhere outside the sidebar footer.
    document.addEventListener('click', (e) => {
        if (!sidebarUser.contains(e.target)) closeDropdown();
    });

    // Close on Escape.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
    });

    // "Sign Out" in the dropdown opens the confirmation modal.
    if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDropdown();
            openSignOutModal();
        });
    }
}


/* ────────────────────────────────────────────────
   Sign out confirmation modal
   ──────────────────────────────────────────────── */
function initSignOutModal() {
    const overlay = document.getElementById('signoutModalOverlay');
    const cancelBtn = document.getElementById('signoutCancelBtn');
    const confirmBtn = document.getElementById('signoutConfirmBtn');
    if (!overlay) return;

    cancelBtn?.addEventListener('click', closeSignOutModal);
    confirmBtn?.addEventListener('click', performSignOut);

    // Click outside the box closes the modal.
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

/* Kept for backward compatibility with any inline onclick="handleSignOut()" */
function handleSignOut() {
    openSignOutModal();
}

async function performSignOut() {
    const token = getToken();
    if (token) {
        try {
            await fetch(`${DASH_API}/logout`, {
                method: 'POST',
                headers: authHeaders(token),
            });
        } catch {
            // ignore network errors — clear session locally regardless
        }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
    window.location.href = '../login/login.html';
}


/* ────────────────────────────────────────────────
   Stat cards  GET /api/dashboard/stats
   ──────────────────────────────────────────────── */
async function loadDashboardStats(token) {
    try {
        const res = await fetch(`${DASH_API}/dashboard/stats`, {
            headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`Stats ${res.status}`);
        const data = await res.json();

        setText('stat-submissions', data.submissions ?? '—');
        setText('stat-approved', data.approved ?? '—');
        setText('stat-paid', data.total_paid != null
            ? '₱' + Number(data.total_paid).toLocaleString()
            : '₱0');
        setText('stat-rating', data.avg_rating ?? '—');
    } catch (err) {
        console.warn('Stats error:', err);
    }
}


/* ────────────────────────────────────────────────
   Submissions table  GET /api/submissions?limit=5
   ──────────────────────────────────────────────── */
async function loadRecentSubmissions(token) {
    const tbody = document.getElementById('thesis-tbody');
    if (!tbody) return;

    try {
        const res = await fetch(`${DASH_API}/submissions?limit=5`, {
            headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`Submissions ${res.status}`);
        const list = await res.json();
        const submissions = Array.isArray(list) ? list : (list.data ?? []);

        if (!submissions.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:#888;">No submissions yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = submissions.map(t => `
            <tr>
                <td>${escHtml(t.title)}</td>
                <td>${formatMonth(t.submitted_at)}</td>
                <td>${statusBadge(t.status)}</td>
                <td><button class="btn-action" onclick="viewThesis(${t.id})">View</button></td>
            </tr>
        `).join('');

    } catch (err) {
        console.warn('Submissions error:', err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:#888;">Could not load submissions.</td></tr>`;
    }
}


/* ────────────────────────────────────────────────
   Events list  GET /api/events/upcoming
   ──────────────────────────────────────────────── */
async function loadUpcomingEvents(token) {
    const listEl = document.getElementById('event-list');
    if (!listEl) return;

    try {
        const res = await fetch(`${DASH_API}/events/upcoming`, {
            headers: authHeaders(token),
        });
        if (!res.ok) throw new Error(`Events ${res.status}`);
        const list = await res.json();
        const events = Array.isArray(list) ? list : (list.data ?? []);

        if (!events.length) {
            listEl.innerHTML = `<p style="padding:1rem;color:#888;font-size:.875rem;">No upcoming events.</p>`;
            return;
        }

        listEl.innerHTML = events.map(ev => {
            const d = new Date(ev.starts_at);
            const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            const day = d.getDate();
            const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `
                <div class="event-item">
                    <div class="event-date">
                        <span class="month">${month}</span>
                        <span class="day">${day}</span>
                    </div>
                    <div class="event-info">
                        <p class="event-title">${escHtml(ev.title)}</p>
                        <p class="event-loc">
                            <i class="fa-solid fa-location-dot"></i>
                            ${escHtml(ev.location || '')}${ev.location && time ? ', ' : ''}${time}
                        </p>
                    </div>
                </div>`;
        }).join('');

    } catch (err) {
        console.warn('Events error:', err);
    }
}


/* ────────────────────────────────────────────────
   Animations
   ──────────────────────────────────────────────── */
function animateStats() {
    document.querySelectorAll('.stat-card').forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(16px)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 80 * i);
    });
}


/* ────────────────────────────────────────────────
   Navigation
   ──────────────────────────────────────────────── */
function viewThesis(id) {
    window.location.href = `../my submission/my-submissions.html?id=${id}`;
}


/* ────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────── */
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatMonth(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function statusBadge(status) {
    const map = {
        approved: ['badge-approved', '✔ Approved'],
        rejected: ['badge-rejected', '✖ Rejected'],
        under_review: ['badge-review', '⏳ Under Review'],
        pending: ['badge-review', '⏳ Pending'],
        revision: ['badge-revision', '✏ For Revision'],
    };
    const key = (status || '').toLowerCase().replace(/\s+/g, '_');
    const [cls, label] = map[key] ?? ['badge-review', status ?? '—'];
    return `<span class="badge ${cls}">${label}</span>`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}