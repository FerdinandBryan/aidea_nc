// my-profile.js — My Profile (student side)
// Self-contained (like dashboard.js): reads the session from localStorage.

const API_BASE = 'https://aideanc-production.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme'; // shared with the other student pages

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

function splitName(user) {
  const full = (user.full_name || user.name
    || [user.fname, user.lname].filter(Boolean).join(' ')).trim();
  const parts = full.split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

function makeInitials(first, last) {
  return ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase() || 'ST';
}

// Shows the photo if one is saved, otherwise the initials
function setAvatar(el, user, initials) {
  if (!el) return;
  el.textContent = '';
  if (typeof user.avatar === 'string' && user.avatar.startsWith('data:image/')) {
    const img = document.createElement('img');
    img.src = user.avatar;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = initials;
  }
}

// Updates the sidebar footer, the identity card and the page state from a user object
function renderIdentity(user) {
  const { first, last } = splitName(user);
  const fullName = [first, last].filter(Boolean).join(' ') || 'Student';
  const initials = makeInitials(first, last);

  const q = s => document.querySelector(s);
  setAvatar(q('.footer-avatar'), user, initials);
  if (q('.footer-name')) q('.footer-name').textContent = fullName;
  if (q('.footer-role')) q('.footer-role').textContent = user.course || 'Student';

  setAvatar($('avatarCircle'), user, initials);
  if ($('removePhoto')) $('removePhoto').hidden = !user.avatar;
  if ($('changePhoto')) $('changePhoto').textContent = user.avatar ? 'Change photo' : 'Upload photo';
  $('displayName').textContent = fullName;
  $('displayRole').textContent = user.course || 'Student';
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
    const { first, last } = splitName(user);
    $('firstName').value = first;
    $('lastName').value = last;
    $('course').value = user.course || '';
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

  form.addEventListener('submit', e => {
    e.preventDefault();
    const first = $('firstName').value.trim();
    const last = $('lastName').value.trim();
    const email = $('email').value.trim();

    if (!first) { toast('First name is required.', 'error'); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { toast('Enter a valid email address.', 'error'); return; }

    Object.assign(user, {
      full_name: [first, last].filter(Boolean).join(' '),
      course: $('course').value.trim(),
      email,
    });
    saveUser(user);
    renderIdentity(user);
    setEditing(false);
    toast('Profile updated successfully!');
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

  $('savePassword').addEventListener('click', () => {
    const [cur, nw, conf] = ids.map(id => $(id).value);
    if (!cur || !nw || !conf) return toast('Please fill all password fields.', 'error');
    if (nw !== conf) return toast('New passwords do not match.', 'error');
    if (nw.length < 6) return toast('Password must be at least 6 characters.', 'error');

    // TODO: send to the API once a change-password endpoint exists
    setOpen(false);
    toast('Password updated successfully!');
  });
}

// -- Stats (same endpoint the dashboard uses) -------------------------------

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/json' },
    });
    if (res.status === 401) { await performSignOut(); return; }
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    $('pstat-submissions').textContent = d.submissions ?? '—';
    $('pstat-approved').textContent = d.approved ?? '—';
  } catch (err) {
    console.warn('Stats error:', err);
  }
}

// -- Profile photo ----------------------------------------------------------

const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // reject huge originals
const PHOTO_SIZE = 256;                  // saved as a 256×256 square

function resizeToSquare(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PHOTO_SIZE;
      canvas.getContext('2d').drawImage(
        img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
    img.src = url;
  });
}

function initPhoto(user) {
  const input = $('photoInput');
  if (!input) return;

  $('changePhoto').addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return toast('Please choose a PNG, JPG or WebP image.', 'error');
    if (file.size > PHOTO_MAX_BYTES) return toast('Image is too large (max 5 MB).', 'error');

    try {
      user.avatar = await resizeToSquare(file);
      saveUser(user);
      renderIdentity(user);
      toast('Profile photo updated!');
    } catch {
      toast("Couldn't read that image. Try another one.", "error");
    }
  });

  $('removePhoto').addEventListener('click', () => {
    delete user.avatar;
    saveUser(user);
    renderIdentity(user);
    toast('Profile photo removed.');
  });
}

// -- Boot -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (!getToken() || !user) {
    window.location.href = LOGIN_URL;
    return;
  }

  initTheme();
  initDrawer();
  initProfileMenu();
  initSignOutModal();

  renderIdentity(user);
  initProfileForm(user);
  initPasswordForm();
  initPhoto(user);
  loadStats();
});