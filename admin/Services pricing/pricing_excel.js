// pricing_excel.js (admin) - upload Excel, save to server, show with clickable links.
(function () {
    'use strict';
    var API = 'https://aideanc-production.up.railway.app/api';
    var SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    var MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 2000, MAX_COLS = 30;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function toast(msg, type) {
        if (typeof window.showToast === 'function') { window.showToast(msg, type); } else { alert(msg); }
    }
    function safeUrl(u) {
        u = String(u || '').trim();
        if (/^www\./i.test(u)) u = 'https://' + u;
        return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
    }
    async function api(path, opts) {
        var token = localStorage.getItem('auth_token');
        var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var res = await fetch(API + path, Object.assign({}, opts || {}, { headers: headers }));
        if (!res.ok) {
            var e = await res.json().catch(function () { return {}; });
            throw new Error(e.message || ('Server error ' + res.status));
        }
        return res.json();
    }
    function loadSheetJS() {
        return new Promise(function (resolve, reject) {
            if (window.XLSX) return resolve();
            var s = document.createElement('script');
            s.src = SHEETJS;
            s.onload = resolve;
            s.onerror = function () { reject(new Error('Could not load the Excel reader.')); };
            document.head.appendChild(s);
        });
    }
    function sheetToRows(ws) {
        if (!ws || !ws['!ref']) return [];
        var range = XLSX.utils.decode_range(ws['!ref']);
        var lastC = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
        var rows = [];
        for (var r = range.s.r; r <= range.e.r && rows.length < MAX_ROWS; r++) {
            var row = [], any = false;
            for (var c = range.s.c; c <= lastC; c++) {
                var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
                var text = '', url = null;
                if (cell) {
                    text = cell.w != null ? String(cell.w) : (cell.v != null ? String(cell.v) : '');
                    text = text.substring(0, 2000);
                    if (cell.l && cell.l.Target) url = safeUrl(cell.l.Target);
                    if (!url) url = safeUrl(text);
                }
                if (text !== '') any = true;
                row.push({ t: text, u: url });
            }
            if (any) rows.push(row);
        }
        return rows;
    }
    function cellHtml(cell, tag) {
        var inner = cell.u
            ? '<a href="' + esc(cell.u) + '" target="_blank" rel="noopener noreferrer">' + esc(cell.t) + '</a>'
            : esc(cell.t);
        return '<' + tag + '>' + inner + '</' + tag + '>';
    }
    function render(data) {
        var box = document.getElementById('pxBody');
        var info = document.getElementById('pxInfo');
        var clear = document.getElementById('pxClear');
        if (!data || !data.rows || !data.rows.length) {
            box.innerHTML = '<p class="px-empty">No Excel file uploaded yet.</p>';
            info.textContent = '';
            clear.hidden = true;
            return;
        }
        box.innerHTML = '<table class="px-table"><thead><tr>' +
            data.rows[0].map(function (c) { return cellHtml(c, 'th'); }).join('') +
            '</tr></thead><tbody>' +
            data.rows.slice(1).map(function (row) {
                return '<tr>' + row.map(function (c) { return cellHtml(c, 'td'); }).join('') + '</tr>';
            }).join('') + '</tbody></table>';
        info.textContent = data.name + ' - ' + (data.rows.length - 1) + ' rows (students can see this)';
        clear.hidden = false;
    }
    async function handleFile(file) {
        if (!file) return;
        if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { toast('Please choose an .xlsx, .xls or .csv file.', 'error'); return; }
        if (file.size > MAX_BYTES) { toast('File is too large (max 2 MB).', 'error'); return; }
        try {
            await loadSheetJS();
            var buf = await file.arrayBuffer();
            var wb = XLSX.read(buf, { type: 'array', cellDates: true });
            var rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
            if (!rows.length) { toast('The first sheet is empty.', 'error'); return; }
            var data = { name: file.name, rows: rows };
            await api('/pricing-sheet', { method: 'POST', body: JSON.stringify(data) });
            render(data);
            toast('Saved. Students can now see this sheet.', 'success');
        } catch (e) {
            toast(e.message || 'Could not save that file.', 'error');
        }
    }
    function addStyles() {
        var st = document.createElement('style');
        st.textContent =
            '.px-wrap{margin-top:28px}' +
            '.px-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px}' +
            '.px-btn{padding:8px 14px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}' +
            '.px-btn:hover{background:rgba(128,128,128,.12)}' +
            '.px-scroll{overflow-x:auto;border:1px solid rgba(128,128,128,.3);border-radius:10px}' +
            '.px-table{border-collapse:collapse;width:100%;font-size:.9rem}' +
            '.px-table th,.px-table td{padding:9px 12px;text-align:left;border-bottom:1px solid rgba(128,128,128,.22);white-space:nowrap}' +
            '.px-table th{background:rgba(128,128,128,.12);font-weight:700}' +
            '.px-table a{color:#2563eb;text-decoration:underline}' +
            '[data-theme="dark"] .px-table a{color:#7aa7ff}' +
            '.px-empty,.px-info{opacity:.7;font-size:.9rem;margin:0}';
        document.head.appendChild(st);
    }
    async function init() {
        var content = document.querySelector('main.content') || document.body;
        addStyles();
        var wrap = document.createElement('section');
        wrap.className = 'px-wrap';
        wrap.setAttribute('aria-label', 'Uploaded pricing sheet');
        wrap.innerHTML =
            '<div class="px-head"><span class="section-title">Pricing Sheet (Excel)</span><span>' +
            '<button type="button" class="px-btn" id="pxUpload">Upload Excel</button> ' +
            '<button type="button" class="px-btn" id="pxClear" hidden>Remove</button>' +
            '<input type="file" id="pxFile" accept=".xlsx,.xls,.csv" hidden /></span></div>' +
            '<p class="px-info" id="pxInfo"></p><div class="px-scroll" id="pxBody"></div>';
        content.appendChild(wrap);
        var file = document.getElementById('pxFile');
        document.getElementById('pxUpload').addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () { handleFile(file.files[0]); file.value = ''; });
        document.getElementById('pxClear').addEventListener('click', async function () {
            if (!confirm('Remove the pricing sheet for everyone?')) return;
            try { await api('/pricing-sheet', { method: 'DELETE' }); render(null); toast('Removed.', 'success'); }
            catch (e) { toast(e.message || 'Could not remove.', 'error'); }
        });
        render(null);
        try { var res = await api('/pricing-sheet'); render(res.data); } catch (e) { }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();