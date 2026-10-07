// test.js — Submit Thesis (student side)
// Depends on login.js (AideaSession), same as before.

const THEME_KEY = 'aidea_user_theme'; // shared with the student dashboard
const SUBMIT_URL = 'https://aideanc-production.up.railway.app/api/thesis/submit';
const LOGIN_URL = '../login/login.html';
const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTS = ['.pdf', '.docx'];

const $ = id => document.getElementById(id);

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    t.textContent = msg;
    $('toastStack').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}
// testvalidator.js's completion callback calls this by name
window._showToast = showToast;

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
    confirmBtn.addEventListener('click', () => AideaSession.logout());
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

// ── Form ───────────────────────────────────────────────────────────────────

function initForm(token) {
    const form = $('thesisForm');
    const fileDrop = $('fileDrop');
    const fileInput = $('fileInput');
    const filePreview = $('filePreview');
    const abstractEl = $('thesisAbstract');
    const submitBtn = $('submitBtn');

    // — file handling —
    const fileError = file => {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_EXTS.includes(ext)) return 'Only PDF or DOCX files are allowed.';
        if (file.size > MAX_SIZE) return 'File exceeds the 20 MB limit.';
        return null;
    };

    function clearFile() {
        fileInput.value = '';
        filePreview.hidden = true;
        filePreview.replaceChildren();
        fileDrop.classList.remove('invalid');
    }

    function showFile(file) {
        const err = fileError(file);
        if (err) { clearFile(); showToast(err, 'error'); return; }

        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = file.name;

        const size = document.createElement('span');
        size.className = 'file-size';
        size.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'file-remove';
        remove.setAttribute('aria-label', 'Remove file');
        remove.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        remove.addEventListener('click', clearFile);

        filePreview.replaceChildren(name, size, remove);
        filePreview.hidden = false;
    }

    const openPicker = () => fileInput.click();
    fileDrop.addEventListener('click', openPicker);
    fileDrop.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault();
        fileDrop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        fileInput.files = e.dataTransfer.files; // so the dropped file is actually submitted
        showFile(file);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) showFile(fileInput.files[0]); });

    // — abstract word count —
    abstractEl.addEventListener('input', () => {
        const words = abstractEl.value.trim().split(/\s+/).filter(Boolean).length;
        $('abstractCount').textContent = `${words} ${words === 1 ? 'word' : 'words'} · 150–300 recommended`;
    });

    // — clear the red border as soon as the student edits a field —
    form.addEventListener('input', e => e.target.classList.remove('invalid'));
    form.addEventListener('change', e => e.target.classList.remove('invalid'));

    $('resetBtn').addEventListener('click', () => {
        form.reset();
        clearFile();
        abstractEl.dispatchEvent(new Event('input'));
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    });

    // — submit —
    const fail = (el, msg) => {
        el.classList.add('invalid');
        el.focus?.();
        showToast(msg, 'error');
    };

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const title = $('thesisTitle').value.trim();
        const course = $('thesisCourse').value;
        const year = $('thesisYear').value.trim();
        const abstract = abstractEl.value.trim();
        const adviser = $('adviserName').value.trim();
        const file = fileInput.files[0];

        // Client-side validation (mirrors Laravel rules)
        if (!title) return fail($('thesisTitle'), 'Thesis title is required.');
        if (!course) return fail($('thesisCourse'), 'Please select a course.');
        if (!year) return fail($('thesisYear'), 'Academic year is required.');
        if (abstract.length < 50) return fail(abstractEl, `Abstract is too short (${abstract.length} characters). The minimum is 50.`);
        if (!adviser) return fail($('adviserName'), 'Adviser name is required.');
        if (!file) { fileDrop.classList.add('invalid'); fileDrop.focus(); return showToast('Please upload a file.', 'error'); }
        const badFile = fileError(file);
        if (badFile) return showToast(badFile, 'error');

        const formData = new FormData();
        formData.append('title', title);
        formData.append('course', course);
        formData.append('academic_year', year);
        formData.append('abstract', abstract);
        formData.append('adviser_name', adviser);
        formData.append('submission_type', $('submissionType').value);
        formData.append('authors', $('authors').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', '));
        formData.append('file', file);

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';

        try {
            const response = await fetch(SUBMIT_URL, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const result = await response.json();

            if (!response.ok) {
                console.warn('Submission rejected:', response.status, result);
                const msg = result.errors
                    ? Object.entries(result.errors).map(([f, m]) => `• ${f}: ${m.join(', ')}`).join('\n')
                    : result.message;
                showToast(msg || 'Submission failed.', 'error');
                return;
            }

            showToast('Thesis submitted. You will be notified of the status.');
            setTimeout(() => { window.location.href = 'librarian_dashboard.html'; }, 1800);
        } catch (err) {
            console.error('Network / parse error:', err);
            showToast('Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit thesis';
        }
    });
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const session = AideaSession.require('librarian');
    if (!session) return;
    const { token, user } = session;

    renderUserIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();
    initThesisForm(token);
});

// ── Check Formatting ───────────────────────────────────────────────────────
// Opens the validator modal (from testvalidator.js), which has its own upload
// area. Kept outside the auth guard above so it works even if
// AideaSession.require() hasn't resolved.

document.addEventListener('DOMContentLoaded', () => {
    $('checkFormatBtn')?.addEventListener('click', () => {
        window.openDocValidationModalForFile(
            null,
            'Format Check',
            'window._showToast ? window._showToast("Formatting check complete.") : null'
        );
    });
});
// SUBMIT-FORM-V2: submission types, abstract mode (text or file), IMRAD file
const ABSTRACT_MIN_WORDS = 150;
const ABSTRACT_MAX_WORDS = 200;
const TYPE_FILE_LABELS = { thesis: 'Thesis paper file', research: 'Research paper file' };

const countWords = s => s.trim().split(/\s+/).filter(Boolean).length;

function limitWords(text, max) {
    const re = /\S+/g;
    let m, n = 0, end = text.length;
    while ((m = re.exec(text)) !== null) {
        n++;
        if (n === max) end = m.index + m[0].length;
        else if (n > max) return text.slice(0, end);
    }
    return text;
}

function initThesisForm(token) {
    const form = $('thesisForm');
    const fileDrop = $('fileDrop');
    const fileInput = $('fileInput');
    const filePreview = $('filePreview');
    const abstractEl = $('thesisAbstract');
    const abstractFile = $('abstractFile');
    const imradFile = $('imradFile');
    const typeEl = $('submissionType');
    const submitBtn = $('submitBtn');

    const fileError = file => {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_EXTS.includes(ext)) return 'Only PDF or DOCX files are allowed.';
        if (file.size > MAX_SIZE) return 'File exceeds the 20 MB limit.';
        return null;
    };
    const abstractMode = () => (form.querySelector('input[name="abstractMode"]:checked') || {}).value || 'text';

    function clearFile() {
        fileInput.value = '';
        filePreview.hidden = true;
        filePreview.replaceChildren();
        fileDrop.classList.remove('invalid');
    }

    function showFile(file) {
        const err = fileError(file);
        if (err) { clearFile(); showToast(err, 'error'); return; }
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = file.name;
        const size = document.createElement('span');
        size.className = 'file-size';
        size.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'file-remove';
        remove.setAttribute('aria-label', 'Remove file');
        remove.textContent = 'Remove';
        remove.addEventListener('click', clearFile);
        filePreview.replaceChildren(name, size, remove);
        filePreview.hidden = false;
    }

    function syncType() {
        const t = typeEl.value;
        $('fileLabelText').textContent = TYPE_FILE_LABELS[t] || TYPE_FILE_LABELS.thesis;
        const research = t === 'research';
        $('imradReq').hidden = !research;
        $('imradOpt').hidden = research;
        submitBtn.textContent = research ? 'Submit research' : 'Submit thesis';
    }

    function syncAbstractMode() {
        const text = abstractMode() === 'text';
        $('abstractTextWrap').hidden = !text;
        $('abstractFileWrap').hidden = text;
    }

    function updateCount() {
        const w = countWords(abstractEl.value);
        const el = $('abstractCount');
        el.textContent = `${w} ${w === 1 ? 'word' : 'words'} - required: ${ABSTRACT_MIN_WORDS} to ${ABSTRACT_MAX_WORDS} words`;
        el.classList.toggle('count-ok', w >= ABSTRACT_MIN_WORDS && w <= ABSTRACT_MAX_WORDS);
        el.classList.toggle('count-bad', w > 0 && w < ABSTRACT_MIN_WORDS);
    }

    const openPicker = () => fileInput.click();
    fileDrop.addEventListener('click', openPicker);
    fileDrop.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault();
        fileDrop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        fileInput.files = e.dataTransfer.files;
        showFile(file);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) showFile(fileInput.files[0]); });

    typeEl.addEventListener('change', syncType);
    form.querySelectorAll('input[name="abstractMode"]').forEach(r => r.addEventListener('change', syncAbstractMode));
    abstractEl.addEventListener('input', () => {
        if (countWords(abstractEl.value) > ABSTRACT_MAX_WORDS) {
            abstractEl.value = limitWords(abstractEl.value, ABSTRACT_MAX_WORDS);
        }
        updateCount();
    });

    form.addEventListener('input', e => e.target.classList.remove('invalid'));
    form.addEventListener('change', e => e.target.classList.remove('invalid'));

    $('resetBtn').addEventListener('click', () => {
        form.reset();
        clearFile();
        syncType();
        syncAbstractMode();
        updateCount();
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    });

    const fail = (el, msg) => {
        el.classList.add('invalid');
        el.focus?.();
        showToast(msg, 'error');
    };

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const title = $('thesisTitle').value.trim();
        const course = $('thesisCourse').value;
        const year = $('thesisYear').value;
        const type = typeEl.value;
        const adviser = $('adviserName').value.trim();
        const file = fileInput.files[0];
        const useText = abstractMode() === 'text';
        const abstract = abstractEl.value.trim();
        const abstractUpload = abstractFile.files[0];
        const imrad = imradFile.files[0];
        const fileLabel = TYPE_FILE_LABELS[type] || TYPE_FILE_LABELS.thesis;

        if (!title) return fail($('thesisTitle'), 'Thesis title is required.');
        if (!course) return fail($('thesisCourse'), 'Please select a course.');
        if (!year) return fail($('thesisYear'), 'Please select an academic year.');
        if (!TYPE_FILE_LABELS[type]) return fail(typeEl, 'Please choose a submission type.');

        if (useText) {
            const words = countWords(abstract);
            if (words < ABSTRACT_MIN_WORDS || words > ABSTRACT_MAX_WORDS) {
                return fail(abstractEl, `Abstract must be ${ABSTRACT_MIN_WORDS} to ${ABSTRACT_MAX_WORDS} words (you have ${words}).`);
            }
        } else {
            if (!abstractUpload) return fail(abstractFile, 'Please upload your abstract file.');
            const abErr = fileError(abstractUpload);
            if (abErr) return fail(abstractFile, 'Abstract file: ' + abErr);
        }

        if (!adviser) return fail($('adviserName'), 'Adviser name is required.');
        if (!file) { fileDrop.classList.add('invalid'); fileDrop.focus(); return showToast(`Please upload the ${fileLabel.toLowerCase()}.`, 'error'); }
        const badFile = fileError(file);
        if (badFile) return showToast(badFile, 'error');

        if (type === 'research' && !imrad) return fail(imradFile, 'The IMRAD file is required for a research paper.');
        if (imrad) {
            const imErr = fileError(imrad);
            if (imErr) return fail(imradFile, 'IMRAD file: ' + imErr);
        }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('course', course);
        formData.append('academic_year', year);
        formData.append('adviser_name', adviser);
        formData.append('submission_type', type);
        formData.append('authors', $('authors').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', '));
        formData.append('file', file);
        if (useText) formData.append('abstract', abstract);
        else formData.append('abstract_file', abstractUpload);
        if (imrad) formData.append('imrad_file', imrad);

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const response = await fetch(SUBMIT_URL, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const result = await response.json();

            if (!response.ok) {
                console.warn('Submission rejected:', response.status, result);
                const msg = result.errors
                    ? Object.entries(result.errors).map(([f, m]) => `- ${f}: ${m.join(', ')}`).join('\n')
                    : result.message;
                showToast(msg || 'Submission failed.', 'error');
                return;
            }

            showToast('Thesis submitted. You will be notified of the status.');
            setTimeout(() => { window.location.href = 'librarian_dashboard.html'; }, 1800);
        } catch (err) {
            console.error('Network / parse error:', err);
            showToast('Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = typeEl.value === 'research' ? 'Submit research' : 'Submit thesis';
        }
    });

    syncType();
    syncAbstractMode();
    updateCount();
}