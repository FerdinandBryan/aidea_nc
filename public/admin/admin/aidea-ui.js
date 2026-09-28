// aidea-ui.js - shared modal dialogs + API helper for the AIDEA admin pages
(function () {
    'use strict';

    const API_BASE = window.API_BASE ||
        ((location.protocol.indexOf('http') === 0 && location.port === '8000') ? '' : 'http://localhost:8000');
    const TOKEN_KEY = 'aidea_report_token';   // same key as the Report Generator: one paste covers every page in this tab

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

    // ---------------------------------------------------------------- modal
    const ACCENTS = {
        info:    { color: '#2563eb', icon: 'i' },
        success: { color: '#16a34a', icon: '\u2713' },
        error:   { color: '#dc2626', icon: '\u2715' },
        warning: { color: '#d97706', icon: '!' }
    };

    function injectStyles() {
        if (document.getElementById('aidea-modal-styles')) return;
        const s = document.createElement('style');
        s.id = 'aidea-modal-styles';
        s.textContent = [
            '.rg-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px}',
            '.rg-modal{background:#fff;color:#0f172a;width:100%;max-width:420px;border-radius:14px;border-top:5px solid #2563eb;padding:24px;font-family:inherit;box-shadow:0px 20px 50px rgba(0,0,0,.3)}',
            '.rg-icon{width:36px;height:36px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;margin-bottom:12px}',
            '.rg-title{margin:0 0 8px;font-size:18px;font-weight:700}',
            '.rg-msg{margin:0 0 18px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#334155}',
            '.rg-input{width:100%;box-sizing:border-box;padding:9px 11px;margin:0 0 18px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}',
            '.rg-actions{display:flex;justify-content:flex-end;gap:10px}',
            '.rg-btn{border:0;border-radius:8px;padding:9px 20px;font-size:14px;font-weight:600;cursor:pointer}',
            '.rg-btn-secondary{background:#e2e8f0;color:#0f172a}',
            '.rg-btn-primary{color:#fff}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // Resolves: true/false for confirm dialogs, string/null for input dialogs, true for plain notices.
    function openModal(opts) {
        return new Promise(function (resolve) {
            const accent = ACCENTS[opts.type || 'info'];
            const overlay = el('div', 'rg-overlay');
            const box = el('div', 'rg-modal');
            box.style.borderTopColor = accent.color;
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');

            const icon = el('div', 'rg-icon', accent.icon);
            icon.style.background = accent.color;
            box.appendChild(icon);
            box.appendChild(el('h3', 'rg-title', opts.title || 'Notice'));
            box.appendChild(el('p', 'rg-msg', opts.message || ''));

            let input = null;
            if (opts.input) {
                input = el('input', 'rg-input');
                input.type = 'password';
                input.placeholder = opts.input;
                box.appendChild(input);
            }

            const actions = el('div', 'rg-actions');
            const needsChoice = !!opts.confirmText || !!opts.input;

            function done(ok) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                if (input) resolve(ok ? input.value.trim() : null);
                else resolve(needsChoice ? ok : true);
            }
            function onKey(ev) {
                if (ev.key === 'Escape') done(false);
                else if (ev.key === 'Enter') done(true);
            }

            let primary;
            if (needsChoice) {
                const cancel = el('button', 'rg-btn rg-btn-secondary', opts.cancelText || 'Cancel');
                cancel.type = 'button';
                cancel.addEventListener('click', function () { done(false); });
                actions.appendChild(cancel);
                primary = el('button', 'rg-btn rg-btn-primary', opts.confirmText || 'OK');
            } else {
                primary = el('button', 'rg-btn rg-btn-primary', 'OK');
            }
            primary.type = 'button';
            primary.style.background = accent.color;
            primary.addEventListener('click', function () { done(true); });
            actions.appendChild(primary);

            box.appendChild(actions);
            overlay.appendChild(box);
            overlay.addEventListener('mousedown', function (ev) { if (ev.target === overlay && !input) done(false); });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(overlay);
            (input || primary).focus();
        });
    }

    function showError(e) {
        const kind = (e && e.kind) || 'error';
        return openModal({
            title: kind === 'error' ? 'Something went wrong' : 'Notice',
            message: (e && e.message) || String(e),
            type: kind
        });
    }

    // ---------------------------------------------------------------- token
    function cleanToken(v) {
        v = String(v || '').trim().replace(/^"+|"+$/g, '').replace(/^Bearer\s+/i, '');
        return (v && v.charAt(0) !== '{' && v.charAt(0) !== '[') ? v : null;
    }
    function sanctumFrom(raw) {
        if (!raw) return null;
        const v = cleanToken(raw);
        if (v && /^\d+\|[A-Za-z0-9]{20,}$/.test(v)) return v;
        if (String(raw).trim().charAt(0) === '{') {
            try {
                const o = JSON.parse(raw);
                const c = o.token || o.access_token || o.plainTextToken || (o.data && (o.data.token || o.data.access_token));
                return c ? cleanToken(c) : null;
            } catch (e) { return null; }
        }
        return null;
    }
    function findToken() {
        const stores = [];
        try { stores.push(sessionStorage); } catch (e) { /* blocked */ }
        try { stores.push(localStorage); } catch (e) { /* blocked */ }
        const names = [TOKEN_KEY, 'token', 'auth_token', 'authToken', 'access_token', 'accessToken',
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
    function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }

    async function askToken() {
        const v = await openModal({
            title: 'Admin token needed', type: 'warning',
            message: 'Could not find your login token in this browser. Paste an admin API token to continue. It is kept only for this browser tab.',
            input: 'Paste token, e.g. 157|abc...', confirmText: 'Use token', cancelText: 'Cancel'
        });
        const t = v ? cleanToken(v) : null;
        if (t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ } }
        return t;
    }

    // ---------------------------------------------------------------- API
    // apiFetch('/api/admin/feedbacks', { method: 'PATCH', body: {...} }) -> parsed JSON, or throws an Error with .kind
    async function apiFetch(path, opts) {
        opts = opts || {};
        let token = findToken();
        if (!token) token = await askToken();
        if (!token) throw mkErr('A token is required to load this page.', 'warning');

        const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
        let body;
        if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }

        let res;
        try {
            res = await fetch(API_BASE + path, { method: opts.method || 'GET', headers: headers, body: body });
        } catch (e) {
            throw mkErr('Could not reach the server at ' + (API_BASE || location.origin) +
                '.\nMake sure it is running (php artisan serve) and try again.');
        }

        let data = {};
        try { data = await res.json(); } catch (e) { /* non-JSON body */ }

        if (!res.ok) {
            let msg = data.error || data.message || ('Request failed (' + res.status + ').');
            if (res.status === 422 && data.errors) {
                const first = Object.keys(data.errors)[0];
                if (first) msg = data.errors[first][0];
            }
            if (res.status === 401) {
                clearToken();
                throw mkErr('Your session has expired or the token is invalid. Reload the page and paste a fresh admin token.');
            }
            if (res.status === 403) throw mkErr(msg, 'warning');
            if (res.status === 404) throw mkErr('Not found: ' + path);
            throw mkErr(msg);
        }
        return data;
    }

    injectStyles();
    window.AideaUI = { el: el, openModal: openModal, showError: showError, apiFetch: apiFetch, clearToken: clearToken, API_BASE: API_BASE };
})();