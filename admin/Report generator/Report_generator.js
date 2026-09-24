// Report_generator.js
// Real reports from GET /api/reports, themed modal dialogs, working CSV / Excel / PDF downloads,
// plus the same theme, drawer, profile menu and sign-out behaviour as the dashboard.
(function () {
    'use strict';

    // Same-origin when served by `php artisan serve` (port 8000); otherwise talk to localhost:8000.
    // Override by setting window.API_BASE before this script loads.
    const API_BASE = window.API_BASE ||
        ((location.protocol.indexOf('http') === 0 && location.port === '8000') ? '' : 'https://aideanc-production.up.railway.app');
    const LOGIN_URL = '../../user/login/login.html';
    const HISTORY_KEY = 'aidea_report_history';
    const MANUAL_TOKEN_KEY = 'aidea_report_token';

    const REPORT_TYPES = {
        'Revenue Summary': { key: 'revenue', label: 'Revenue Summary' },
        'Thesis Submission Report': { key: 'thesis', label: 'Thesis Submission Report' },
        'All Student Report': { key: 'enrollment', label: 'All Student Report' },
        'Student Enrollment Report': { key: 'enrollment', label: 'Student Enrollment Report' },
        'Service Usage Report': { key: 'service_usage', label: 'Service Usage Report' },
        'Satisfaction Report': { key: 'satisfaction', label: 'Satisfaction Report' }
    };
    const TOTALS = { revenue: ['amount'], service_usage: ['requests', 'completed', 'revenue'] };
    const MONEY = ['amount', 'revenue'];

    // ------------------------------------------------------------------ helpers
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function mkErr(message, kind) {
        const e = new Error(message);
        e.kind = kind || 'error';
        return e;
    }

    function prettify(key) {
        return String(key).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function fmtMoney(n) {
        return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ------------------------------------------------------------------ session
    function getUser() {
        try { return JSON.parse(localStorage.getItem('aidea_user')); }
        catch (e) { return null; }
    }

    function clearSession() {
        try { localStorage.removeItem('auth_token'); } catch (e) { /* ignore */ }
        try { localStorage.removeItem('aidea_user'); } catch (e) { /* ignore */ }
        try { sessionStorage.removeItem(MANUAL_TOKEN_KEY); } catch (e) { /* ignore */ }
    }

    function performSignOut() {
        const token = findToken();
        if (token) {
            fetch(API_BASE + '/api/logout', {
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

    // ------------------------------------------------------------------ theme (shared key with dashboard)
    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function applyTheme(theme, persist) {
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) {
            try { localStorage.setItem('aidea_theme', theme); } catch (e) { /* ignore */ }
        }
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

        // follow the OS setting until the user picks one manually
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = function (e) {
            let saved = null;
            try { saved = localStorage.getItem('aidea_theme'); } catch (err) { /* ignore */ }
            if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);

        // stay in sync if the theme is changed in another tab / page
        window.addEventListener('storage', function (e) {
            if (e.key === 'aidea_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
                applyTheme(e.newValue, false);
            }
        });
    }

    // ------------------------------------------------------------------ mobile drawer
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

    // ------------------------------------------------------------------ profile menu + sign-out
    function initProfileMenu() {
        const btn = document.getElementById('profileBtn');
        const menu = document.getElementById('profileMenu');
        const signOutBtn = document.getElementById('signOutBtn');
        if (!btn || !menu) return;

        const setOpen = function (open) {
            menu.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
        };

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(menu.hidden);
        });
        document.addEventListener('click', function (e) {
            if (!menu.hidden && !menu.contains(e.target)) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
        });

        if (signOutBtn) signOutBtn.addEventListener('click', function () {
            setOpen(false);
            openModal({
                title: 'Sign out?',
                message: 'You will need to log in again to use the admin panel.',
                type: 'danger',
                confirmText: 'Sign out',
                cancelText: 'Cancel',
                focusCancel: true
            }).then(function (ok) {
                if (ok) performSignOut();
                else btn.focus();
            });
        });
    }

    // ------------------------------------------------------------------ modal
    let modalSeq = 0;
    const MODAL_TYPES = ['info', 'success', 'error', 'warning', 'danger'];

    // Resolves: true/false for confirm dialogs, string/null for input dialogs, true for plain notices.
    function openModal(opts) {
        return new Promise(function (resolve) {
            const type = MODAL_TYPES.indexOf(opts.type) !== -1 ? opts.type : 'info';
            const id = ++modalSeq;
            const opener = document.activeElement;

            const overlay = el('div', 'modal-backdrop');
            const box = el('div', 'modal modal--' + type);
            box.setAttribute('role', 'alertdialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'rgTitle' + id);
            box.setAttribute('aria-describedby', 'rgMsg' + id);

            const title = el('h3', 'modal-title', opts.title || 'Notice');
            title.id = 'rgTitle' + id;
            const msg = el('p', 'modal-text', opts.message || '');
            msg.id = 'rgMsg' + id;
            box.appendChild(title);
            box.appendChild(msg);

            let input = null;
            if (opts.input) {
                input = el('input', 'modal-input');
                input.type = 'password';
                input.placeholder = opts.input;
                input.setAttribute('aria-label', opts.input);
                box.appendChild(input);
            }

            const needsChoice = !!opts.confirmText || !!opts.input;
            const actions = el('div', 'modal-actions');
            let cancel = null;

            if (needsChoice) {
                cancel = el('button', 'modal-btn modal-btn-cancel', opts.cancelText || 'Cancel');
                cancel.type = 'button';
                cancel.addEventListener('click', function () { done(false); });
                actions.appendChild(cancel);
            }
            const primary = el('button', 'modal-btn modal-btn-primary', needsChoice ? (opts.confirmText || 'OK') : 'OK');
            primary.type = 'button';
            primary.addEventListener('click', function () { done(true); });
            actions.appendChild(primary);
            box.appendChild(actions);

            function done(ok) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                const sidebar = document.getElementById('sidebar');
                if (!sidebar || !sidebar.classList.contains('open')) document.body.classList.remove('no-scroll');
                if (opener && opener.focus && document.contains(opener)) opener.focus();
                if (input) resolve(ok ? input.value.trim() : null);
                else resolve(needsChoice ? ok : true);
            }

            function onKey(ev) {
                if (ev.key === 'Escape') { ev.preventDefault(); done(false); return; }
                // Enter submits the token field only; on buttons it already triggers their own click.
                if (ev.key === 'Enter' && input && ev.target === input) { ev.preventDefault(); done(true); return; }
                if (ev.key === 'Tab') {
                    const items = Array.prototype.slice.call(box.querySelectorAll('button, input'));
                    if (!items.length) return;
                    const first = items[0], last = items[items.length - 1];
                    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
                    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
                }
            }

            overlay.addEventListener('mousedown', function (ev) { if (ev.target === overlay && !input) done(false); });
            document.addEventListener('keydown', onKey);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            document.body.classList.add('no-scroll');
            (input || (opts.focusCancel && cancel) || primary).focus();
        });
    }

    // ------------------------------------------------------------------ auth token
    function cleanToken(v) {
        v = String(v || '').trim().replace(/^"+|"+$/g, '').replace(/^Bearer\s+/i, '');
        return (v && v.charAt(0) !== '{' && v.charAt(0) !== '[') ? v : null;
    }

    // Recognises Laravel Sanctum tokens ("156|abc...") plain or inside a JSON object.
    function sanctumFrom(raw) {
        if (!raw) return null;
        const v = cleanToken(raw);
        if (v && /^\d+\|[A-Za-z0-9]{20,}$/.test(v)) return v;
        if (String(raw).trim().charAt(0) === '{') {
            try {
                const o = JSON.parse(raw);
                const cand = o.token || o.access_token || o.plainTextToken || (o.data && (o.data.token || o.data.access_token));
                return cand ? cleanToken(cand) : null;
            } catch (e) { return null; }
        }
        return null;
    }

    function findToken() {
        const stores = [];
        try { stores.push(sessionStorage); } catch (e) { /* blocked */ }
        try { stores.push(localStorage); } catch (e) { /* blocked */ }
        const names = [MANUAL_TOKEN_KEY, 'token', 'auth_token', 'authToken', 'access_token', 'accessToken',
            'admin_token', 'adminToken', 'aidea_token', 'api_token', 'sanctum_token'];
        for (let s = 0; s < stores.length; s++) {
            for (let n = 0; n < names.length; n++) {
                try {
                    const raw = stores[s].getItem(names[n]);
                    if (raw) { const t = sanctumFrom(raw) || cleanToken(raw); if (t) return t; }
                } catch (e) { /* ignore */ }
            }
        }
        for (let s = 0; s < stores.length; s++) {
            try {
                for (let i = 0; i < stores[s].length; i++) {
                    const t = sanctumFrom(stores[s].getItem(stores[s].key(i)));
                    if (t) return t;
                }
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    async function askToken() {
        const v = await openModal({
            title: 'Admin token needed', type: 'warning',
            message: 'Could not find your login token in this browser. Paste an admin API token to continue. It is kept only for this browser session.',
            input: 'Paste token, e.g. 156|abc...', confirmText: 'Use token', cancelText: 'Cancel'
        });
        const t = v ? cleanToken(v) : null;
        if (t) { try { sessionStorage.setItem(MANUAL_TOKEN_KEY, t); } catch (e) { /* ignore */ } }
        return t;
    }

    // ------------------------------------------------------------------ API
    async function fetchReport(key, from, to) {
        let token = findToken();
        if (!token) token = await askToken();
        if (!token) throw mkErr('A token is required to generate reports.', 'warning');

        const url = API_BASE + '/api/reports?' + new URLSearchParams({ type: key, from: from, to: to }).toString();
        let res;
        try {
            res = await fetch(url, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + token } });
        } catch (e) {
            throw mkErr('Could not reach the server at ' + (API_BASE || location.origin) +
                '.\nMake sure it is running (php artisan serve) and try again.');
        }

        let body = {};
        try { body = await res.json(); } catch (e) { /* non-JSON body */ }

        if (!res.ok) {
            let msg = body.error || body.message || ('Request failed (' + res.status + ').');
            if (res.status === 422 && body.errors) {
                const first = Object.keys(body.errors)[0];
                if (first) msg = body.errors[first][0];
            }
            if (res.status === 401) {
                try { sessionStorage.removeItem(MANUAL_TOKEN_KEY); } catch (e) { /* ignore */ }
                throw mkErr('Your session has expired or the token is invalid. Please sign in again as an admin.');
            }
            if (res.status === 403) throw mkErr(msg, 'warning');
            if (res.status === 404) throw mkErr('The reports endpoint was not found at ' + (API_BASE || location.origin) + '/api/reports.');
            if (res.status === 501) throw mkErr(msg, 'info');
            throw mkErr(msg);
        }
        return Array.isArray(body.data) ? body.data : [];
    }

    // ------------------------------------------------------------------ exporters
    function libError(what) {
        return mkErr('The ' + what + ' library did not load. It comes from cdnjs.cloudflare.com, so check your internet connection and reload the page (Ctrl+F5).');
    }

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    function csvCell(v) {
        if (v === null || v === undefined) return '""';
        let s = String(v);
        if (typeof v === 'string' && /^([=+@]|-.)/.test(s)) s = "'" + s;   // stop spreadsheet formula injection
        return '"' + s.replace(/"/g, '""') + '"';
    }

    function exportCsv(rows, cols, fileName) {
        const lines = [cols.map(prettify).map(csvCell).join(',')];
        rows.forEach(function (r) { lines.push(cols.map(function (c) { return csvCell(r[c]); }).join(',')); });
        saveBlob(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName);   // BOM so Excel reads UTF-8
    }

    function exportExcel(cfg, rows, cols, fileName) {
        if (typeof XLSX === 'undefined') throw libError('Excel');
        const data = rows.map(function (r) {
            const o = {};
            cols.forEach(function (c) { o[prettify(c)] = r[c]; });
            return o;
        });
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = cols.map(function (c) {
            const w = rows.reduce(function (m, r) { return Math.max(m, String(r[c] == null ? '' : r[c]).length); }, prettify(c).length);
            return { wch: Math.min(45, w + 2) };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, cfg.label.slice(0, 31));
        XLSX.writeFile(wb, fileName);
    }

    function exportPdf(cfg, rows, cols, from, to, fileName) {
        if (!window.jspdf || !window.jspdf.jsPDF) throw libError('PDF');
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        if (typeof doc.autoTable !== 'function') throw libError('PDF table');

        const right = [];
        cols.forEach(function (c, i) {
            if (rows.every(function (r) { return typeof r[c] === 'number'; })) right.push(i);
        });

        const body = rows.map(function (r) {
            return cols.map(function (c) {
                const v = r[c];
                if (v === null || v === undefined) return '';
                if (MONEY.indexOf(c) !== -1 && typeof v === 'number') return fmtMoney(v);
                return String(v);
            });
        });

        let foot;
        const sumCols = TOTALS[cfg.key];
        if (sumCols) {
            foot = [cols.map(function (c, i) {
                if (sumCols.indexOf(c) !== -1) {
                    const sum = rows.reduce(function (t, r) { return t + (Number(r[c]) || 0); }, 0);
                    return MONEY.indexOf(c) !== -1 ? fmtMoney(sum) : String(sum);
                }
                return i === 0 ? 'TOTAL' : '';
            })];
        }

        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        doc.setFontSize(16);
        doc.text('AIDEA - ' + cfg.label, 40, 40);
        doc.setFontSize(10);
        doc.text('Period: ' + from + ' to ' + to + '   |   Generated: ' + stamp + '   |   ' + rows.length + ' record(s)', 40, 58);

        doc.autoTable({
            head: [cols.map(prettify)],
            body: body,
            foot: foot,
            showFoot: 'lastPage',
            startY: 72,
            margin: { left: 40, right: 40 },
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: [37, 99, 235] },
            footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            didParseCell: function (d) { if (right.indexOf(d.column.index) !== -1) d.cell.styles.halign = 'right'; }
        });

        const pages = doc.internal.getNumberOfPages();
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text('Page ' + i + ' of ' + pages, pw - 40, ph - 20, { align: 'right' });
        }
        doc.save(fileName);
    }

    function exportRows(cfg, rows, fmt, from, to) {
        const cols = Object.keys(rows[0]);
        const ext = { PDF: 'pdf', CSV: 'csv', Excel: 'xlsx' }[fmt];
        if (!ext) throw mkErr('Unknown format: ' + fmt);
        const fileName = cfg.key + '_report_' + from + '_to_' + to + '.' + ext;
        if (fmt === 'CSV') exportCsv(rows, cols, fileName);
        else if (fmt === 'Excel') exportExcel(cfg, rows, cols, fileName);
        else exportPdf(cfg, rows, cols, from, to, fileName);
        return fileName;
    }

    // ------------------------------------------------------------------ history (Recent Reports)
    function loadHistory() {
        try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(h) ? h : []; }
        catch (e) { return []; }
    }
    function saveHistory(h) {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10))); } catch (e) { /* ignore */ }
    }

    function showError(e) {
        const kind = e.kind || 'error';
        const title = kind === 'info' ? 'Not available yet' : kind === 'warning' ? 'Notice' : 'Report failed';
        openModal({ title: title, message: e.message || String(e), type: kind });
    }

    function renderReports() {
        const list = document.getElementById('reportList');
        list.textContent = '';
        const history = loadHistory();
        if (!history.length) {
            list.appendChild(el('div', 'report-empty', 'No reports yet. Choose a type and date range, then generate one.'));
            return;
        }
        history.forEach(function (r) {
            const item = el('div', 'report-item');
            const info = el('div', 'report-info');
            info.appendChild(el('div', 'report-name', r.label));
            info.appendChild(el('div', 'report-meta',
                r.from + ' to ' + r.to + ' \u00B7 ' + r.count + ' row(s) \u00B7 ' +
                new Date(r.created).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })));
            const btn = el('button', 'btn-dl', 'Download');
            btn.type = 'button';
            btn.addEventListener('click', function () { redownload(r, btn); });
            item.appendChild(el('span', 'fmt-tag', r.fmt));
            item.appendChild(info);
            item.appendChild(btn);
            list.appendChild(item);
        });
    }

    async function redownload(r, btn) {
        const cfg = REPORT_TYPES[r.label];
        if (!cfg) return;
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing...';
        try {
            const rows = await fetchReport(cfg.key, r.from, r.to);   // re-fetched so the file has current data
            if (!rows.length) {
                openModal({ title: 'No data', message: 'That period now has no records.', type: 'info' });
                return;
            }
            const file = exportRows(cfg, rows, r.fmt, r.from, r.to);
            openModal({ title: 'Download ready', message: rows.length + ' row(s) saved as ' + file, type: 'success' });
        } catch (e) {
            showError(e);
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    }

    // ------------------------------------------------------------------ generate
    async function handleGenerate() {
        const label = document.getElementById('reportType').value;
        const cfg = REPORT_TYPES[label];
        const from = document.getElementById('dateFrom').value;
        const to = document.getElementById('dateTo').value;
        const fmtEl = document.querySelector('input[name="fmt"]:checked');
        const fmt = fmtEl ? fmtEl.value : 'PDF';

        if (!cfg) { openModal({ title: 'Unknown report', message: 'Pick a report type from the list.', type: 'warning' }); return; }
        if (!from || !to) { openModal({ title: 'Date range needed', message: 'Please select a date range.', type: 'warning' }); return; }
        if (new Date(from) > new Date(to)) { openModal({ title: 'Check the dates', message: 'Start date must be before end date.', type: 'warning' }); return; }

        const btn = document.getElementById('generateBtn');
        btn.textContent = 'Generating...';
        btn.disabled = true;
        try {
            const rows = await fetchReport(cfg.key, from, to);
            if (!rows.length) {
                openModal({ title: 'No data', message: 'No records found between ' + from + ' and ' + to + '.', type: 'info' });
                return;
            }
            const file = exportRows(cfg, rows, fmt, from, to);
            const history = loadHistory();
            history.unshift({ label: cfg.label, fmt: fmt, from: from, to: to, count: rows.length, created: new Date().toISOString() });
            saveHistory(history);
            renderReports();
            openModal({ title: 'Report ready', message: rows.length + ' row(s) exported as ' + fmt + '.\nFile: ' + file, type: 'success' });
        } catch (e) {
            showError(e);
        } finally {
            btn.textContent = 'Generate report';
            btn.disabled = false;
        }
    }

    // ------------------------------------------------------------------ init
    document.addEventListener('DOMContentLoaded', function () {
        const user = getUser();
        if (user) renderAdminIdentity(user);

        initTheme();
        initDrawer();
        initProfileMenu();
        renderReports();

        document.getElementById('generateBtn').addEventListener('click', handleGenerate);

        function localISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
        const now = new Date();
        document.getElementById('dateTo').value = localISO(now);
        document.getElementById('dateFrom').value = localISO(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()));
    });
})();