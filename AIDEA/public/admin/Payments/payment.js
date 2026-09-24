// payment.js
// Reads ALL payments from GET /api/payments. Admin can approve (→ Paid) or
// reject any pending payment. Restyled to share the dashboard's theme,
// drawer, profile menu and sign-out, with confirm dialogs instead of confirm().
(function () {
    'use strict';

    const API_BASE = 'http://127.0.0.1:8000/api';
    const LOGIN_URL = '../../user/login/login.html';

    let allPayments = [];
    let filtered = [];
    let searchTerm = '';
    let statusFilter = '';

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

    // ── Generic confirm dialog (sign-out, approve, reject) ─────────────────
    function openConfirm(opts) {
        return new Promise(function (resolve) {
            const opener = document.activeElement;
            const overlay = el('div', 'modal-backdrop');
            const box = el('div', 'modal');
            box.setAttribute('role', 'alertdialog');
            box.setAttribute('aria-modal', 'true');

            const head = el('div', 'modal-head');
            head.appendChild(el('h3', 'modal-title', opts.title));
            box.appendChild(head);

            const body = el('div', 'modal-body');
            body.appendChild(el('p', 'vm-muted', opts.message));
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
                if (opener && opener.focus && document.contains(opener)) opener.focus();
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

    function openNotice(opts) {
        return new Promise(function (resolve) {
            const opener = document.activeElement;
            const hadLock = document.body.classList.contains('no-scroll');
            const tone = opts.tone || 'success';
            const overlay = el('div', 'modal-backdrop');
            const box = el('div', 'modal');
            box.setAttribute('role', 'alertdialog');
            box.setAttribute('aria-modal', 'true');

            const head = el('div', 'modal-head');
            head.appendChild(el('h3', 'modal-title', opts.title));
            box.appendChild(head);

            const body = el('div', 'modal-body');
            body.appendChild(el('div', 'notice-mark notice-' + tone, tone === 'success' ? '\u2713' : '!'));
            body.appendChild(el('p', 'vm-muted', opts.message));
            box.appendChild(body);

            const actions = el('div', 'modal-actions');
            const ok = el('button', 'modal-btn modal-btn-primary', 'OK');
            ok.type = 'button';
            actions.appendChild(ok);
            box.appendChild(actions);

            function done() {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                if (!hadLock) document.body.classList.remove('no-scroll');
                if (opener && opener.focus && document.contains(opener)) opener.focus();
                resolve();
            }
            function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') done(); }

            ok.addEventListener('click', done);
            overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(); });
            document.addEventListener('keydown', onKey);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            document.body.classList.add('no-scroll');
            ok.focus();
        });
    }

    function showSendResult(isCert, student, result) {
        const what = isCert ? 'Certificate' : 'Files';
        if (result && result.emailed === false) {
            openNotice({
                tone: 'warning',
                title: what + ' saved, email failed',
                message: student + ' can see the ' + what.toLowerCase() + ' in the system, but the email to their Gmail did not go out.' +
                    (result.email_error ? ' Reason: ' + result.email_error : '')
            });
            return;
        }
        openNotice({
            tone: 'success',
            title: what + ' sent',
            message: what + ' sent to ' + student + '. They were notified in the system and by email.'
        });
    }

    function showSendError(box, body, err) {
        let text = (err && err.message) || 'Failed to send.';
        if (err && err.errors) {
            const first = Object.keys(err.errors)[0];
            if (first && err.errors[first] && err.errors[first][0]) text = err.errors[first][0];
        }
        let banner = box.querySelector('.send-status');
        if (!banner) {
            banner = el('div', 'send-status send-status-error');
            banner.setAttribute('role', 'alert');
            body.insertBefore(banner, body.firstChild);
        }
        banner.textContent = 'Not sent. ' + text;
    }

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    // ── API helper ───────────────────────────────────────────────────────────
    async function apiFetch(path, options) {
        options = options || {};
        const token = getToken();
        const res = await fetch(API_BASE + path, Object.assign({
            headers: Object.assign(
                { 'Content-Type': 'application/json', Accept: 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {},
                options.headers || {}
            ),
        }, options));
        if (!res.ok) {
            const err = await res.json().catch(function () { return {}; });
            throw err;
        }
        return res.json();
    }

    function updatePaymentStatus(id, action) {
        return apiFetch('/payments/' + id + '/' + action, { method: 'PATCH' });
    }

    // ── Status badge ────────────────────────────────────────────────────────
    function statusBadge(s) {
        const display = s === 'Paid' ? 'Completed' : s === 'Rejected' ? 'Cancelled' : s;
        const cls = { Completed: 'badge-success', Pending: 'badge-warning', Cancelled: 'badge-danger' };
        return '<span class="badge ' + (cls[display] || '') + '">' + escHtml(display) + '</span>';
    }

    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function peso(n) {
        return '₱ ' + Number(n || 0).toLocaleString();
    }

    // ── Summary stats ────────────────────────────────────────────────────────
    function updateStats() {
        const completed = allPayments.filter(function (p) { return p.status === 'Completed' || p.status === 'Paid'; });
        const pending = allPayments.filter(function (p) { return p.status === 'Pending'; });
        const cancelled = allPayments.filter(function (p) { return p.status === 'Cancelled' || p.status === 'Rejected'; });

        const totalRev = allPayments.reduce(function (s, p) { return s + Number(p.amount); }, 0);
        const compRev = completed.reduce(function (s, p) { return s + Number(p.amount); }, 0);
        const pendRev = pending.reduce(function (s, p) { return s + Number(p.amount); }, 0);
        const cancRev = cancelled.reduce(function (s, p) { return s + Number(p.amount); }, 0);

        setText('statTotal', peso(totalRev));
        setText('statCompleted', peso(compRev));
        setText('statPending', peso(pendRev));
        setText('statCancelled', peso(cancRev));
    }
    function setText(id, value) {
        const e = document.getElementById(id);
        if (e) e.textContent = value;
    }

    // ── Render table ─────────────────────────────────────────────────────────
    function render() {
        const q = searchTerm.toLowerCase();
        filtered = allPayments.filter(function (p) {
            const matchQ = !q || p.student.toLowerCase().includes(q) ||
                (p.gcash_ref || p.gcashRef || '').toLowerCase().includes(q) ||
                (p.ref || '').toLowerCase().includes(q);
            const normStatus = p.status === 'Paid' ? 'Completed' : p.status === 'Rejected' ? 'Cancelled' : p.status;
            const matchSt = !statusFilter || normStatus === statusFilter;
            return matchQ && matchSt;
        });

        const isPending = function (p) { return p.status === 'Pending'; };
        const tbody = document.getElementById('paymentsBody');
        if (!tbody) return;

        if (!allPayments.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">No payments yet.</td></tr>';
            return;
        }
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">No payments match your filter.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(function (p, i) {
            let actions;
            if (isPending(p)) {
                actions = '<button class="btn-action" onclick="AideaPayments.openView(' + i + ')">View</button>' +
                    '<button class="btn-action btn-approve" onclick="AideaPayments.approve(' + p.id + ')">Approve</button>' +
                    '<button class="btn-action btn-reject" onclick="AideaPayments.reject(' + p.id + ')">Reject</button>';
            } else if (p.status === 'Completed' || p.status === 'Paid') {
                actions = '<button class="btn-action" onclick="AideaPayments.openView(' + i + ')">View</button>' +
                    '<button class="btn-action btn-receipt" onclick="AideaPayments.sendCertificate(' + p.id + ')">Certificate</button>';
            } else {
                actions = '<button class="btn-action" onclick="AideaPayments.openView(' + i + ')">View</button>' +
                    '<span class="none">—</span>';
            }

            return '<tr class="' + (isPending(p) ? 'row-pending' : '') + '">' +
                '<td data-label="Student"><strong>' + escHtml(p.student) + '</strong>' +
                (p.student_id || p.studentId ? '<small>' + escHtml(p.student_id || p.studentId) + '</small>' : '') + '</td>' +
                '<td data-label="Service">' + escHtml(p.service) + '</td>' +
                '<td data-label="Amount">' + peso(p.amount) + '</td>' +
                '<td data-label="GCash ref"><code>' + escHtml(p.gcash_ref || p.gcashRef || '—') + '</code></td>' +
                '<td data-label="Status">' + statusBadge(p.status) + '</td>' +
                '<td data-label="Date">' + escHtml(p.date || p.date_iso || p.dateISO || '—') + '</td>' +
                '<td data-label="Actions" class="action-cell">' + actions + '</td>' +
                '<td data-label="Send files" class="action-cell">' + sendCell(p) + '</td>' +
                '</tr>';
        }).join('');
    }

    // ── Approve / reject ─────────────────────────────────────────────────────
    async function approvePayment(id) {
        const ok = await openConfirm({ title: 'Approve payment?', message: 'This marks the payment as completed.', confirmText: 'Approve' });
        if (!ok) return;
        try {
            await updatePaymentStatus(id, 'approve');
            await reload();
            showToast('Payment approved.', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to approve payment.', 'error');
        }
    }

    async function rejectPayment(id) {
        const ok = await openConfirm({ title: 'Reject payment?', message: 'The student will see this payment as cancelled.', confirmText: 'Reject', danger: true });
        if (!ok) return;
        try {
            await updatePaymentStatus(id, 'reject');
            await reload();
            showToast('Payment rejected.', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to reject payment.', 'error');
        }
    }

    // ── View modal (proof image + research info) ───────────────────────────
    function renderResearchInfo(p) {
        const raw = p.research_items;
        if (!raw) return '';
        let items;
        try { items = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch (e) { return ''; }
        if (!Array.isArray(items) || !items.length) return '';

        const rows = items.map(function (item) {
            if (item.type === 'text') {
                return '<div class="vm-row"><span class="vm-label">' + escHtml(item.label) + '</span>' +
                    '<span class="vm-val">' + escHtml(item.value || '—') + '</span></div>';
            }
            if (item.type === 'image' && item.file_base64) {
                return '<div style="margin-bottom:10px;">' +
                    '<div class="vm-label" style="margin-bottom:6px;">' + escHtml(item.label) + '</div>' +
                    '<img class="vm-image" src="' + item.file_base64 + '" alt="' + escHtml(item.file_name || 'Image') + '" />' +
                    '</div>';
            }
            if (item.type === 'file' && item.file_base64) {
                return '<div class="vm-row"><span class="vm-label">' + escHtml(item.label) + '</span>' +
                    '<a class="vm-file-link" href="' + item.file_base64 + '" download="' + escHtml(item.file_name || 'file') + '">' +
                    escHtml(item.file_name || 'Download') + '</a></div>';
            }
            return '<div class="vm-row"><span class="vm-label">' + escHtml(item.label) + '</span>' +
                '<span class="vm-val vm-muted">No data submitted</span></div>';
        }).join('');

        return '<div class="vm-section"><div class="vm-section-title">Research info</div>' + rows + '</div>';
    }

    function openViewModal(i) {
        const p = filtered[i];
        if (!p) return;

        const body = document.getElementById('viewModalBody');
        const gcashRef = p.gcash_ref || p.gcashRef || '—';
        const studentId = p.student_id || p.studentId || '—';
        const proofSrc = p.proof_image || p.proofImage || null;

        body.innerHTML =
            '<div class="vm-row"><span class="vm-label">Reference #</span><span class="vm-val">' + escHtml(p.ref || p.id) + '</span></div>' +
            '<div class="vm-row"><span class="vm-label">Student</span><span class="vm-val">' + escHtml(p.student) + ' <span class="vm-muted">(' + escHtml(studentId) + ')</span></span></div>' +
            '<div class="vm-row"><span class="vm-label">Service</span><span class="vm-val">' + escHtml(p.service) + '</span></div>' +
            '<div class="vm-row"><span class="vm-label">Amount</span><span class="vm-val vm-amount">' + peso(p.amount) + '</span></div>' +
            '<div class="vm-row"><span class="vm-label">GCash ref #</span><span class="vm-val"><code>' + escHtml(gcashRef) + '</code></span></div>' +
            '<div class="vm-row"><span class="vm-label">Date</span><span class="vm-val">' + escHtml(p.date || p.date_iso || p.dateISO || '—') + '</span></div>' +
            '<div class="vm-row"><span class="vm-label">Status</span><span class="vm-val">' + statusBadge(p.status) + '</span></div>' +
            renderResearchInfo(p) +
            (proofSrc
                ? '<div class="vm-section"><div class="vm-section-title">Payment proof</div><img class="vm-image" src="' + proofSrc + '" alt="Payment proof" /></div>'
                : '<div class="vm-row"><span class="vm-label">Payment proof</span><span class="vm-val vm-muted">No image uploaded</span></div>') +
            (p.status === 'Pending'
                ? '<div class="vm-actions">' +
                '<button class="btn-action btn-approve" onclick="AideaPayments.approveFromView(' + p.id + ')">Approve</button>' +
                '<button class="btn-action btn-reject" onclick="AideaPayments.rejectFromView(' + p.id + ')">Reject</button>' +
                '</div>'
                : '');

        openDialog('viewModal');
    }

    async function approveFromView(id) { closeDialog('viewModal'); await approvePayment(id); }
    async function rejectFromView(id) { closeDialog('viewModal'); await rejectPayment(id); }

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
    }

    // ── Reload ───────────────────────────────────────────────────────────────
        // -- Send files / Certificate dialog ------------------------------------
    var MAX_FILE_MB = 5;

    function isAllowedFile(f) {
        return f.type === 'application/pdf' || f.type.indexOf('image/') === 0;
    }
    function isDoneStatus(p) { return p.status === 'Completed' || p.status === 'Paid'; }
    function sendCell(p) {
        return isDoneStatus(p)
            ? '<button class="btn-action btn-send" onclick="AideaPayments.sendFiles(' + p.id + ')">Send files</button>'
            : '<span class="none">\u2014</span>';
    }

    async function uploadFetch(path, formData) {
        const token = getToken();
        const res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: Object.assign({ Accept: 'application/json' },
                token ? { Authorization: 'Bearer ' + token } : {}),
            body: formData // browser sets the multipart boundary itself
        });
        if (!res.ok) {
            const err = await res.json().catch(function () { return {}; });
            throw err;
        }
        return res.json();
    }

    function openSendDialog(id, mode) {
        const p = allPayments.find(function (x) { return String(x.id) === String(id); });
        if (!p) return;

        const isCert = mode === 'certificate';
        let files = [];

        const opener = document.activeElement;
        const overlay = el('div', 'modal-backdrop');
        const box = el('div', 'modal');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');

        const head = el('div', 'modal-head');
        head.appendChild(el('h3', 'modal-title', isCert ? 'Send certificate' : 'Send files'));
        box.appendChild(head);

        const body = el('div', 'modal-body');
        body.appendChild(el('p', 'vm-muted', 'To: ' + p.student + ' - ' + p.service));

        const zone = el('label', 'dropzone');
        zone.appendChild(el('strong', '', isCert ? 'Choose certificate file' : 'Choose files'));
        zone.appendChild(el('small', '', 'PDF or image (JPG, PNG, WEBP) \u00B7 max ' + MAX_FILE_MB + ' MB each'));
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,image/*';
        input.multiple = !isCert;
        input.hidden = true;
        zone.appendChild(input);
        body.appendChild(zone);

        const list = el('ul', 'file-list');
        body.appendChild(list);

        const msg = document.createElement('textarea');
        msg.className = 'form-control msg-input';
        msg.rows = 3;
        msg.placeholder = 'Message to the student (optional)';
        body.appendChild(msg);
        box.appendChild(body);

        const actions = el('div', 'modal-actions');
        const cancel = el('button', 'modal-btn modal-btn-cancel', 'Cancel');
        cancel.type = 'button';
        const send = el('button', 'modal-btn modal-btn-primary', 'Send');
        send.type = 'button';
        send.disabled = true;
        actions.appendChild(cancel);
        actions.appendChild(send);
        box.appendChild(actions);

        function renderList() {
            list.innerHTML = '';
            files.forEach(function (f, idx) {
                const li = el('li', 'file-item');
                li.appendChild(el('span', 'file-name', f.name));
                li.appendChild(el('span', 'vm-muted', (f.size / 1024 / 1024).toFixed(2) + ' MB'));
                const x = el('button', 'file-remove', '\u2715');
                x.type = 'button';
                x.setAttribute('aria-label', 'Remove ' + f.name);
                x.addEventListener('click', function () { files.splice(idx, 1); renderList(); });
                li.appendChild(x);
                list.appendChild(li);
            });
            send.disabled = files.length === 0;
        }

        input.addEventListener('change', function () {
            const picked = Array.prototype.slice.call(input.files);
            input.value = '';
            picked.forEach(function (f) {
                if (!isAllowedFile(f)) { showToast(f.name + ': only PDF or image files.', 'error'); return; }
                if (f.size > MAX_FILE_MB * 1024 * 1024) { showToast(f.name + ' is over ' + MAX_FILE_MB + ' MB.', 'error'); return; }
                if (isCert) files = [f]; else files.push(f);
            });
            renderList();
        });

        function close() {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            document.body.classList.remove('no-scroll');
            if (opener && opener.focus && document.contains(opener)) opener.focus();
        }
        function onKey(e) { if (e.key === 'Escape') close(); }

        cancel.addEventListener('click', close);
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
        document.addEventListener('keydown', onKey);

        send.addEventListener('click', async function () {
            if (!files.length) return;
            const fd = new FormData();
            fd.append('type', isCert ? 'certificate' : 'files');
            fd.append('message', msg.value.trim());
            files.forEach(function (f) { fd.append('files[]', f); });

            send.disabled = true;
            cancel.disabled = true;
            send.textContent = 'Sending...';
            try {
                const result = await uploadFetch('/payments/' + p.id + '/send-files', fd);
                close();
                showSendResult(isCert, p.student, result);
            } catch (err) {
                console.error(err);
                send.disabled = false;
                cancel.disabled = false;
                send.textContent = 'Send';
                showSendError(box, body, err);
            }
        });

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.body.classList.add('no-scroll');
        cancel.focus();
    }
    async function reload() {
        try {
            allPayments = await apiFetch('/payments');
        } catch (err) {
            console.error('Failed to load payments:', err);
            showToast('Failed to load payments.', 'error');
            allPayments = [];
        }
        updateStats();
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
        const t = el('div', 'toast toast-' + (type || 'success'), msg);
        wrap.appendChild(t);
        setTimeout(function () { t.remove(); }, 3200);
    }

    // ── Public bridge for inline handlers in generated markup ──────────────
    window.AideaPayments = {
        openView: openViewModal,
        approve: approvePayment,
        reject: rejectPayment,
        approveFromView: approveFromView,
        rejectFromView: rejectFromView,
        sendFiles: function (id) { openSendDialog(id, 'files'); },
        sendCertificate: function (id) { openSendDialog(id, 'certificate'); },
    };

    // ── Init ─────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        const user = getUser();
        if (user) renderAdminIdentity(user);

        initTheme();
        initDrawer();
        initProfileMenu();

        document.getElementById('searchInput').addEventListener('input', function (e) {
            searchTerm = e.target.value;
            render();
        });
        document.getElementById('filterStatus').addEventListener('change', function (e) {
            statusFilter = e.target.value;
            render();
        });

        document.querySelectorAll('[data-close]').forEach(function (b) {
            b.addEventListener('click', function () { closeDialog(b.dataset.close); });
        });
        document.querySelectorAll('.modal-backdrop').forEach(function (overlay) {
            overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeDialog(overlay.id); });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            const dlg = document.getElementById('viewModal');
            if (dlg && !dlg.hidden) closeDialog('viewModal');
        });

        reload();
    });
})();