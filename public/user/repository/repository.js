// repository.js — Repository (student side)
// Self-contained, like dashboard.js: reads the session from localStorage
// and talks to the real Laravel API. Papers come from the admin's
// approved-thesis store in localStorage ('aidea_repository').

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme';
const REPO_KEY = 'aidea_repository';

const $ = id => document.getElementById(id);

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Only allow normal file links (blocks javascript: and similar)
function safeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u, window.location.href);
    const ok = ['http:', 'https:', 'blob:', 'file:'].includes(url.protocol)
      || /^data:application\//i.test(url.href);
    return ok ? url.href : null;
  } catch { return null; }
}

// ── Session ────────────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem('auth_token') || null;

function getUser() {
  try { return JSON.parse(localStorage.getItem('aidea_user')); }
  catch { return null; }
}

function requireSession() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) {
    window.location.href = LOGIN_URL;
    return null;
  }
  return { token, user };
}

async function performSignOut() {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
    } catch { /* clear the session locally regardless */ }
  }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('aidea_user');
  window.location.href = LOGIN_URL;
}

function renderUserIdentity(user) {
  const fullName = user.full_name || user.name
    || [user.fname, user.lname].filter(Boolean).join(' ') || 'Student';
  const parts = fullName.trim().split(/\s+/);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();

  const avatarEl = document.querySelector('.user-avatar');
  const nameEl = document.querySelector('.user-name');
  const roleEl = document.querySelector('.user-role');
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = fullName;
  if (roleEl) roleEl.textContent = user.course || 'Student';
}

// ── Theme ──────────────────────────────────────────────────────────────────

const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
  $('themeBtn')?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
}

function initTheme() {
  applyTheme(currentTheme(), false);
  $('themeBtn')?.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', e => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { }
    if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
  });
}

// ── Sidebar nav-group accordions (same behavior as dashboard.js) ──────────

function initNavGroups() {
  const toggles = document.querySelectorAll('.nav-group-toggle');

  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const group = toggle.closest('.nav-group');
      if (group) group.classList.toggle('open');
    });
  });

  // Auto-expand whichever group holds the active page link.
  const activeGroup = document.querySelector('.nav-group .nav-item.active')?.closest('.nav-group');
  if (activeGroup) activeGroup.classList.add('open');
}

// ── Sidebar footer dropdown (same behavior as dashboard.js) ───────────────

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

// ── Sign-out confirmation modal (same markup/behavior as dashboard.js) ────

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

// ── Repository grid ─────────────────────────────────────────────────────────

function getRepository() {
  try {
    const list = JSON.parse(localStorage.getItem(REPO_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function formatDate(raw) {
  const d = new Date(raw);
  return raw && !isNaN(d)
    ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
}

function initRepository() {
  const grid = $('repoGrid');
  const modalOverlay = $('paperModalOverlay');
  let papers = getRepository();
  let visible = [];
  let search = '', course = '', year = '';
  let lastTrigger = null;

  function populateFilters() {
    const years = [...new Set(papers.map(p => p.year).filter(Boolean).map(String))].sort((a, b) => b - a);
    const courses = [...new Set(papers.map(p => p.course).filter(Boolean))].sort();

    $('yearFilter').innerHTML = '<option value="">All years</option>'
      + years.map(y => `<option value="${escHtml(y)}"${y === year ? ' selected' : ''}>${escHtml(y)}</option>`).join('');
    $('courseFilter').innerHTML = '<option value="">All courses</option>'
      + courses.map(c => `<option value="${escHtml(c)}"${c === course ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
  }

  const empty = (title, sub) =>
    `<div class="repo-empty"><strong>${title}</strong><p>${sub}</p></div>`;

  function render() {
    visible = papers.filter(p => {
      const matchSearch = !search
        || (p.title || '').toLowerCase().includes(search)
        || (p.authors || '').toLowerCase().includes(search)
        || (p.abstract || '').toLowerCase().includes(search);
      return matchSearch
        && (!course || p.course === course)
        && (!year || String(p.year) === year);
    });

    $('resultCount').textContent = papers.length
      ? `Showing ${visible.length} of ${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}`
      : '\u00a0';

    if (!papers.length) {
      grid.innerHTML = empty('No papers in the repository yet',
        'Papers approved by the Research Office will appear here.');
      return;
    }
    if (!visible.length) {
      grid.innerHTML = empty('No papers match your search', 'Try a different keyword or clear a filter.');
      return;
    }

    grid.innerHTML = visible.map((p, i) => {
      const url = safeUrl(p.fileUrl);
      return `
            <article class="repo-card">
                <div class="repo-meta">
                    <span class="repo-course">${escHtml(p.course || '—')}</span>
                    <span class="repo-year">${escHtml(p.year || '—')}</span>
                </div>
                <h4 class="repo-title">${escHtml(p.title)}</h4>
                <p class="repo-people"><strong>Authors:</strong> ${escHtml(p.authors || 'Unknown')}</p>
                ${p.adviser ? `<p class="repo-people"><strong>Adviser:</strong> ${escHtml(p.adviser)}</p>` : ''}
                <p class="repo-abstract">${escHtml(p.abstract || 'No abstract available.')}</p>
                <div class="repo-footer">
                    <span class="repo-added">Added ${formatDate(p.addedAt)}</span>
                    <div class="repo-actions">
                        <button class="btn-ghost" type="button" data-i="${i}">Details</button>
                        ${url
          ? `<a class="btn-read" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">Read paper</a>`
          : `<span class="btn-disabled" title="No file available">No file</span>`}
                    </div>
                </div>
            </article>`;
    }).join('');
  }

  function openModal(i, trigger) {
    const p = visible[i];
    if (!p) return;
    lastTrigger = trigger;
    const url = safeUrl(p.fileUrl);

    $('paperTitle').textContent = p.title || 'Paper details';
    $('paperBody').innerHTML = `
            <dl class="detail-list">
                <dt>Course</dt><dd>${escHtml(p.course || '—')}</dd>
                <dt>Year</dt><dd>${escHtml(p.year || '—')}</dd>
                <dt>Authors</dt><dd>${escHtml(p.authors || 'Unknown')}</dd>
                <dt>Adviser</dt><dd>${escHtml(p.adviser || '—')}</dd>
                <dt>Added</dt><dd>${formatDate(p.addedAt)}</dd>
            </dl>
            <div class="abstract-block">
                <h4>Abstract</h4>
                <p>${escHtml(p.abstract || 'No abstract available.')}</p>
            </div>
            <div class="modal-foot">
                <button class="btn-ghost" type="button" id="paperDone">Close</button>
                ${url
        ? `<a class="btn-read" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">Read paper</a>`
        : `<span class="btn-disabled">No file available</span>`}
            </div>`;
    $('paperDone').addEventListener('click', closeModal);

    modalOverlay.classList.add('open');
    $('paperClose').focus();
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    lastTrigger?.focus?.();
  }

  grid.addEventListener('click', e => {
    const btn = e.target.closest('button[data-i]');
    if (btn) openModal(Number(btn.dataset.i), btn);
  });
  $('paperClose').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal();
  });

  $('repoSearch').addEventListener('input', e => { search = e.target.value.trim().toLowerCase(); render(); });
  $('courseFilter').addEventListener('change', e => { course = e.target.value; render(); });
  $('yearFilter').addEventListener('change', e => { year = e.target.value; render(); });

  // live sync when the admin updates the repository in another tab
  window.addEventListener('storage', e => {
    if (e.key !== REPO_KEY) return;
    papers = getRepository();
    populateFilters();
    render();
  });

  populateFilters();
  render();
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const session = requireSession();
  if (!session) return;

  renderUserIdentity(session.user);
  initTheme();
  initSidebarDropdown();
  initNavGroups();
  initSignOutModal();
  initRepository();
});