// pricing_sheet_view.js (student) - shows the admin's Excel sheet with clickable links.
(function () {
    'use strict';
    var API = 'https://aideanc-production.up.railway.app/api';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function safeUrl(u) {
        u = String(u || '').trim();
        if (/^www\./i.test(u)) u = 'https://' + u;
        return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
    }
    function cellHtml(cell, tag) {
        var u = safeUrl(cell.u);
        var inner = u
            ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(cell.t) + '</a>'
            : esc(cell.t);
        return '<' + tag + '>' + inner + '</' + tag + '>';
    }
    function addStyles() {
        var st = document.createElement('style');
        st.textContent =
            '.px-wrap{margin-top:28px}' +
            '.px-title{font-weight:700;font-size:1.05rem;margin:0 0 4px}' +
            '.px-info{opacity:.7;font-size:.85rem;margin:0 0 10px}' +
            '.px-scroll{overflow-x:auto;border:1px solid rgba(128,128,128,.3);border-radius:10px}' +
            '.px-table{border-collapse:collapse;width:100%;font-size:.9rem}' +
            '.px-table th,.px-table td{padding:9px 12px;text-align:left;border-bottom:1px solid rgba(128,128,128,.22);white-space:nowrap}' +
            '.px-table th{background:rgba(128,128,128,.12);font-weight:700}' +
            '.px-table a{color:#2563eb;text-decoration:underline}' +
            '[data-theme="dark"] .px-table a{color:#7aa7ff}';
        document.head.appendChild(st);
    }
    async function init() {
        var grid = document.getElementById('availServicesGrid');
        if (!grid) return;
        var headers = { 'Accept': 'application/json' };
        try {
            if (typeof authHeaders === 'function') { headers = Object.assign(headers, authHeaders()); }
            else { var t = localStorage.getItem('auth_token'); if (t) headers['Authorization'] = 'Bearer ' + t; }
        } catch (e) { }
        try {
            var res = await fetch(API + '/pricing-sheet', { headers: headers });
            if (!res.ok) return;
            var json = await res.json();
            var data = json.data;
            if (!data || !data.rows || !data.rows.length) return;
            addStyles();
            var wrap = document.createElement('section');
            wrap.className = 'px-wrap';
            wrap.setAttribute('aria-label', 'Pricing sheet');
            wrap.innerHTML =
                '<p class="px-title">Pricing Sheet</p><p class="px-info">' + esc(data.name) + '</p>' +
                '<div class="px-scroll"><table class="px-table"><thead><tr>' +
                data.rows[0].map(function (c) { return cellHtml(c, 'th'); }).join('') +
                '</tr></thead><tbody>' +
                data.rows.slice(1).map(function (row) {
                    return '<tr>' + row.map(function (c) { return cellHtml(c, 'td'); }).join('') + '</tr>';
                }).join('') + '</tbody></table></div>';
            grid.parentNode.insertBefore(wrap, grid.nextSibling);
        } catch (e) { }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();