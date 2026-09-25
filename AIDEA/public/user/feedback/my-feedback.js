// my-feedback.js — Student side
// Follows the same session pattern as dashboard.js

const FB_API = 'http://127.0.0.1:8000/api/student';
const API_BASE = 'http://127.0.0.1:8000/api';

// ── Session helpers (mirrors dashboard.js) ─────────────────────────────────

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
        'Content-Type': 'application/json',
    };
}

function requireSession() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
        window.location.href = '../login/login.html';
        return null;
    }
    return { token, user };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
        position:fixed;bottom:28px;right:28px;
        background:${type === 'error' ? '#ef4444' : '#22c55e'};
        color:#fff;padding:12px 22px;border-radius:10px;
        font-weight:600;font-size:14px;z-index:9999;
        box-shadow:0 4px 16px rgba(0,0,0,0.15);
        transition:opacity .3s;
    `;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function starStr(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// ── Render user identity (mirrors dashboard.js renderUserIdentity) ──────────

function renderUserIdentity(user) {
    const fullName = user.full_name || user.name || 'Student';
    const course = user.course || 'Student';

    const parts = fullName.trim().split(' ');
    const initials = parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2);

    // Sidebar user card
    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-info h4');
    const roleEl = document.querySelector('.user-info p');
    if (avatarEl) avatarEl.textContent = initials.toUpperCase();
    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) roleEl.textContent = course.toUpperCase();
}

// ── Sidebar nav groups (MAIN / SERVICES / EVENTS) ───────────────────────────

function initNavGroups() {
    const toggles = document.querySelectorAll('.nav-group-toggle');

    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const group = toggle.closest('.nav-group');
            if (!group) return;
            group.classList.toggle('open');
        });
    });

    // Auto-expand whichever group holds the active page link.
    const activeGroup = document.querySelector('.nav-group .nav-item.active')?.closest('.nav-group');
    if (activeGroup) activeGroup.classList.add('open');
}

// ── Sidebar footer dropdown (My Profile / Sign Out) ─────────────────────────

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

// ── Sign out confirmation modal ──────────────────────────────────────────────

function initSignOutModal(token) {
    const overlay = document.getElementById('signoutModalOverlay');
    const cancelBtn = document.getElementById('signoutCancelBtn');
    const confirmBtn = document.getElementById('signoutConfirmBtn');
    if (!overlay) return;

    cancelBtn?.addEventListener('click', closeSignOutModal);
    confirmBtn?.addEventListener('click', () => performSignOut(token));

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

async function performSignOut(token) {
    if (token) {
        try {
            await fetch(`${API_BASE}/logout`, {
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

// ── Load feedbacks from API ────────────────────────────────────────────────

async function loadFeedbacks(token) {
    try {
        const res = await fetch(`${FB_API}/feedbacks`, { headers: authHeaders(token) });

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
            throw new Error(`Server returned ${res.status} — check API routes.`);
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load feedbacks.');

        // Update summary counts
        const countEl = document.querySelector('.fb-stat-num');
        const avgEl = document.querySelector('.avg-num');
        if (countEl) countEl.textContent = data.total_count;
        if (avgEl) avgEl.textContent = data.average_rating || '0';

        // Render list
        const prevList = document.getElementById('prevFeedbacks');
        prevList.innerHTML = '';

        if (!data.feedbacks.length) {
            prevList.innerHTML = '<p style="color:#9ca3af;font-size:13px;">No feedbacks yet.</p>';
            return;
        }

        data.feedbacks.forEach(f => prevList.insertAdjacentHTML('beforeend', buildFeedbackCard(f)));

    } catch (err) {
        console.warn('Feedbacks error:', err);
        showToast(err.message || 'Could not load feedbacks.', 'error');
    }
}

function buildFeedbackCard(f) {
    return `
        <div class="prev-fb-item" data-id="${f.id}">
            <div class="prev-fb-header">
                <strong>${f.feedback_type}</strong>
                <div class="prev-stars">${starStr(f.rating)}</div>
            </div>
            <p class="prev-fb-ref">${f.reference || 'General'}</p>
            <p class="prev-fb-comment">"${f.comment}"</p>
            <span class="prev-fb-date">${f.date}</span>
        </div>
    `;
}

// ── Main ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Guard — same as dashboard.js
    const session = requireSession();
    if (!session) return;

    const { token, user } = session;

    // Populate user identity from DB data stored at login
    renderUserIdentity(user);

    // Sidebar interactions
    initNavGroups();
    initSidebarDropdown();
    initSignOutModal(token);

    // ── Star rating widget ─────────────────────────────────────────────────

    let selectedRating = 0;
    const starEls = document.querySelectorAll('.star');
    const ratingLabel = document.getElementById('ratingLabel');
    const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

    function highlightStars(val) {
        starEls.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= val));
    }

    starEls.forEach(star => {
        star.addEventListener('mouseover', () => highlightStars(parseInt(star.dataset.val)));
        star.addEventListener('mouseleave', () => highlightStars(selectedRating));
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val);
            highlightStars(selectedRating);
            ratingLabel.textContent = `${selectedRating}/5 – ${labels[selectedRating]}`;
            ratingLabel.style.color = 'var(--accent)';
            ratingLabel.style.fontWeight = '700';
        });
    });

    // ── Submit feedback ────────────────────────────────────────────────────

    document.getElementById('submitFeedbackBtn')?.addEventListener('click', async () => {
        const feedback_type = document.getElementById('feedbackType').value;
        const reference = document.getElementById('feedbackRef').value.trim();
        const comment = document.getElementById('feedbackComment').value.trim();
        const recommend = document.querySelector('input[name="recommend"]:checked')?.value ?? null;

        if (!feedback_type) { showToast('Please select a feedback type.', 'error'); return; }
        if (!selectedRating) { showToast('Please select a rating.', 'error'); return; }
        if (!comment) { showToast('Please add your comments.', 'error'); return; }

        const btn = document.getElementById('submitFeedbackBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Submitting…';

        try {
            const res = await fetch(`${FB_API}/feedbacks`, {
                method: 'POST',
                headers: authHeaders(token),
                body: JSON.stringify({ feedback_type, reference, rating: selectedRating, comment, recommend }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Submission failed.');

            // Prepend new card instantly
            const prevList = document.getElementById('prevFeedbacks');
            const placeholder = prevList.querySelector('p');
            if (placeholder) placeholder.remove();
            prevList.insertAdjacentHTML('afterbegin', buildFeedbackCard(data.feedback));

            // Bump summary counter
            const countEl = document.querySelector('.fb-stat-num');
            if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;

            // Reset form
            document.getElementById('feedbackType').value = '';
            document.getElementById('feedbackRef').value = '';
            document.getElementById('feedbackComment').value = '';
            document.querySelectorAll('input[name="recommend"]').forEach(r => r.checked = false);
            selectedRating = 0;
            highlightStars(0);
            ratingLabel.textContent = 'Click to rate';
            ratingLabel.style.color = '';
            ratingLabel.style.fontWeight = '';

            showToast('Feedback submitted! Thank you. 🎉');

        } catch (err) {
            console.warn('Submit error:', err);
            showToast(err.message || 'Something went wrong.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '📤 Submit Feedback';
        }
    });

    // ── Load feedbacks on page open ────────────────────────────────────────

    loadFeedbacks(token);
});