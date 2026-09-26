// my-profile.js — My Profile (student side)
// Reads/saves via the real /api/profile endpoints. localStorage.aidea_user
// is kept in sync only as a cache for other pages (dashboard footer etc.).

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme';

const $ = id => document.getElementById(id);

// -- Session ----------------------------------------------------------------

const getToken = () => localStorage.getItem('auth_token') || null;

function getUser() {
  try { return JSON.parse(localStorage.getItem('aidea_user')); }
  catch { return null; }
}

function saveUser(user) {
  try { localStorage.setItem('aidea_user', JSON.stringify(user)); } catch { }
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

// -- API helper ---------------------------------------------------------------

async function api(path, options = {}) {
  const token = getToken();
  const headers = Object.assign(
    { 'Accept': 'application/json' },
    options.headers || {}
  );
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.json) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.json ? JSON.stringify(options.json) : options.body,
  });

  if (res.status === 401) {
    await performSignOut();
    throw new Error('Unauthorized');
  }

  let data = null;
  try { data = await res.json(); } catch { }

  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// -- Theme ------------------------------------------------------------------

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

// -- Drawer, profile menu, sign-out modal -----------------------------------

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

// -- Identity helpers -------------------------------------------------------

function makeInitials(first, last) {
  return ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase() || 'ST';
}

function roleLabel(user) {
  if (user.is_admin) return 'Admin';
  if (user.role) return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  return 'Student';
}

function setAvatar(el, user, initials) {
  if (!el) return;
  el.textContent = '';
  if (user.avatar_url) {
    const img = document.createElement('img');
    img.src = user.avatar_url;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = initials;
  }
}

function renderIdentity(user) {
  const first = user.fname || '';
  const last = user.lname || '';
  const fullName = [first, last].filter(Boolean).join(' ') || 'Student';
  const initials = makeInitials(first, last);
  const role = roleLabel(user);

  const q = s => document.querySelector(s);
  setAvatar(q('.footer-avatar'), user, initials);
  if (q('.footer-name')) q('.footer-name').textContent = fullName;
  if (q('.footer-role')) q('.footer-role').textContent = role;

  setAvatar($('avatarCircle'), user, initials);
  if ($('removePhoto')) $('removePhoto').hidden = !user.avatar_url;
  if ($('changePhoto')) $('changePhoto').textContent = user.avatar_url ? 'Change photo' : 'Upload photo';
  $('displayName').textContent = fullName;
  $('displayRole').textContent = role;
  $('displayEmail').textContent = user.email || '';
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = msg;
  $('toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// -- Personal information form ----------------------------------------------

function initProfileForm(user) {
  const form = $('profileForm');
  const toggleBtn = $('toggleEdit');
  const actions = $('formActions');
  const fields = [...form.querySelectorAll('input, select')];
  let editing = false;

  const fill = () => {
    $('firstName').value = user.fname || '';
    $('lastName').value = user.lname || '';
    $('email').value = user.email || '';
  };

  const setEditing = on => {
    editing = on;
    fields.forEach(f => { f.disabled = !on; });
    actions.hidden = !on;
    toggleBtn.textContent = on ? 'Cancel' : 'Edit';
    if (on) $('firstName').focus();
  };

  toggleBtn.addEventListener('click', () => {
    if (editing) fill(); // cancel: restore saved values
    setEditing(!editing);
  });
  $('cancelEdit').addEventListener('click', () => { fill(); setEditing(false); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const first = $('firstName').value.trim();
    const last = $('lastName').value.trim();
    const email = $('email').value.trim();

    if (!first) { toast('First name is required.', 'error'); return; }
    if (!last) { toast('Last name is required.', 'error'); return; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { toast('Enter a valid email address.', 'error'); return; }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const data = await api('/profile', {
        method: 'PUT',
        json: { fname: first, lname: last, email },
      });
      Object.assign(user, data.user);
      saveUser(user);
      renderIdentity(user);
      setEditing(false);
      toast('Profile updated successfully!');
    } catch (err) {
      const msg = err.data?.errors
        ? Object.values(err.data.errors).flat().join(' ')
        : err.message;
      toast(msg || 'Could not update profile.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  fill();
}

// -- Password form ----------------------------------------------------------

function initPasswordForm() {
  const toggleBtn = $('togglePassword');
  const box = $('passwordFields');
  const ids = ['currentPass', 'newPass', 'confirmPass'];

  const setOpen = open => {
    box.hidden = !open;
    toggleBtn.textContent = open ? 'Cancel' : 'Change';
    toggleBtn.setAttribute('aria-expanded', String(open));
    if (!open) ids.forEach(id => { $(id).value = ''; });
    else $('currentPass').focus();
  };

  toggleBtn.addEventListener('click', () => setOpen(box.hidden));
  $('cancelPassword').addEventListener('click', () => setOpen(false));

  $('savePassword').addEventListener('click', async () => {
    const [cur, nw, conf] = ids.map(id => $(id).value);
    if (!cur || !nw || !conf) return toast('Please fill all password fields.', 'error');
    if (nw !== conf) return toast('New passwords do not match.', 'error');
    if (nw.length < 8) return toast('Password must be at least 8 characters.', 'error');

    const btn = $('savePassword');
    btn.disabled = true;

    try {
      await api('/profile/password', {
        method: 'PUT',
        json: {
          current_password: cur,
          password: nw,
          password_confirmation: conf,
        },
      });
      setOpen(false);
      toast('Password updated successfully!');
    } catch (err) {
      const msg = err.data?.errors
        ? Object.values(err.data.errors).flat().join(' ')
        : err.message;
      toast(msg || 'Could not update password.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// -- Stats ----------------------------------------------------------------

async function loadStats() {
  try {
    const d = await api('/dashboard/stats');
    $('pstat-submissions').textContent = d.submissions ?? '—';
    $('pstat-approved').textContent = d.approved ?? '—';
  } catch (err) {
    console.warn('Stats error:', err);
  }
}

// -- Profile photo ----------------------------------------------------------

const PHOTO_MAX_BYTES = 2 * 1024 * 1024; // matches backend's max:2048 (KB)

function initPhoto(user) {
  const input = $('photoInput');
  if (!input) return;

  $('changePhoto').addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return toast('Please choose a PNG, JPG or WebP image.', 'error');
    if (file.size > PHOTO_MAX_BYTES) return toast('Image is too large (max 2 MB).', 'error');

    const fd = new FormData();
    fd.append('avatar', file);

    try {
      const data = await api('/profile/avatar', { method: 'POST', body: fd });
      Object.assign(user, data.user);
      saveUser(user);
      renderIdentity(user);
      toast('Profile photo updated!');
    } catch (err) {
      const msg = err.data?.errors
        ? Object.values(err.data.errors).flat().join(' ')
        : err.message;
      toast(msg || 'Could not upload photo.', 'error');
    }
  });

  $('removePhoto').addEventListener('click', async () => {
    try {
      const data = await api('/profile/avatar', { method: 'DELETE' });
      Object.assign(user, data.user);
      saveUser(user);
      renderIdentity(user);
      toast('Profile photo removed.');
    } catch (err) {
      toast(err.message || 'Could not remove photo.', 'error');
    }
  });
}

// -- Boot -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  let user = getUser();
  if (!getToken() || !user) {
    window.location.href = LOGIN_URL;
    return;
  }

  initTheme();
  initDrawer();
  initProfileMenu();
  initSignOutModal();

  // Render whatever we have cached immediately, then refresh from the real API
  renderIdentity(user);
  initProfileForm(user);
  initPasswordForm();
  initPhoto(user);
  loadStats();

  try {
    const data = await api('/profile');
    user = Object.assign(user, data.user);
    saveUser(user);
    renderIdentity(user);
    // Refill the form in case cached values were stale
    if ($('firstName')) $('firstName').value = user.fname || '';
    if ($('lastName')) $('lastName').value = user.lname || '';
    if ($('email')) $('email').value = user.email || '';
  } catch (err) {
    console.warn('Could not refresh profile from server:', err);
  }
});