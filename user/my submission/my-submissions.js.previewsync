// my-submissions.js — My Submissions (student side)
// Depends on login.js (AideaSession), same as before.

const THEME_KEY = 'aidea_user_theme'; // shared with the other student pages
const SUBMISSIONS_URL = 'https://aideanc-production.up.railway.app/api/thesis/my-submissions';
const LOGIN_URL = '../login/login.html';

const $ = id => document.getElementById(id);

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const fullName = user?.full_name || user?.name
        || [user?.fname, user?.lname].filter(Boolean).join(' ') || 'Student';
    const parts = fullName.trim().split(/\s+/);
    const initials = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();

    const q = s => document.querySelector(s);
    if (q('.footer-avatar')) q('.footer-avatar').textContent = initials;
    if (q('.footer-name')) q('.footer-name').textContent = fullName;
    if (q('.footer-role')) q('.footer-role').textContent = user?.course || 'Student';
}

// ── Submissions ────────────────────────────────────────────────────────────

const STATUS = {
    approved: { cls: 'badge-success', label: 'Approved' },
    rejected: { cls: 'badge-danger', label: 'Rejected' },
    under_review: { cls: 'badge-warning', label: 'Under review' },
};
const TYPES = { thesis: 'Thesis paper', research: 'Research paper', initial: 'Initial', revision: 'Revision', final: 'Final copy' };

// API status -> one of the three display buckets (pending counts as under review)
const statusKey = s => (s === 'approved' || s === 'rejected') ? s : 'under_review';
const typeLabel = t => TYPES[t] || t || '—';
const badge = key => `<span class="badge ${STATUS[key].cls}">${STATUS[key].label}</span>`;

function formatDate(iso, full) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '—';
    return d.toLocaleDateString('en-PH', full
        ? { month: 'long', day: 'numeric', year: 'numeric' }
        : { month: 'short', year: 'numeric' });
}

function initSubmissions(token) {
    const tbody = $('tableBody');
    const overlay = $('modalOverlay');
    let allData = [];
    let visible = [];
    let activeFilter = 'all';
    let searchTerm = '';
    let lastTrigger = null;

    const message = (text, error) =>
        `<tr><td colspan="6" class="empty"${error ? ' style="color:var(--bad-fg)"' : ''}>${escHtml(text)}</td></tr>`;

    async function load() {
        tbody.innerHTML = message('Loading submissions…');
        try {
            const res = await fetch(SUBMISSIONS_URL, {
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
            });
            const result = await res.json();
            if (!res.ok) { tbody.innerHTML = message('Couldn’t load your submissions. Refresh to try again.', true); return; }
            allData = result.data || [];
            render();
        } catch (err) {
            console.error('Failed to fetch submissions:', err);
            tbody.innerHTML = message('Network error. Check your connection and refresh.', true);
        }
    }

    function render() {
        visible = allData.filter(d => {
            const matchFilter = activeFilter === 'all' || statusKey(d.status) === activeFilter;
            const matchSearch = (d.title || '').toLowerCase().includes(searchTerm)
                || (d.course || '').toLowerCase().includes(searchTerm);
            return matchFilter && matchSearch;
        });

        if (!visible.length) {
            tbody.innerHTML = message(allData.length
                ? 'No submissions match your search or filter.'
                : 'You haven’t submitted a thesis yet.');
            return;
        }

        tbody.innerHTML = visible.map((d, i) => {
            const key = statusKey(d.status);
            return `
            <tr>
                <td data-label="Title" class="title-cell">${escHtml(d.title)}</td>
                <td data-label="Course">${escHtml(d.course)}</td>
                <td data-label="Submitted">${formatDate(d.created_at)}</td>
                <td data-label="Type">${escHtml(typeLabel(d.submission_type))}</td>
                <td data-label="Status">${badge(key)}</td>
                <td data-label="Actions" class="actions-cell">
                    <button class="btn-action" type="button" data-i="${i}">View</button>
                    
                </td>
            </tr>`;
        }).join('');
    }

    // — details modal —
    const previewUrlOf = p => {
        if (!p) return '';
        if (/^https?:\/\//i.test(p)) return p;
        return new URL(SUBMISSIONS_URL, location.href).origin + '/storage/' + String(p).replace(/^\/+/, '').replace(/^storage\//, '');
    };

    function openModal(i, trigger) {
        const d = visible[i];
        if (!d) return;
        const key = statusKey(d.status);
        lastTrigger = trigger;

        $('modalTitle').textContent = d.title || 'Thesis details';
        const fileName = d.file_name || d.original_name || (d.file_path ? String(d.file_path).split('/').pop() : '');
        const fileExt = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
        $('modalBody').innerHTML = `
            <dl class="detail-list">
                <dt>Research/Thesis title</dt><dd>${escHtml(d.title || '-')}</dd>
                <dt>Research Type</dt><dd>${escHtml(typeLabel(d.submission_type))}</dd>
                <dt>File Name</dt><dd>${escHtml(fileName || '-')}</dd>
                <dt>File Type</dt><dd>${escHtml(fileExt || '-')}</dd>
                <dt>Status</dt><dd>${badge(key)}</dd>
                <dt>Date Submitted</dt><dd>${formatDate(d.created_at, true)}</dd>
            </dl>
            ${d.remarks ? `
            <div class="remarks">
                <h4>Admin remarks</h4>
                <p class="remarks-${key}">${escHtml(d.remarks)}</p>
            </div>` : ''}`;

        const pUrl = previewUrlOf(d.file_path);
        if (pUrl) {
            const pName = d.file_name || d.original_name || String(d.file_path).split('/').pop();
            const isPdf = /\.pdf$/i.test(String(d.file_path));
            const downloadFile = async () => {
                const ext = pName.includes('.') ? '.' + pName.split('.').pop() : '';
                const base = String(d.title || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
                const suggested = (base || pName.replace(/\.[^.]+$/, '')) + ext;
                let handle = null;
                if (window.showSaveFilePicker) {
                    try {
                        handle = await window.showSaveFilePicker({ suggestedName: suggested });
                    } catch (err) {
                        return; // student cancelled the Save As window
                    }
                }
                try {
                    const r = await fetch(pUrl);
                    if (!r.ok) throw new Error('bad response');
                    const blob = await r.blob();
                    if (handle) {
                        const w = await handle.createWritable();
                        await w.write(blob);
                        await w.close();
                    } else {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = suggested;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                    }
                } catch (err) {
                    alert('The file could not be downloaded. Please try again.');
                }
            };            const openWidePreview = () => {
                const bg = document.createElement('div');
                bg.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:2vh 2vw';
                const box = document.createElement('div');
                box.style.cssText = 'width:96vw;height:94vh;display:flex;flex-direction:column;background:#fff;color:#111;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)';
                const head = document.createElement('div');
                head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #ddd';
                const title = document.createElement('strong');
                title.textContent = pName;
                title.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
                const dlBtn = document.createElement('button');
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button'; closeBtn.textContent = 'Close'; closeBtn.style.cssText = 'padding:8px 18px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#111';
                head.append(title, closeBtn);
                const fr = document.createElement('iframe');
                fr.title = 'File preview';
                fr.src = isPdf ? pUrl : 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(pUrl);
                fr.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
                box.append(head, fr);
                bg.appendChild(box);
                document.body.appendChild(bg);
                const close = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); };
                const onKey = ev => { if (ev.key === 'Escape') { ev.stopImmediatePropagation(); close(); } };
                document.addEventListener('keydown', onKey, true);
                bg.addEventListener('click', ev => { if (ev.target === bg) close(); });
                closeBtn.addEventListener('click', close);
            };
            $('modalBody').insertAdjacentHTML('beforeend', `
                <div style="margin-top:16px">
                    <h4 style="margin:0 0 8px">File preview</h4>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button type="button" class="btn-action" id="previewToggle">Preview</button>
                        <button type="button" class="btn-action" id="downloadBtn">Download</button>
                    </div>
                </div>`);
            $('previewToggle').addEventListener('click', openWidePreview);
            $('downloadBtn').addEventListener('click', downloadFile);
        }

        overlay.hidden = false;
        document.body.classList.add('no-scroll');
        $('modalClose').focus();
    }

    function closeModal() {
        overlay.hidden = true;
        if (!$('sidebar')?.classList.contains('open')) document.body.classList.remove('no-scroll');
        lastTrigger?.focus?.();
    }

    tbody.addEventListener('click', e => {
        const btn = e.target.closest('button[data-i]');
        if (btn) openModal(Number(btn.dataset.i), btn);
    });
    $('modalClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeModal(); });

    // — filters + search —
    $('filterChips').addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        document.querySelectorAll('#filterChips .chip').forEach(c => {
            const on = c === chip;
            c.classList.toggle('active', on);
            c.setAttribute('aria-pressed', String(on));
        });
        activeFilter = chip.dataset.filter;
        render();
    });

    $('searchInput').addEventListener('input', e => {
        searchTerm = e.target.value.trim().toLowerCase();
        render();
    });

    load();
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const session = AideaSession.require('student');
    if (!session) return;
    const { token, user } = session;

    renderUserIdentity(user);
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();
    initSubmissions(token);
});