// payment.js
// Reads ALL payments from GET /api/payments. Admin can approve (→ Paid) or
// reject any pending payment. Restyled to share the dashboard's theme,
// drawer, profile menu and sign-out, with confirm dialogs instead of confirm().
(function () {
    'use strict';

    const API_BASE = 'https://aideanc-production.up.railway.app/api';
    const LOGIN_URL = '../../user/login/login.html';

    let allPayments = [];
    let filtered = [];
    let searchTerm = '';
    let statusFilter = '';
    let serviceFilter = '';
    function fillServiceOptions() {
        const sv = document.getElementById('filterService');
        if (!sv) return;
        const names = [];
        allPayments.forEach(function (p) {
            const s = String(p.service || '').trim();
            if (s && names.indexOf(s) < 0) names.push(s);
        });
        names.sort();
        if (sv.options.length === names.length + 1) return;
        const cur = sv.value;
        sv.innerHTML = '<option value="">All services</option>' + names.map(function (n) {
            return '<option value="' + escHtml(n) + '">' + escHtml(n) + '</option>';
        }).join('');
        sv.value = cur;
    }

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
        const cls = { Completed: 'badge-success', Ongoing: 'badge-ongoing', Pending: 'badge-warning', Cancelled: 'badge-danger' };
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

        const totalRev = allPayments.reduce(function (s, p) { return (p.status === 'Cancelled' || p.status === 'Rejected') ? s : s + Number(p.amount); }, 0);
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
    var activeCertTab = 'certificates';
    var certTypeMap = {};
    function acPad(n) { return 'RCP-' + String(n).padStart(4, '0'); }
    function acIsPdf(r) { return /\.pdf($|\?)/i.test((r && (r.name || r.url)) || ''); }
    function acIsImg(r) { return /\.(png|jpe?g|gif|webp|svg|bmp)($|\?)/i.test((r && (r.name || r.url)) || ''); }
    function acPreview(r) {
        if (acIsImg(r)) return '<div class="ac-preview"><img src="' + escHtml(r.url) + '" alt="" loading="lazy"></div>';
        return '<div class="ac-preview ac-file"><strong>' + (acIsPdf(r) ? 'PDF' : 'FILE') + '</strong><span>' + escHtml(r.name || '') + '</span></div>';
    }
    function renderSentCards() {
        var grid = document.getElementById('acGrid');
        if (!grid) return;
        var items = allPayments.filter(function (p) {
            return certTypeMap[String(p.id)] && sentType(p) === activeCertTab;
        });
        if (!items.length) {
            grid.innerHTML = '<div class="ac-empty"><strong>Nothing here yet</strong><div>' +
                (activeCertTab === 'files' ? 'Files you send will appear here.' : 'Certificates you send will appear here.') + '</div></div>';
            return;
        }
        grid.innerHTML = items.map(function (p) {
            var r = certTypeMap[String(p.id)];
            var isFiles = activeCertTab === 'files';
            return '<div class="ac-card">' +
                '<div class="ac-row"><span class="ac-no">' + acPad(p.id) + '</span>' +
                '<span class="ac-badge">' + (isFiles ? 'Files' : 'Certificate') + '</span></div>' +
                '<div class="ac-service">' + escHtml(p.service) + '</div>' +
                '<div class="ac-student">' + escHtml(p.student) + '</div>' +
                acPreview(r) +
                '<div class="ac-meta"><span>GCash: ' + escHtml(p.gcash_ref || p.gcashRef || '\u2014') + '</span>' +
                '<span>' + escHtml(p.date || p.date_iso || p.dateISO || '\u2014') + '</span></div>' +
                '<div class="ac-meta"><span>Ref: ' + escHtml(p.ref || '\u2014') + ' \u00B7 ' + escHtml(p.method || 'GCash') + '</span></div>' +
                '<div class="ac-actions">' +
                '<button type="button" class="ac-btn" data-ac-view="' + p.id + '">View</button>' +
                '<button type="button" class="ac-btn" data-ac-dl="' + p.id + '">Download</button>' +
                '</div></div>';
        }).join('');
    }
    async function acDownload(id) {
        var r = certTypeMap[String(id)];
        if (!r) return;
        try {
            var res = await fetch(r.url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var blob = await res.blob();
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = r.name || 'file';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        } catch (e) {
            window.open(r.url, '_blank', 'noopener');
        }
    }
    function acView(id) {
        var r = certTypeMap[String(id)];
        if (!r) return;
        if (!acIsImg(r) && !acIsPdf(r)) { window.open(r.url, '_blank', 'noopener'); return; }
        var p = allPayments.find(function (x) { return String(x.id) === String(id); }) || {};
        var o = document.createElement('div');
        o.className = 'ac-overlay';
        o.innerHTML = '<div class="ac-viewer" role="dialog" aria-modal="true">' +
            '<div class="ac-viewer-head"><div><h3>' + escHtml(r.name || 'File') + '</h3><p>' + escHtml(p.service || '') + ' \u00B7 ' + escHtml(p.student || '') + '</p></div>' +
            '<button type="button" class="ac-x" data-ac-close="1" aria-label="Close">\u2715</button></div>' +
            '<div class="ac-viewer-media">' + (acIsPdf(r)
                ? '<iframe src="' + escHtml(r.url) + '" title="File"></iframe>'
                : '<img src="' + escHtml(r.url) + '" alt="">') + '</div>' +
            '<div class="ac-viewer-foot"><button type="button" class="ac-btn" data-ac-close="1">Close</button>' +
            '<button type="button" class="ac-btn ac-primary" data-ac-download="1">Download</button></div></div>';
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        var close = function () { document.removeEventListener('keydown', onKey); o.remove(); };
        o.addEventListener('click', function (e) {
            if (e.target === o || e.target.closest('[data-ac-close]')) close();
            else if (e.target.closest('[data-ac-download]')) acDownload(id);
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(o);
    }
    document.addEventListener('click', function (e) {
        var v = e.target.closest && e.target.closest('[data-ac-view]');
        if (v) { acView(v.getAttribute('data-ac-view')); return; }
        var d = e.target.closest && e.target.closest('[data-ac-dl]');
        if (d) acDownload(d.getAttribute('data-ac-dl'));
    });
    function sentType(p) {
        var r = certTypeMap[String(p.id)];
        return r && r.type === 'files' ? 'files' : 'certificates';
    }
    function matchTab(p) { return sentType(p) === activeCertTab; }
    function updateTabs() {
        var f = allPayments.filter(function (p) { return sentType(p) === 'files'; }).length;
        var c = document.getElementById('countCert');
        var d = document.getElementById('countFiles');
        if (c) c.textContent = allPayments.filter(function (p) { return certTypeMap[String(p.id)] && sentType(p) === 'certificates'; }).length;
        if (d) d.textContent = f;
        document.querySelectorAll('[data-cert-tab]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-cert-tab') === activeCertTab);
        });
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-cert-tab]');
        if (!b) return;
        activeCertTab = b.getAttribute('data-cert-tab');
        render();
    });
    function render() {
        updateTabs(); renderSentCards();
        const q = searchTerm.toLowerCase();
        fillServiceOptions();
        filtered = allPayments.filter(function (p) {
            const matchQ = !q || p.student.toLowerCase().includes(q) ||
                (p.gcash_ref || p.gcashRef || '').toLowerCase().includes(q) ||
                (p.ref || '').toLowerCase().includes(q);
            const normStatus = p.status === 'Paid' ? 'Completed' : p.status === 'Rejected' ? 'Cancelled' : p.status;
            const matchSt = !statusFilter || normStatus === statusFilter;
            const matchSv = !serviceFilter || String(p.service || '') === serviceFilter;
            return matchQ && matchSt && matchSv;
        });

        const isPending = function (p) { return p.status === 'Pending'; };
        const tbody = document.getElementById('paymentsBody');
        if (!tbody) return;

        if (!allPayments.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">No payments yet.</td></tr>';
            return;
        }
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">No payments match your filter.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(function (p, i) {
            let actions;
            if (isPending(p)) {
                actions = '<button class="btn-action" onclick="AideaPayments.openView(' + i + ')">View</button>' +
                    '<button class="btn-action btn-approve" onclick="AideaPayments.approve(' + p.id + ')">Approve</button>' +
                    '<button class="btn-action btn-reject" onclick="AideaPayments.reject(' + p.id + ')">Reject</button>';
            } else if (p.status === 'Completed' || p.status === 'Paid' || p.status === 'Ongoing') {
                actions = '<button class="btn-action" onclick="AideaPayments.openView(' + i + ')">View</button>';
            } else {
                actions = '<button class="btn-action" onclick="AideaPayments.openView(' + i + ')">View</button>' +
                    '<span class="none">—</span>';
            }

            const svcName = String(p.service || '').toLowerCase();
            const reviewerRole = /grammar/.test(svcName) ? 'grammarian' : (/data analysis|statistic/.test(svcName) ? 'statistician' : '');
            if (reviewerRole && p.status !== 'Cancelled' && p.status !== 'Rejected') {
                actions += assignButtons(p, reviewerRole);
            } if (false) {
                actions += '<button type="button" class="btn-action" onclick="AideaPayments.sendReviewer(' + p.id + ',\'' + reviewerRole + '\')">' + 'Assigned' + '</button>';
            }
        return '<tr class="' + (isPending(p) ? 'row-pending' : '') + '">' +
                '<td data-label="Student"><strong>' + escHtml(p.student) + '</strong>' +
                (p.student_id || p.studentId ? '<small>' + escHtml(p.student_id || p.studentId) + '</small>' : '') + '</td>' +
                '<td data-label="Service">' + escHtml(p.service) + '</td>' +
                '<td data-label="Amount">' + peso(p.amount) + '</td>' +
                '<td data-label="GCash ref"><code>' + escHtml(p.gcash_ref || p.gcashRef || '—') + '</code></td>' +
                '<td data-label="Status">' + statusBadge(p.status) + '</td>' +
                '<td data-label="Date">' + escHtml(p.date || p.date_iso || p.dateISO || '—') + '</td>' +
                '<td data-label="Actions" class="action-cell">' + kebabMenu(actions + sendCell(p)) + '</td>' +
                '</tr>';
        }).join('');
    }

    // ── Approve / reject ─────────────────────────────────────────────────────
    // 3-dots actions menu
    function kebabMenu(inner) {
        inner = String(inner).replace(/<span class="none">[^<]*<\/span>/g, '');
        return '<div class="kebab">' +
            '<button type="button" class="kebab-btn" aria-label="Actions" aria-haspopup="true" aria-expanded="false">&#8942;</button>' +
            '<div class="kebab-menu" role="menu">' + inner + '</div>' +
            '</div>';
    }
    (function () {
        function closeAll() {
            document.querySelectorAll('.kebab-menu.open').forEach(function (m) {
                m.classList.remove('open');
                var b = m.parentNode.querySelector('.kebab-btn');
                if (b) b.setAttribute('aria-expanded', 'false');
            });
        }
        document.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('.kebab-btn') : null;
            if (btn) {
                var menu = btn.parentNode.querySelector('.kebab-menu');
                var wasOpen = menu.classList.contains('open');
                closeAll();
                if (!wasOpen) {
                    var r = btn.getBoundingClientRect();
                    menu.classList.add('open');
                    var mh = menu.offsetHeight, mw = menu.offsetWidth;
                    var top = r.bottom + 4;
                    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
                    var left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
                    menu.style.top = top + 'px';
                    menu.style.left = left + 'px';
                    btn.setAttribute('aria-expanded', 'true');
                }
                return;
            }
            if (e.target.closest && e.target.closest('.kebab-menu')) { setTimeout(closeAll, 0); return; }
            closeAll();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
        window.addEventListener('resize', closeAll);
        window.addEventListener('scroll', closeAll, true);
    })();

    async function approvePayment(id) {
        const ok = await openConfirm({ title: 'Approve payment?', message: 'Approving marks the payment as ongoing. It becomes completed once you send the files.', confirmText: 'Approve' });
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

        // -- File viewer (second modal) --------------------------------------
    var fileViewerUrl = null;

    function getResearchItems(p) {
        var raw = p && p.research_items;
        if (!raw) return [];
        try {
            var items = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(items) ? items : [];
        } catch (e) { return []; }
    }

    function renderResearchInfoV2(p, pi) {
        var items = getResearchItems(p);
        if (!items.length) return '';
        var rows = items.map(function (item, ii) {
            if (item.type === 'text') {
                return '<div class="vm-row"><span class="vm-label">' + escHtml(item.label) + '</span>' +
                    '<span class="vm-val">' + escHtml(item.value || '-') + '</span></div>';
            }
            if ((item.type === 'file' || item.type === 'image') && item.file_base64) {
                return '<div class="vm-row"><span class="vm-label">' + escHtml(item.label) + '</span>' +
                    '<button type="button" class="btn-action" onclick="AideaPayments.openFile(' + pi + ',' + ii + ')">' +
                    escHtml(item.file_name || 'View file') + '</button></div>';
            }
            return '<div class="vm-row"><span class="vm-label">' + escHtml(item.label) + '</span>' +
                '<span class="vm-val vm-muted">No data submitted</span></div>';
        }).join('');
        return '<div class="vm-section"><div class="vm-section-title">Research info</div>' + rows + '</div>';
    }

    function dataUrlToBlob(dataUrl) {
        var parts = String(dataUrl).split(',');
        var m = parts[0].match(/:(.*?);/);
        var mime = m ? m[1] : 'application/octet-stream';
        var bin = atob(parts[1] || '');
        var arr = new Uint8Array(bin.length);
        for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        return new Blob([arr], { type: mime });
    }

    function closeFileViewer() {
        var m = document.getElementById('fileModal');
        if (m) m.hidden = true;
        var b = document.getElementById('fileModalBody');
        if (b) b.innerHTML = '';
        if (fileViewerUrl) { URL.revokeObjectURL(fileViewerUrl); fileViewerUrl = null; }
    }

    function ensureFileModal() {
        var m = document.getElementById('fileModal');
        if (m) return m;
        m = document.createElement('div');
        m.className = 'modal-backdrop';
        m.id = 'fileModal';
        m.hidden = true;
        m.innerHTML =
            '<div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="fileModalTitle">' +
            '<div class="modal-head"><h3 class="modal-title" id="fileModalTitle">File</h3>' +
            '<button class="modal-x" type="button" id="fileModalClose" aria-label="Close">&#10005;</button></div>' +
            '<div class="modal-body" id="fileModalBody"></div></div>';
        document.body.appendChild(m);
        document.getElementById('fileModalClose').addEventListener('click', closeFileViewer);
        m.addEventListener('click', function (e) { if (e.target === m) closeFileViewer(); });
        document.addEventListener('keydown', function (e) {
            var fm = document.getElementById('fileModal');
            if (e.key === 'Escape' && fm && !fm.hidden) { e.stopPropagation(); closeFileViewer(); }
        }, true);
        return m;
    }

    function openFileViewer(pi, ii) {
        var p = filtered[pi];
        var item = getResearchItems(p)[ii];
        if (!item || !item.file_base64) return;

        var m = ensureFileModal();
        if (fileViewerUrl) { URL.revokeObjectURL(fileViewerUrl); fileViewerUrl = null; }

        var blob;
        try { blob = dataUrlToBlob(item.file_base64); }
        catch (e) { showToast('Could not open this file.', 'error'); return; }
        fileViewerUrl = URL.createObjectURL(blob);

        var name = item.file_name || 'file';
        var isImage = blob.type.indexOf('image/') === 0;
        var isPdf = blob.type === 'application/pdf';
        var preview;
        if (isImage) {
            preview = '<img class="vm-image" src="' + fileViewerUrl + '" alt="' + escHtml(name) + '" />';
        } else if (isPdf) {
            preview = '<iframe src="' + fileViewerUrl + '" title="' + escHtml(name) + '" style="width:100%;height:65vh;border:0;"></iframe>';
        } else {
            preview = '<p class="vm-muted">Preview is not available for this file type. Use Download.</p>';
        }

        document.getElementById('fileModalTitle').textContent = item.label || 'File';
        document.getElementById('fileModalBody').innerHTML =
            '<div class="vm-row"><span class="vm-label">File</span><span class="vm-val">' + escHtml(name) + '</span></div>' +
            preview +
            '<div class="vm-actions"><a class="btn-action btn-approve" href="' + fileViewerUrl + '" download="' + escHtml(name) + '">Download</a></div>';
        m.hidden = false;
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
            renderResearchInfoV2(p, i) +
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
    var MAX_FILE_MB = 20;

    function isAllowedFile(f) {
        return f.type === 'application/pdf' || f.type.indexOf('image/') === 0;
    }
    function isDoneStatus(p) { return p.status === 'Completed' || p.status === 'Paid' || p.status === 'Ongoing'; }
    function dataUrlToFile(dataUrl, name) {
        try {
            const comma = String(dataUrl).indexOf(',');
            if (comma < 0) return null;
            const meta = dataUrl.slice(5, comma);
            if (meta.indexOf(';base64') < 0) return null;
            const mime = meta.split(';')[0] || 'application/octet-stream';
            const bin = atob(dataUrl.slice(comma + 1));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new File([bytes], name, { type: mime });
        } catch (e) { return null; }
    }

    function getResearchFiles(p) {
        const out = [];
        try {
            const raw = p.research_items;
            const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!Array.isArray(items)) return out;
            items.forEach(function (item, idx) {
                if (!item || !item.file_base64 || (item.type !== 'file' && item.type !== 'image')) return;
                const name = item.file_name || ((item.label || 'file') + '-' + (idx + 1));
                const f = dataUrlToFile(item.file_base64, name);
                if (f) out.push({ name: name, label: item.label || name, file: f });
            });
        } catch (e) { /* ignore bad research data */ }
        return out;
    }
    function buildReviewerNote(p, userNote) {
        const lines = [];
        if (userNote) { lines.push(userNote); lines.push(''); }
        lines.push('REQUEST DETAILS');
        lines.push('Student: ' + (p.student || '-'));
        const sid = p.student_id || p.studentId;
        if (sid) lines.push('Student ID: ' + sid);
        lines.push('Service: ' + (p.service || '-'));
        const d = p.date || p.date_iso || p.dateISO;
        if (d) lines.push('Date: ' + d);
        if (p.status) lines.push('Status: ' + p.status);
        try {
            const raw = p.research_items;
            const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(items)) {
                items.forEach(function (item) {
                    if (item && item.type === 'text') lines.push((item.label || 'Info') + ': ' + (item.value || '-'));
                });
            }
        } catch (e) { /* ignore bad research data */ }
        return lines.join('\n');
    }
    function openReviewerDialog(id, role) {
        const p = allPayments.find(function (x) { return String(x.id) === String(id); });
        if (!p) return;

        if (p.status === 'Cancelled' || p.status === 'Rejected') { alert('Cancelled requests cannot be sent to a reviewer.'); return; }
        const label = role === 'statistician' ? 'Statistician' : 'Grammarian';

        const opener = document.activeElement;
        const overlay = el('div', 'modal-backdrop');
        const box = el('div', 'modal');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');

        const head = el('div', 'modal-head');
        head.appendChild(el('h3', 'modal-title', 'Send to ' + label));
        box.appendChild(head);

        const body = el('div', 'modal-body');
        body.appendChild(el('p', 'vm-muted', 'Student: ' + p.student + ' - ' + p.service));

        const select = document.createElement('select');
        select.className = 'form-control';
        select.innerHTML = '<option value="" disabled selected>Loading ' + label.toLowerCase() + 's...</option>';
                body.appendChild(select);
        const rFiles = getResearchFiles(p);
        body.appendChild(el('p', 'vm-muted', rFiles.length ? ('Files sent with this request: ' + rFiles.map(function (f) { return f.name; }).join(', ')) : 'No uploaded file in this request.'));

        const note = document.createElement('textarea');
        note.className = 'form-control msg-input';
        note.rows = 3;
        note.placeholder = 'Note (optional)';
        body.appendChild(note);
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

        function refreshSend() { send.disabled = !select.value; }
        select.addEventListener('change', refreshSend);

        (async function loadReviewers() {
            try {
                const token = getToken();
                const res = await fetch(API_BASE + '/admin/reviewers', {
                    headers: Object.assign({ Accept: 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {})
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const json = await res.json();
                const all = Array.isArray(json) ? json : (json.data || json.reviewers || []);
                const mine = all.filter(function (r) { return r && r.role === role; });
                if (!mine.length) {
                    console.warn('[Requests] No reviewers with role', role, all);
                    select.innerHTML = '<option value="" disabled selected>No ' + label.toLowerCase() + ' accounts found</option>';
                    return;
                }
                select.innerHTML = '<option value="" disabled selected>Choose a ' + label.toLowerCase() + '</option>' +
                    mine.map(function (r) {
                        return '<option value="' + escHtml(String(r.id)) + '">' + escHtml(r.name || r.full_name || r.email || ('#' + r.id)) + '</option>';
                    }).join('');
            } catch (err) {
                console.error(err);
                select.innerHTML = '<option value="" disabled selected>Couldn\u2019t load ' + label.toLowerCase() + 's</option>';
            }
        })();

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
            if (!select.value) return;
            send.disabled = true;
            cancel.disabled = true;
            send.textContent = 'Sending...';
            try {
                const fd = new FormData();
                fd.append('reviewer_id', select.value);
                fd.append('note', buildReviewerNote(p, note.value.trim()));
                fd.append('title', (p.service || 'Request') + ' - ' + (p.student || ''));
                fd.append('student_name', p.student || '');
                fd.append('payment_id', String(p.id));
                if (!rFiles.length) {
                    await uploadFetch('/admin/assignments', fd);
                } else {
                    const many = new FormData();
                    many.append('reviewer_id', select.value);
                    many.append('note', buildReviewerNote(p, note.value.trim()));
                    many.append('title', (p.service || 'Request') + ' - ' + (p.student || ''));
                    many.append('student_name', p.student || '');
                    many.append('payment_id', String(p.id));
                    rFiles.forEach(function (rf) {
                        many.append('files[]', rf.file);
                        many.append('file_labels[]', rf.label);
                    });
                    await uploadFetch('/admin/assignments', many);
                }
                close();
                showToast('Sent to the ' + label.toLowerCase() + '.', 'success');
                var old = assignmentFor(p);
                if (old && old.status === 'pending') {
                    apiFetch('/admin/assignments/' + old.id, { method: 'DELETE' }).catch(function () {}).then(loadAssignments);
                } else {
                    loadAssignments();
                }
            } catch (err) {
                console.error(err);
                send.textContent = 'Send';
                cancel.disabled = false;
                refreshSend();
                showToast(err && err.message ? err.message : 'Could not send. Try again.', 'error');
            }
        });

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.body.classList.add('no-scroll');
    }
        var assignmentList = [];

    function assignmentFor(p) {
        var list = assignmentList || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].payment_id != null && String(list[i].payment_id) === String(p.id)) return list[i];
        }
        return null;
    }

    function assignButtons(p, role) {
        var a = assignmentFor(p);
        var open = 'AideaPayments.sendReviewer(' + p.id + ',\'' + role + '\')';
        if (!a) {
            return '<button type="button" class="btn-action" onclick="' + open + '">Assigned</button>';
        }
        var html = '<button type="button" class="btn-action" onclick="' + open + '">Re-assign</button>';
        if (a.status === 'pending') {
            html += '<button type="button" class="btn-action btn-reject" onclick="AideaPayments.cancelAssignment(' + a.id + ')">Cancel assignment</button>';
        }
        return html;
    }

    async function loadAssignments() {
        try {
            var json = await apiFetch('/admin/assignments');
            assignmentList = Array.isArray(json) ? json : (json.data || []);
            render();
        } catch (err) {
            console.warn('[Requests] assignments not loaded', err);
        }
    }

        function confirmModal(title, message, okText, noText) {
        return new Promise(function (resolve) {
            var opener = document.activeElement;
            var overlay = el('div', 'modal-backdrop');
            var box = el('div', 'modal');
            box.setAttribute('role', 'alertdialog');
            box.setAttribute('aria-modal', 'true');

            var head = el('div', 'modal-head');
            head.appendChild(el('h3', 'modal-title', title));
            box.appendChild(head);

            var body = el('div', 'modal-body');
            body.appendChild(el('p', 'vm-muted', message));
            box.appendChild(body);

            var row = el('div', '');
            row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;padding:0 20px 20px;flex-wrap:wrap;';
            var no = el('button', 'btn-action', noText || 'Cancel');
            no.type = 'button';
            var ok = el('button', 'btn-action btn-reject', okText || 'OK');
            ok.type = 'button';
            row.appendChild(no);
            row.appendChild(ok);
            box.appendChild(row);

            function done(v) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                document.body.classList.remove('no-scroll');
                if (opener && opener.focus && document.contains(opener)) opener.focus();
                resolve(v);
            }
            function onKey(e) { if (e.key === 'Escape') done(false); }

            no.addEventListener('click', function () { done(false); });
            ok.addEventListener('click', function () { done(true); });
            overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(false); });
            document.addEventListener('keydown', onKey);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            document.body.classList.add('no-scroll');
            no.focus();
        });
    }
    async function cancelAssignment(id) {
        if (!(await confirmModal('Cancel assignment', 'Cancel this assignment? The reviewer will no longer receive it.', 'Cancel assignment', 'Keep'))) return;
        try {
            await apiFetch('/admin/assignments/' + id, { method: 'DELETE' });
            showToast('Assignment cancelled.', 'success');
            await loadAssignments();
        } catch (err) {
            console.error(err);
            showToast(err && err.message ? err.message : 'Could not cancel. Try again.', 'error');
        }
    }
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

        const genBtn = el('button', 'modal-btn', 'Generate certificate');
        genBtn.type = 'button';
        genBtn.style.margin = '10px 0 0';
        genBtn.addEventListener('click', function () {
            if (!window.AideaCertGen) { alert('The certificate generator did not load. Hard-refresh the page (Ctrl+Shift+R).'); return; }
            window.AideaCertGen.open({
                service: p.service,
                onDone: function (file) {
                    files = isCert ? [file] : files.concat([file]);
                    renderList();
                    send.disabled = false;
                }
            });
        });
        body.appendChild(genBtn);

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
                reload().catch(function () {});
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
        try { certTypeMap = await apiFetch('/certificates') || {}; } catch (e) { certTypeMap = {}; }
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
        openFile: openFileViewer,
        approve: approvePayment,
        reject: rejectPayment,
        approveFromView: approveFromView,
        rejectFromView: rejectFromView,
        sendFiles: function (id) { openSendDialog(id, 'files'); },
        sendReviewer: function (id, role) { openReviewerDialog(id, role); },
        cancelAssignment: function (id) { cancelAssignment(id); },
        sendCertificate: function (id) { openSendDialog(id, 'certificate'); },
    };

    // ── Init ─────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        const user = getUser();
        if (user) renderAdminIdentity(user);

        initTheme();
        initDrawer();
        initProfileMenu();
        loadAssignments();

        document.getElementById('searchInput').addEventListener('input', function (e) {
            searchTerm = e.target.value;
            render();
        });
        (function buildNestedFilter() {
        const sv = document.getElementById('filterService');
        const st = document.getElementById('filterStatus');
        if (!sv || !st || document.getElementById('nfWrap')) return;
        sv.style.display = 'none';
        st.style.display = 'none';
        const STATUSES = [['', 'All status'], ['Pending', 'Pending'], ['Ongoing', 'Ongoing'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled']];
        let curService = '', curStatus = '', openService = '';

        const wrap = document.createElement('div');
        wrap.id = 'nfWrap';
        wrap.style.cssText = 'position:relative;display:inline-block';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'form-control filter-select';
        btn.style.cssText = 'text-align:left;cursor:pointer;min-width:180px';
        const panel = document.createElement('div');
        panel.style.cssText = 'display:none;position:absolute;left:0;top:100%;margin-top:4px;z-index:60;min-width:240px;max-height:340px;overflow:auto;padding:6px;border:1px solid rgba(127,127,127,.35);border-radius:10px;background:var(--card-bg,var(--surface,Canvas));color:inherit;box-shadow:0 8px 24px rgba(0,0,0,.18)';
        wrap.appendChild(btn);
        wrap.appendChild(panel);
        sv.parentNode.insertBefore(wrap, sv);

        function row(text, bold, indent) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = 'display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;padding:8px 10px;border-radius:6px;font:inherit;' + (bold ? 'font-weight:600;' : '') + (indent ? 'padding-left:26px;' : '');
            b.onmouseenter = function () { b.style.background = 'rgba(127,127,127,.15)'; };
            b.onmouseleave = function () { b.style.background = 'transparent'; };
            return b;
        }
        function label() {
            if (!curService) return 'All services';
            const s = STATUSES.filter(function (x) { return x[0] === curStatus; })[0];
            return curService + ' \u00b7 ' + (s ? s[1] : 'All status');
        }
        function apply(service, status) {
            curService = service; curStatus = status;
            fillServiceOptions();
            st.value = status;
            sv.value = service;
            sv.dispatchEvent(new Event('change'));
            panel.style.display = 'none';
            btn.textContent = label() + ' \u25be';
        }
        function build() {
            fillServiceOptions();
            panel.innerHTML = '';
            const names = [];
            allPayments.forEach(function (p) {
                const s = String(p.service || '').trim();
                if (s && names.indexOf(s) < 0) names.push(s);
            });
            names.sort();
            const all = row('All services', true, false);
            all.onclick = function () { openService = ''; apply('', ''); };
            panel.appendChild(all);
            names.forEach(function (n) {
                const r = row((openService === n ? '\u25be ' : '\u25b8 ') + n, true, false);
                r.onclick = function () { openService = (openService === n) ? '' : n; build(); };
                panel.appendChild(r);
                if (openService === n) {
                    STATUSES.forEach(function (s) {
                        const sr = row(s[1], curService === n && curStatus === s[0], true);
                        sr.onclick = function () { apply(n, s[0]); };
                        panel.appendChild(sr);
                    });
                }
            });
        }
        btn.onclick = function (e) {
            e.stopPropagation();
            if (panel.style.display === 'none') { build(); panel.style.display = 'block'; } else { panel.style.display = 'none'; }
        };
        panel.addEventListener('click', function (e) { e.stopPropagation(); });
        document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) panel.style.display = 'none'; });
        btn.textContent = label() + ' \u25be';
    })();
    const svSel = document.getElementById('filterService');
    if (svSel) svSel.addEventListener('change', function (e) {
        serviceFilter = e.target.value;
        const st = document.getElementById('filterStatus');
        st.style.display = 'none';
        if (!serviceFilter) st.value = '';
        st.dispatchEvent(new Event('change'));
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