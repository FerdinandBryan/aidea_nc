// Thesis_submissions.js
// Real data from GET /api/thesis/list, review + repository features kept intact,
// restyled to share the dashboard's theme, drawer, profile menu and sign-out.
(function () {
    'use strict';

    const API_BASE = 'https://aideanc-production.up.railway.app/api';
    const LOGIN_URL = '../../user/login/login.html';
    const REPO_KEY = 'aidea_repository';

    let theses = [];
    let filtered = [];
    let activeReviewId = null;
    let selectedStatus = null;
    let repoSearchQuery = '';

    // ── Session helpers (same keys as the dashboard) ───────────────────────
    function getToken() {
        return localStorage.getItem('auth_token') || '';
    }
    function getUser() {
        try { return JSON.parse(localStorage.getItem('aidea_user')); }
        catch (e) { return null; }
    }
    function clearSession() {
        try { localStorage.removeItem('auth_token'); } catch (e) { /* ignore */ }
        try { localStorage.removeItem('aidea_user'); } catch (e) { /* ignore */ }
    }
    function performSignOut() {
        const token = getToken();
        if (token) {
            fetch(API_BASE + '/logout', {
                method: 'POST',
                headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
            }).catch(function () { });
        }
        clearSession();
        window.location.href = LOGIN_URL;
    }
    function renderAdminIdentity(user) {
        const fullName = [user.fname, user.lname].filter(Boolean).join(' ') || 'Admin';
        const parts = fullName.trim().split(/\s+/);
        const ini = parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : parts[0].slice(0, 2).toUpperCase();
        const avatar = document.querySelector('.footer-avatar');
        const name = document.querySelector('.footer-name');
        if (avatar) avatar.textContent = ini;
        if (name) name.textContent = fullName;
    }

    // ── Theme (shared aidea_theme key with the dashboard) ──────────────────
    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }
    function applyTheme(theme, persist) {
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) { try { localStorage.setItem('aidea_theme', theme); } catch (e) { /* ignore */ } }
        const btn = document.getElementById('themeBtn');
        if (btn) btn.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
    }
    function initTheme() {
        applyTheme(currentTheme(), false);
        const btn = document.getElementById('themeBtn');
        if (btn) btn.addEventListener('click', function () {
            applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
        });
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = function (e) {
            let saved = null;
            try { saved = localStorage.getItem('aidea_theme'); } catch (err) { /* ignore */ }
            if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
        window.addEventListener('storage', function (e) {
            if (e.key === 'aidea_theme' && (e.newValue === 'light' || e.newValue === 'dark')) applyTheme(e.newValue, false);
        });
    }

    // ── Mobile drawer ───────────────────────────────────────────────────────
    function initDrawer() {
        const sidebar = document.getElementById('sidebar');
        const scrim = document.getElementById('scrim');
        const btn = document.getElementById('menuBtn');
        if (!sidebar || !scrim || !btn) return;
        const open = function () {
            sidebar.classList.add('open');
            scrim.hidden = false;
            document.body.classList.add('no-scroll');
            btn.setAttribute('aria-expanded', 'true');
        };
        const close = function () {
            sidebar.classList.remove('open');
            scrim.hidden = true;
            document.body.classList.remove('no-scroll');
            btn.setAttribute('aria-expanded', 'false');
        };
        btn.addEventListener('click', function () { sidebar.classList.contains('open') ? close() : open(); });
        scrim.addEventListener('click', close);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        sidebar.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
        const mq = window.matchMedia('(min-width: 1025px)');
        if (mq.addEventListener) mq.addEventListener('change', function (e) { if (e.matches) close(); });
    }

    // ── Profile menu + sign-out ─────────────────────────────────────────────
    function initProfileMenu() {
        const btn = document.getElementById('profileBtn');
        const menu = document.getElementById('profileMenu');
        const signOutBtn = document.getElementById('signOutBtn');
        if (!btn || !menu) return;
        const setOpen = function (open) {
            menu.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
        };
        btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(menu.hidden); });
        document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });

        if (signOutBtn) signOutBtn.addEventListener('click', function () {
            setOpen(false);
            openConfirm({
                title: 'Sign out?',
                message: 'You will need to log in again to use the admin panel.',
                confirmText: 'Sign out',
                danger: true
            }).then(function (ok) { if (ok) performSignOut(); else btn.focus(); });
        });
    }

    // ── Generic confirm dialog (used for sign-out) ─────────────────────────
    function openConfirm(opts) {
        return new Promise(function (resolve) {
            const overlay = el('div', 'modal-backdrop');
            const box = el('div', 'modal');
            box.setAttribute('role', 'alertdialog');
            box.setAttribute('aria-modal', 'true');

            const head = el('div', 'modal-head');
            head.appendChild(el('h3', 'modal-title', opts.title));
            box.appendChild(head);

            const body = el('div', 'modal-body');
            body.appendChild(el('p', 'detail-abstract', opts.message));
            box.appendChild(body);

            const actions = el('div', 'modal-actions');
            const cancel = el('button', 'modal-btn modal-btn-cancel', 'Cancel');
            cancel.type = 'button';
            const confirmBtn = el('button', 'modal-btn ' + (opts.danger ? 'modal-btn-danger' : 'modal-btn-primary'), opts.confirmText || 'Confirm');
            confirmBtn.type = 'button';
            actions.appendChild(cancel);
            actions.appendChild(confirmBtn);
            box.appendChild(actions);

            function done(ok) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                document.body.classList.remove('no-scroll');
                resolve(ok);
            }
            function onKey(e) { if (e.key === 'Escape') done(false); }

            cancel.addEventListener('click', function () { done(false); });
            confirmBtn.addEventListener('click', function () { done(true); });
            overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(false); });
            document.addEventListener('keydown', onKey);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            document.body.classList.add('no-scroll');
            cancel.focus();
        });
    }

    // ── Small DOM helper ────────────────────────────────────────────────────
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    // ── Fetch theses from API ───────────────────────────────────────────────
        function getStudentName(t) {
        const u = t.user || t.student || {};
        const full = [u.fname, u.mname, u.lname].filter(Boolean).join(' ').trim();
        return full
            || u.name
            || t.student_name
            || [t.fname, t.lname].filter(Boolean).join(' ').trim()
            || 'Unknown student';
    }

    async function loadTheses() {
        try {
            const res = await fetch(API_BASE + '/thesis/list', {
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: 'Bearer ' + getToken(),
                }
            });
            if (!res.ok) throw new Error('Server error: ' + res.status);
            const data = await res.json();

            theses = (data.data ?? data).map(function (t) {
                return {
                    id: t.id,
                    student: getStudentName(t),
                    title: t.title,
                    course: t.course,
                    year: t.academic_year,
                    authors: t.authors ?? '—',
                    abstract: t.abstract,
                    adviser: t.adviser_name,
                    service: t.submission_type,
                    date: t.created_at,
                    status: t.status
                        ? t.status.charAt(0).toUpperCase() + t.status.slice(1).toLowerCase()
                        : 'Pending',
                    visibleInRepo: !!t.visible_in_repo,
                    file: t.file_path ? {
                        name: t.original_filename ?? t.file_path.split('/').pop(),
                        size: t.file_size ?? 0,
                        type: t.file_type ?? '',
                        url: t.file_url,
                    } : null,
                };
            });

            filtered = theses.slice();
            render();
            updateStats();
            updateRepoBadge();
        } catch (err) {
            console.error('Failed to load theses:', err);
            showToast('Failed to load submissions. Check your connection.', 'error');
        }
    }

    function startPolling(intervalMs) {
        setInterval(loadTheses, intervalMs || 15000);
    }

    // ── Modal open/close (view / review / repository) ──────────────────────
    function openDialog(id) {
        const dlg = document.getElementById(id);
        if (!dlg) return;
        dlg.hidden = false;
        document.body.classList.add('no-scroll');
    }
    function closeDialog(id) {
        const dlg = document.getElementById(id);
        if (!dlg) return;
        dlg.hidden = true;
        const sidebar = document.getElementById('sidebar');
        if (!sidebar || !sidebar.classList.contains('open')) document.body.classList.remove('no-scroll');
        if (id === 'reviewModal') {
            selectedStatus = null;
            document.querySelectorAll('.btn-status').forEach(function (b) { b.classList.remove('selected'); });
            document.getElementById('reviewRemarks').value = '';
        }
        if (id === 'repoModal') {
            repoSearchQuery = '';
            const inp = document.getElementById('repoSearchInput');
            if (inp) inp.value = '';
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    function fileExt(name) {
        if (!name || name.indexOf('.') === -1) return 'FILE';
        return name.split('.').pop().toUpperCase();
    }
    function highlight(text, query) {
        if (!query) return escHtml(text);
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escHtml(text).replace(new RegExp('(' + escaped + ')', 'gi'), '<mark class="repo-highlight">$1</mark>');
    }
    function formatDate(raw) {
        if (!raw) return '—';
        const d = new Date(raw);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Stats row ────────────────────────────────────────────────────────────
    function updateStats() {
        setText('statTotal', theses.length);
        setText('statApproved', theses.filter(function (t) { return t.status === 'Approved'; }).length);
        setText('statPending', theses.filter(function (t) { return t.status === 'Pending'; }).length);
        setText('statRejected', theses.filter(function (t) { return t.status === 'Rejected'; }).length);
    }
    function setText(id, value) {
        const e = document.getElementById(id);
        if (e) e.textContent = value;
    }

    // ── View modal ───────────────────────────────────────────────────────────
    function viewThesis(id) {
        const t = theses.find(function (x) { return x.id === id; });
        if (!t) return;

        document.getElementById('viewModalTitle').textContent = t.title;
        setText('viewStudent', t.student);
        setText('viewCourse', t.course);
        setText('viewService', t.service);
        setText('viewDate', formatDate(t.date));

        const statusCls = { Approved: 'status-approved', Pending: 'status-pending', Rejected: 'status-rejected' };
        document.getElementById('viewStatus').innerHTML =
            '<span class="' + (statusCls[t.status] || '') + '">' + escHtml(t.status) + '</span>';
        document.getElementById('viewAbstract').textContent = t.abstract || '—';

        const fileSection = document.getElementById('viewFileSection');
        if (t.file) {
            fileSection.innerHTML =
                '<div class="submitted-file-card">' +
                    '<div class="file-tag">' + escHtml(fileExt(t.file.name)) + '</div>' +
                    '<div class="file-card-info">' +
                        '<div class="file-card-name" title="' + escHtml(t.file.name) + '">' + escHtml(t.file.name) + '</div>' +
                        '<div class="file-card-meta">' + formatSize(t.file.size) + '</div>' +
                    '</div>' +
                    '<div class="file-card-btns">' +
                        '<button class="btn-file" onclick="AideaThesis.checkFile(' + t.id + ')">View</button>' +
                        '<button class="btn-file" onclick="AideaThesis.downloadFile(' + t.id + ')">Download</button>' +
                    '</div>' +
                '</div>';
        } else {
            fileSection.innerHTML = '<div class="no-file-notice">No file submitted by the student.</div>';
        }

        openDialog('viewModal');
    }

    function checkSubmittedFile(id) {
        const t = theses.find(function (x) { return x.id === id; });
        if (!t?.file?.url) { showToast('No file available.', 'warning'); return; }
        window.open(t.file.url, '_blank');
    }

    function downloadSubmittedFile(id) {
        const t = theses.find(function (x) { return x.id === id; });
        if (!t?.file?.url) { showToast('No file available.', 'warning'); return; }
        const a = document.createElement('a');
        a.href = t.file.url;
        a.download = t.file.name;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Downloading "' + t.file.name + '"…', 'info');
    }

    // ── Review modal ─────────────────────────────────────────────────────────
    function reviewThesis(id) {
        const t = theses.find(function (x) { return x.id === id; });
        if (!t) return;
        activeReviewId = id;
        selectedStatus = t.status;

        setText('reviewTitle', t.title);
        setText('reviewStudent', t.student);

        const statusCls = { Approved: 'status-approved', Pending: 'status-pending', Rejected: 'status-rejected' };
        document.getElementById('reviewCurrentStatus').innerHTML =
            '<span class="' + (statusCls[t.status] || '') + '">' + escHtml(t.status) + '</span>';

        document.querySelectorAll('.btn-status').forEach(function (b) { b.classList.remove('selected'); });
        const match = document.querySelector('.btn-status.' + t.status.toLowerCase());
        if (match) match.classList.add('selected');

        openDialog('reviewModal');
    }

    function setStatus(status) {
        selectedStatus = status;
        document.querySelectorAll('.btn-status').forEach(function (b) { b.classList.remove('selected'); });
        const match = document.querySelector('.btn-status.' + status.toLowerCase());
        if (match) match.classList.add('selected');
    }

    async function submitReview() {
        if (!selectedStatus) { showToast('Please select a status.', 'warning'); return; }
        const thesis = theses.find(function (t) { return t.id === activeReviewId; });
        if (!thesis) return;

        const remarks = document.getElementById('reviewRemarks').value.trim();
        try {
            const res = await fetch(API_BASE + '/thesis/' + activeReviewId + '/review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: 'Bearer ' + getToken(),
                },
                body: JSON.stringify({ status: selectedStatus, remarks: remarks }),
            });

            if (!res.ok) {
                const err = await res.json().catch(function () { return {}; });
                showToast(err.message || 'Review failed.', 'error');
                return;
            }

            thesis.status = selectedStatus;
            closeDialog('reviewModal');
            applyFilter();
            updateStats();
            showToast('"' + thesis.title + '" marked as ' + selectedStatus + '.', 'success');
        } catch (err) {
            console.error('Review error:', err);
            showToast('Network error. Please try again.', 'error');
        }
    }

    // ── Repository (backed by real API status + visibility) ────────────────
    async function apiToggleRepoVisibility(id) {
        const res = await fetch(API_BASE + '/thesis/' + id + '/toggle-repo', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: 'Bearer ' + getToken(),
            }
        });
        if (!res.ok) throw new Error('Server error: ' + res.status);
        return res.json();
    }

    function getRepository() {
        return theses.filter(function (t) { return t.status === 'Approved' && t.visibleInRepo; });
    }
    function isInRepository(id) {
        const t = theses.find(function (t) { return t.id === id; });
        return !!(t && t.visibleInRepo);
    }

    async function addToRepository(id) {
        const thesis = theses.find(function (t) { return t.id === id; });
        if (!thesis) return;
        if (thesis.visibleInRepo) { showToast('Already in repository.', 'warning'); return; }
        try {
            await apiToggleRepoVisibility(id);
            thesis.visibleInRepo = true;
            render();
            updateRepoBadge();
            showToast('"' + thesis.title + '" added to repository.', 'success');
        } catch (err) {
            console.error('Failed to update repository visibility:', err);
            showToast('Failed to update repository. Check your connection.', 'error');
        }
    }

    async function removeFromRepository(id) {
        const thesis = theses.find(function (t) { return t.id === id; });
        if (!thesis) return;
        try {
            await apiToggleRepoVisibility(id);
            thesis.visibleInRepo = false;
            render();
            updateRepoBadge();
            const dlg = document.getElementById('repoModal');
            if (dlg && !dlg.hidden) renderRepoModal();
            showToast('Removed from repository.', 'info');
        } catch (err) {
            console.error('Failed to update repository visibility:', err);
            showToast('Failed to update repository. Check your connection.', 'error');
        }
    }

    function openRepoModal() {
        repoSearchQuery = '';
        renderRepoModal();
        openDialog('repoModal');
        setTimeout(function () { document.getElementById('repoSearchInput')?.focus(); }, 100);
    }
    function searchRepo() {
        repoSearchQuery = document.getElementById('repoSearchInput').value;
        renderRepoModal();
    }
    function clearRepoSearch() {
        repoSearchQuery = '';
        document.getElementById('repoSearchInput').value = '';
        renderRepoModal();
    }

    function renderRepoModal() {
        const repo = getRepository();
        const q = repoSearchQuery.toLowerCase().trim();
        const filteredRepo = q
            ? repo.filter(function (p) {
                return p.title.toLowerCase().includes(q) ||
                    (p.authors || '').toLowerCase().includes(q) ||
                    (p.course || '').toLowerCase().includes(q) ||
                    (p.abstract || '').toLowerCase().includes(q);
            })
            : repo;

        const countEl = document.getElementById('repoModalCount');
        const listEl = document.getElementById('repoModalList');

        countEl.innerHTML = q
            ? '<strong>' + filteredRepo.length + '</strong> result' + (filteredRepo.length !== 1 ? 's' : '') +
              ' found out of <strong>' + repo.length + '</strong> in repository'
            : '<strong>' + repo.length + '</strong> thesis' + (repo.length !== 1 ? 'es' : '') + ' in the repository';

        if (repo.length === 0) {
            listEl.innerHTML = '<div class="repo-empty">No theses in the repository yet.<br>Approve and add theses from the table below.</div>';
            return;
        }
        if (filteredRepo.length === 0) {
            listEl.innerHTML = '<div class="repo-empty">No results for "' + escHtml(repoSearchQuery) + '".<br>Try a different keyword.</div>';
            return;
        }

        listEl.innerHTML = '<div class="repo-list">' + filteredRepo.map(function (p, i) {
            return '<div class="repo-item">' +
                '<div class="repo-item-num">#' + (i + 1) + '</div>' +
                '<div class="repo-item-body">' +
                    '<div class="repo-item-title">' + highlight(p.title, repoSearchQuery) + '</div>' +
                    '<div class="repo-item-meta">' +
                        '<span>' + highlight(p.authors || '—', repoSearchQuery) + '</span>' +
                        '<span>' + highlight(p.course || '—', repoSearchQuery) + '</span>' +
                        '<span>' + escHtml(p.year || '') + '</span>' +
                    '</div>' +
                    '<div class="repo-item-abstract">' + highlight(p.abstract || '', repoSearchQuery) + '</div>' +
                '</div>' +
                '<div class="repo-item-actions">' +
                    ((p.file && p.file.url) ? '<a class="btn-repo-link" href="' + p.file.url + '" target="_blank" rel="noopener">View</a>' : '') +
                    '<button class="btn-repo-remove-sm" onclick="AideaThesis.removeFromRepository(' + p.id + ')">Remove</button>' +
                '</div>' +
            '</div>';
        }).join('') + '</div>';
    }

    function updateRepoBadge() {
        const count = getRepository().length;
        const badge = document.getElementById('repoBadgeCount');
        if (!badge) return;
        badge.hidden = count === 0;
        badge.textContent = count;
    }

    // ── Status badge + row action buttons ───────────────────────────────────
    function statusBadge(s) {
        const m = { Approved: 'badge-success', Pending: 'badge-warning', Rejected: 'badge-danger' };
        return '<span class="badge ' + (m[s] || '') + '">' + escHtml(s) + '</span>';
    }
    function repoBtnHtml(thesis) {
        if (thesis.status !== 'Approved')
            return '<button class="btn-repo" disabled title="Only approved theses can be added">+ Repo</button>';
        if (isInRepository(thesis.id))
            return '<button class="btn-repo btn-repo-remove" onclick="AideaThesis.removeFromRepository(' + thesis.id + ')">Remove</button>';
        return '<button class="btn-repo btn-repo-add" onclick="AideaThesis.addToRepository(' + thesis.id + ')">+ Repo</button>';
    }

    // ── Render table ─────────────────────────────────────────────────────────
    function render() {
        const tbody = document.getElementById('thesisBody');
        if (!tbody) return;

        if (theses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">No submissions yet.</td></tr>';
            return;
        }
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">No submissions match your filter.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(function (t) {
            return '<tr>' +
                '<td data-label="#">' + t.id + '</td>' +
                '<td data-label="Student"><strong>' + escHtml(t.student) + '</strong></td>' +
                '<td data-label="Title"><div class="thesis-title" title="' + escHtml(t.title) + '">' + escHtml(t.title) +
                    (t.file ? '<span class="has-file-dot" title="Has a submitted file"></span>' : '') + '</div></td>' +
                '<td data-label="Service">' + escHtml(t.service) + '</td>' +
                '<td data-label="Submitted">' + formatDate(t.date) + '</td>' +
                '<td data-label="Status">' + statusBadge(t.status) + '</td>' +
                '<td data-label="Actions" class="action-cell">' +
                    '<button class="btn-action" onclick="AideaThesis.viewThesis(' + t.id + ')">View</button>' +
                    '<button class="btn-action" onclick="AideaThesis.reviewThesis(' + t.id + ')">Review</button>' +
                    repoBtnHtml(t) +
                '</td>' +
            '</tr>';
        }).join('');
    }

    // ── Filter ───────────────────────────────────────────────────────────────
    function applyFilter() {
        const q = document.getElementById('searchInput').value.toLowerCase();
        const st = document.getElementById('filterStatus').value;
        filtered = theses.filter(function (t) {
            return (t.student.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) && (!st || t.status === st);
        });
        render();
    }

    // ── Toast ────────────────────────────────────────────────────────────────
    function showToast(msg, type) {
        let wrap = document.getElementById('toastWrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'toastWrap';
            document.body.appendChild(wrap);
        }
        const t = el('div', 'toast toast-' + (type || 'info'), msg);
        wrap.appendChild(t);
        setTimeout(function () { t.remove(); }, 3200);
    }

    // ── Public bridge for inline handlers in generated markup ──────────────
    window.AideaThesis = {
        viewThesis: viewThesis,
        reviewThesis: reviewThesis,
        addToRepository: addToRepository,
        removeFromRepository: removeFromRepository,
        checkFile: checkSubmittedFile,
        downloadFile: downloadSubmittedFile,
    };

    // ── Init ─────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        const user = getUser();
        if (user) renderAdminIdentity(user);

        initTheme();
        initDrawer();
        initProfileMenu();

        loadTheses();
        startPolling();

        document.getElementById('searchInput').addEventListener('input', applyFilter);
        document.getElementById('filterStatus').addEventListener('change', applyFilter);
        document.getElementById('viewRepoBtn').addEventListener('click', openRepoModal);
        document.getElementById('submitReviewBtn').addEventListener('click', submitReview);
        document.getElementById('repoSearchBtn').addEventListener('click', searchRepo);
        document.getElementById('repoClearBtn').addEventListener('click', clearRepoSearch);
        document.getElementById('repoSearchInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') searchRepo();
        });
        document.getElementById('repoSearchInput').addEventListener('input', function () {
            if (!this.value) clearRepoSearch();
        });

        document.querySelectorAll('.btn-status').forEach(function (b) {
            b.addEventListener('click', function () { setStatus(b.dataset.status); });
        });

        document.querySelectorAll('[data-close]').forEach(function (b) {
            b.addEventListener('click', function () { closeDialog(b.dataset.close); });
        });
        document.querySelectorAll('.modal-backdrop').forEach(function (overlay) {
            overlay.addEventListener('mousedown', function (e) {
                if (e.target === overlay) closeDialog(overlay.id);
            });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            ['viewModal', 'reviewModal', 'repoModal'].forEach(function (id) {
                const dlg = document.getElementById(id);
                if (dlg && !dlg.hidden) closeDialog(id);
            });
        });
    });
})();