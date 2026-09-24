// repository.js — Repository (student side)
// Self-contained (like dashboard.js): reads the session from localStorage.
// Papers come from the admin's approved-thesis store in localStorage ('aidea_repository').

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme'; // shared with the other student pages
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

// ── Theme ──────────────────────────────────────────────────────────────────

const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
  $('themeBtn')?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
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

// ── Drawer, profile menu, sign-out modal ───────────────────────────────────

function initDrawer() {
  const sidebar = $('sidebar'), scrim = $('scrim'), btn = $('menuBtn');
  if (!sidebar || !scrim || !btn) return;

  const set = open => {
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    document.body.classList.toggle('no-scroll', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(!sidebar.classList.contains('open')));
  scrim.addEventListener('click', () => set(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
  window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) set(false); });
}

function initProfileMenu() {
  const btn = $('profileBtn'), menu = $('profileMenu');
  if (!btn || !menu) return;

  const setOpen = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  });
}

function initSignOutModal() {
  const modal = $('signOutModal'), cancel = $('signOutCancel'), confirmBtn = $('signOutConfirm');
  if (!modal || !cancel || !confirmBtn) return;

  const open = () => {
    $('profileMenu').hidden = true;
    $('profileBtn').setAttribute('aria-expanded', 'false');
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    cancel.focus();
  };
  const close = () => {
    modal.hidden = true;
    if (!$('sidebar')?.classList.contains('open')) document.body.classList.remove('no-scroll');
    $('profileBtn')?.focus();
  };

  $('signOutBtn')?.addEventListener('click', open);
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

function renderUserIdentity(user) {
  const fullName = user.full_name || user.name
    || [user.fname, user.lname].filter(Boolean).join(' ') || 'Student';
  const parts = fullName.trim().split(/\s+/);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();

  const q = s => document.querySelector(s);
  if (q('.footer-avatar')) q('.footer-avatar').textContent = initials;
  if (q('.footer-name')) q('.footer-name').textContent = fullName;
  if (q('.footer-role')) q('.footer-role').textContent = user.course || 'Student';
}

// ── Repository ─────────────────────────────────────────────────────────────

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
  const modal = $('paperModal');
  let papers = getRepository();
  let visible = [];
  let search = '', course = '', year = '';
  let lastTrigger = null;

  function populateFilters() {
    const years = [...new Set(papers.map(p => p.year).filter(Boolean).map(String))].sort((a, b) => b - a);
    const courses = [...new Set(papers.map(p => p.course).filter(Boolean))].sort();

    // keep the current selection if it still exists
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
                        <button class="btn-secondary btn-sm" type="button" data-i="${i}">Details</button>
                        ${url
          ? `<a class="btn-primary btn-sm" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">Read paper</a>`
          : `<span class="btn-disabled" title="No file available">No file</span>`}
                    </div>
                </div>
            </article>`;
    }).join('');
  }

  // — details modal —
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
                <button class="btn-secondary" type="button" id="paperDone">Close</button>
                ${url
        ? `<a class="btn-primary" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">Read paper</a>`
        : `<span class="btn-disabled">No file available</span>`}
            </div>`;
    $('paperDone').addEventListener('click', closeModal);

    modal.hidden = false;
    document.body.classList.add('no-scroll');
    $('paperClose').focus();
  }

  function closeModal() {
    modal.hidden = true;
    if (!$('sidebar')?.classList.contains('open')) document.body.classList.remove('no-scroll');
    lastTrigger?.focus?.();
  }

  grid.addEventListener('click', e => {
    const btn = e.target.closest('button[data-i]');
    if (btn) openModal(Number(btn.dataset.i), btn);
  });
  $('paperClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // — filters —
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
  initRepository();
});