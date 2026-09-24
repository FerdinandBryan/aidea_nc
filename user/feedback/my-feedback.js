// my-feedback.js — Student side
// Same shell behavior as dashboard.js / avail-services.js (session, theme,
// drawer, profile menu, sign-out modal) plus the feedback form + history.

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const FB_API = 'https://aideanc-production.up.railway.app/api/student';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme';

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

function escHtml(str) {
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

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
        position:fixed;bottom:24px;right:24px;
        background:${type === 'error' ? '#dc2626' : 'var(--ok-fg)'};
        color:#fff;padding:12px 20px;border-radius:10px;
        font-weight:600;font-size:13px;z-index:9999;
        box-shadow:0 4px 20px rgba(0,0,0,.2);
        transition:opacity .3s;
    `;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function starStr(n) {
    const val = Math.round(Number(n) || 0);
    return '★'.repeat(Math.max(0, Math.min(5, val))) + '☆'.repeat(5 - Math.max(0, Math.min(5, val)));
}

/* ══════════════════════════════════════════════════
   FEEDBACK LIST
══════════════════════════════════════════════════ */
function buildFeedbackCard(f) {
    return `
        <div class="prev-fb-item" data-id="${f.id}">
            <div class="prev-fb-header">
                <strong>${escHtml(f.feedback_type)}</strong>
                <div class="prev-stars">${starStr(f.rating)}</div>
            </div>
            <p class="prev-fb-ref">${escHtml(f.reference || 'General')}</p>
            <p class="prev-fb-comment">&ldquo;${escHtml(f.comment)}&rdquo;</p>
            <span class="prev-fb-date">${escHtml(f.date)}</span>
        </div>
    `;
}

async function loadFeedbacks() {
    try {
        const res = await fetch(`${FB_API}/feedbacks`, { headers: authHeaders() });

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
            throw new Error(`Server returned ${res.status} — check API routes.`);
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load feedbacks.');

        const countEl = document.querySelector('.fb-stat-num');
        const avgEl = document.querySelector('.avg-num');
        const avgStarsEl = document.querySelector('.avg-stars');
        if (countEl) countEl.textContent = data.total_count ?? 0;
        if (avgEl) avgEl.textContent = data.average_rating || '0';
        if (avgStarsEl) avgStarsEl.textContent = starStr(data.average_rating || 0);

        const prevList = document.getElementById('prevFeedbacks');
        prevList.innerHTML = '';

        if (!data.feedbacks || !data.feedbacks.length) {
            prevList.innerHTML = '<p class="fb-empty">No feedbacks yet.</p>';
            return;
        }

        data.feedbacks.forEach(f => prevList.insertAdjacentHTML('beforeend', buildFeedbackCard(f)));

    } catch (err) {
        console.warn('Feedbacks error:', err);
        const prevList = document.getElementById('prevFeedbacks');
        if (prevList) prevList.innerHTML = '<p class="fb-empty">Couldn’t load feedbacks. Check your connection and refresh.</p>';
        showToast(err.message || 'Could not load feedbacks.', 'error');
    }
}

/* ══════════════════════════════════════════════════
   STAR RATING WIDGET
══════════════════════════════════════════════════ */
let selectedRating = 0;
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

function initStarRating() {
    const starEls = document.querySelectorAll('.star');
    const ratingLabel = document.getElementById('ratingLabel');

    function highlightStars(val) {
        starEls.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val, 10) <= val));
    }

    starEls.forEach(star => {
        star.addEventListener('mouseover', () => highlightStars(parseInt(star.dataset.val, 10)));
        star.addEventListener('mouseleave', () => highlightStars(selectedRating));
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val, 10);
            highlightStars(selectedRating);
            ratingLabel.textContent = `${selectedRating}/5 — ${RATING_LABELS[selectedRating]}`;
            ratingLabel.style.color = 'var(--accent)';
            ratingLabel.style.fontWeight = '700';
        });
    });

    return { highlightStars, ratingLabel };
}

/* ══════════════════════════════════════════════════
   SUBMIT FEEDBACK
══════════════════════════════════════════════════ */
function initSubmitFeedback({ highlightStars, ratingLabel }) {
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
        btn.textContent = 'Submitting…';

        try {
            const res = await fetch(`${FB_API}/feedbacks`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ feedback_type, reference, rating: selectedRating, comment, recommend }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Submission failed.');

            const prevList = document.getElementById('prevFeedbacks');
            const placeholder = prevList.querySelector('.fb-empty');
            if (placeholder) placeholder.remove();
            prevList.insertAdjacentHTML('afterbegin', buildFeedbackCard(data.feedback));

            const countEl = document.querySelector('.fb-stat-num');
            if (countEl) countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;

            document.getElementById('feedbackType').value = '';
            document.getElementById('feedbackRef').value = '';
            document.getElementById('feedbackComment').value = '';
            document.querySelectorAll('input[name="recommend"]').forEach(r => r.checked = false);
            selectedRating = 0;
            highlightStars(0);
            ratingLabel.textContent = 'Click to rate';
            ratingLabel.style.color = '';
            ratingLabel.style.fontWeight = '';

            showToast('Feedback submitted! Thank you.');

        } catch (err) {
            console.warn('Submit error:', err);
            showToast(err.message || 'Something went wrong.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Submit feedback';
        }
    });
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

    const starCtrl = initStarRating();
    initSubmitFeedback(starCtrl);

    loadFeedbacks();
});