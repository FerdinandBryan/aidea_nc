// repository.js - Repository (student side)
// Papers are loaded from the backend: GET /api/public/thesis
// (approved + visible_in_repo). "Read paper" streams the file from
// /api/thesis/file/{id} using the student's login token.

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme'; // shared with the other student pages

const $ = id => document.getElementById(id);

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -- Session --

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

// -- Theme --

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

// -- Drawer, profile menu, sign-out modal --

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

// -- Repository data (from the backend) --

async function fetchPapers() {
  const headers = { 'Accept': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/public/thesis`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json.data || []);

  return rows.map(t => ({
    id: t.id,
    title: t.title || 'Untitled',
    authors: t.authors || t.author || '',
    adviser: t.adviser || t.adviser_name || '',
    course: t.course || '',
    year: t.academic_year || t.year || '',
    abstract: t.abstract || '',
    addedAt: t.created_at || '',
    hasFile: Boolean(t.has_file) && t.id != null,
    hasImrad: Boolean(t.has_imrad) && t.id != null,
  }));
}

// REPO-PREVIEW-V1: read in a modal, download with the student's token
async function fetchPaperBlob(id, type) {
  const token = getToken();
  if (!token) { window.location.href = LOGIN_URL; return null; }
  const res = await fetch(`${API_BASE}/thesis/file/${encodeURIComponent(id)}${type ? '?type=' + type : ''}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': '*/*' },
  });
  if (res.status === 401) { window.location.href = LOGIN_URL; return null; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const ct = (res.headers.get('Content-Type') || blob.type || '').toLowerCase();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  let name = ''; try { name = m ? decodeURIComponent(m[1]) : ''; } catch { name = m ? m[1] : ''; }
  const isPdf = ct.includes('pdf') || /\.pdf$/i.test(name);
  const ext = isPdf ? '.pdf' : /wordprocessingml/.test(ct) ? '.docx' : /msword/.test(ct) ? '.doc' : (name.includes('.') ? '.' + name.split('.').pop() : '');
  return { blob, isPdf, ext };
}

function paperTitleFor(btn) {
  return (btn && btn.closest && btn.closest('.repo-card')?.querySelector('.repo-title')?.textContent)
    || document.getElementById('paperTitle')?.textContent || 'paper';
}

// REPO-SAVEAS: Save As window so the student can pick the folder and file name
async function saveBlob(blob, suggested) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: suggested });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // student cancelled
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function paperFileName(title, type, ext) {
  const base = String(title || 'paper').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'paper';
  return base + (type === 'imrad' ? ' - IMRAD' : '') + ext;
}

function showPaperPreview(file, title, type) {
  const url = URL.createObjectURL(file.blob);
  const bg = document.createElement('div');
  bg.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:2vh 2vw';
  const box = document.createElement('div');
  box.style.cssText = 'width:96vw;height:94vh;display:flex;flex-direction:column;background:#fff;color:#111;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #ddd';
  const t = document.createElement('strong');
  t.textContent = title + (type === 'imrad' ? ' (IMRAD)' : '');
  t.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const btnCss = 'padding:8px 18px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#111';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.textContent = 'Close'; closeBtn.style.cssText = btnCss;
  head.append(t, closeBtn);
  box.appendChild(head);
  if (file.isPdf) {
    const fr = document.createElement('iframe');
    fr.title = 'File preview';
    fr.src = url;
    fr.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
    box.appendChild(fr);
  } else {
    const msg = document.createElement('div');
    msg.style.cssText = 'flex:1;display:grid;place-items:center;padding:24px;text-align:center;font-size:15px';
    msg.textContent = 'Preview is not available for Word files. Use Download to open this paper.';
    box.appendChild(msg);
  }
  bg.appendChild(box);
  document.body.appendChild(bg);
  const close = () => { bg.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey, true); };
  const onKey = ev => { if (ev.key === 'Escape') { ev.stopImmediatePropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  bg.addEventListener('click', ev => { if (ev.target === bg) close(); });
  closeBtn.addEventListener('click', close);
}

async function openPaperFile(id, btn, type) {
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Opening...'; }
  try {
    const file = await fetchPaperBlob(id, type);
    if (file) showPaperPreview(file, paperTitleFor(btn), type);
  } catch {
    alert('Sorry, this paper could not be opened right now. Please try again later.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function downloadPaperFile(id, btn, type) {
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
  try {
    const file = await fetchPaperBlob(id, type);
    if (file) await saveBlob(file.blob, paperFileName(paperTitleFor(btn), type, file.ext));
  } catch {
    alert('The file could not be downloaded. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

function formatDate(raw) {
  const d = new Date(raw);
  return raw && !isNaN(d)
    ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '\u2014';
}

// -- Repository UI --

async function initRepository() {
  const grid = $('repoGrid');
  const modal = $('paperModal');
  let papers = [];
  let visible = [];
  let search = '', course = '', year = '';
  let lastTrigger = null;

  const empty = (title, sub) =>
    `<div class="repo-empty"><strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}</div>`;

  function populateFilters() {
    const years = [...new Set(papers.map(p => p.year).filter(Boolean).map(String))]
      .sort((a, b) => b.localeCompare(a));
    const courses = [...new Set(papers.map(p => p.course).filter(Boolean))].sort();

    $('yearFilter').innerHTML = '<option value="">All years</option>'
      + years.map(y => `<option value="${escHtml(y)}"${y === year ? ' selected' : ''}>${escHtml(y)}</option>`).join('');
    $('courseFilter').innerHTML = '<option value="">All courses</option>'
      + courses.map(c => `<option value="${escHtml(c)}"${c === course ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
  }

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

    grid.innerHTML = visible.map((p, i) => `
            <article class="repo-card">
                <div class="repo-meta">
                    <span class="repo-course">${escHtml(p.course || '\u2014')}</span>
                    <span class="repo-year">${escHtml(p.year || '\u2014')}</span>
                </div>
                <h4 class="repo-title">${escHtml(p.title)}</h4>
                <p class="repo-people"><strong>Authors:</strong> ${escHtml(p.authors || 'Unknown')}</p>
                ${p.adviser ? `<p class="repo-people"><strong>Adviser:</strong> ${escHtml(p.adviser)}</p>` : ''}
                <p class="repo-abstract">${escHtml(p.abstract || 'No abstract available.')}</p>
                <div class="repo-footer">
                    <span class="repo-added">Added ${formatDate(p.addedAt)}</span>
                    <div class="repo-actions">
                        <button class="btn-secondary btn-sm" type="button" data-i="${i}">Details</button>
                        ${p.hasFile
        ? `<button class="btn-primary btn-sm" type="button" data-read="${escHtml(p.id)}">Read paper</button>`
        : `<span class="btn-disabled" title="No file available">No file</span>`}
                    </div>
                </div>
            </article>`).join('');
  }

  // -- details modal --
  function openModal(i, trigger) {
    const p = visible[i];
    if (!p) return;
    lastTrigger = trigger;

    $('paperTitle').textContent = p.title || 'Paper details';
    $('paperBody').innerHTML = `
            <dl class="detail-list">
                <dt>Course</dt><dd>${escHtml(p.course || '\u2014')}</dd>
                <dt>Year</dt><dd>${escHtml(p.year || '\u2014')}</dd>
                <dt>Authors</dt><dd>${escHtml(p.authors || 'Unknown')}</dd>
                <dt>Adviser</dt><dd>${escHtml(p.adviser || '\u2014')}</dd>
                <dt>Added</dt><dd>${formatDate(p.addedAt)}</dd>
            </dl>
            <div class="abstract-block">
                <h4>Abstract</h4>
                <p>${escHtml(p.abstract || 'No abstract available.')}</p>
            </div>
            <div class="modal-foot">
                <button class="btn-secondary" type="button" id="paperDone">Close</button>
                ${p.hasFile
        ? `<button class="btn-primary" type="button" data-read="${escHtml(p.id)}">Read paper</button>`
        : `<span class="btn-disabled">No file available</span>`}
                ${p.hasImrad ? `<button class="btn-secondary" type="button" id="paperImrad">Read IMRAD</button>` : ''}
                ${p.hasFile ? `<button class="btn-secondary" type="button" id="paperDownload">Download</button>` : ''}
                ${p.hasImrad ? `<button class="btn-secondary" type="button" id="paperImradDownload">Download IMRAD</button>` : ''}
            </div>`;
    $('paperDone').addEventListener('click', closeModal);
    const imBtn = $('paperImrad');
    if (imBtn) imBtn.addEventListener('click', () => openPaperFile(p.id, imBtn, 'imrad'));
    const dlBtn = $('paperDownload');
    if (dlBtn) dlBtn.addEventListener('click', () => downloadPaperFile(p.id, dlBtn));
    const dlImBtn = $('paperImradDownload');
    if (dlImBtn) dlImBtn.addEventListener('click', () => downloadPaperFile(p.id, dlImBtn, 'imrad'));

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
    const readBtn = e.target.closest('button[data-read]');
    if (readBtn) { openPaperFile(readBtn.dataset.read, readBtn); return; }
    const detailsBtn = e.target.closest('button[data-i]');
    if (detailsBtn) openModal(Number(detailsBtn.dataset.i), detailsBtn);
  });
  $('paperBody').addEventListener('click', e => {
    const readBtn = e.target.closest('button[data-read]');
    if (readBtn) openPaperFile(readBtn.dataset.read, readBtn);
  });
  $('paperClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // -- filters --
  $('repoSearch').addEventListener('input', e => { search = e.target.value.trim().toLowerCase(); render(); });
  $('courseFilter').addEventListener('change', e => { course = e.target.value; render(); });
  $('yearFilter').addEventListener('change', e => { year = e.target.value; render(); });

  // -- load from the backend --
  async function load() {
    grid.innerHTML = empty('Loading papers...', '');
    try {
      papers = await fetchPapers();
      populateFilters();
      render();
    } catch {
      $('resultCount').textContent = '\u00a0';
      grid.innerHTML = empty('Could not load the repository',
        'Please check your connection and <a href="#" id="repoRetry">try again</a>.');
      $('repoRetry')?.addEventListener('click', e => { e.preventDefault(); load(); });
    }
  }

  await load();
}

// -- Boot --

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