/* AIDEA Admin - Templates.js: upload, list and delete certificate templates (Receipts page). */
(function () {
    var BASE = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api');
    function hd() { return { 'Accept': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') }; }
    var list = document.getElementById('tplList'), nameIn = document.getElementById('tplName'), fileIn = document.getElementById('tplFile'), addBtn = document.getElementById('tplAdd');
    if (!list || !addBtn) return;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
    function ok(r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw j; return j; }); }

    function card(t) {
        var d = document.createElement('div');
        d.style.cssText = 'border:1px solid rgba(128,128,128,.3);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px';
        d.innerHTML = '<img alt="" style="width:100%;height:110px;object-fit:contain;background:rgba(128,128,128,.12);border-radius:6px"><div style="font-weight:600;font-size:14px;word-break:break-word">' + esc(t.name) + '</div><button type="button" style="align-self:flex-start;padding:6px 12px;border:0;border-radius:8px;background:#fee2e2;color:#b91c1c;font:inherit;font-size:13px;font-weight:600;cursor:pointer">Delete</button>';
        list.appendChild(d);
        var img = d.querySelector('img');
        fetch(BASE + '/certificate-templates/' + t.id + '/image', { headers: hd() }).then(ok).then(function (j) { if (j && j.image) img.src = j.image; }).catch(function () {});
        d.querySelector('button').addEventListener('click', function () {
            if (!confirm('Delete the template "' + t.name + '"?')) return;
            fetch(BASE + '/certificate-templates/' + t.id, { method: 'DELETE', headers: hd() }).then(ok).then(function () { load(); }).catch(function (e) { alert('Not deleted: ' + ((e && e.message) || 'server error')); });
        });
    }

    function load() {
        fetch(BASE + '/certificate-templates', { headers: hd() }).then(ok).then(function (rows) {
            rows = Array.isArray(rows) ? rows : [];
            list.innerHTML = rows.length ? '' : '<p style="margin:0;font-size:13px;opacity:.7">No templates yet.</p>';
            rows.forEach(card);
        }).catch(function (e) { list.innerHTML = '<p style="margin:0;font-size:13px;color:#dc2626">Could not load templates.</p>'; console.warn('Templates not loaded:', e); });
    }

    addBtn.addEventListener('click', function () {
        var f = fileIn.files && fileIn.files[0], nm = (nameIn.value || '').trim();
        if (!nm) { alert('Enter a name for the template.'); return; }
        if (!f) { alert('Choose a PDF or DOCX file first.'); return; }
        if (f.size > 10 * 1024 * 1024) { alert('The image is over 10 MB. Use a smaller one.'); return; }
        var fd = new FormData(); fd.append('name', nm); fd.append('image', f);
        var label = addBtn.textContent;
        addBtn.disabled = true; addBtn.textContent = 'Uploading...';
        fetch(BASE + '/certificate-templates', { method: 'POST', headers: hd(), body: fd }).then(ok).then(function () {
            nameIn.value = ''; fileIn.value = ''; load();
        }).catch(function (e) {
            alert('Not saved: ' + ((e && (e.message || (e.errors && JSON.stringify(e.errors)))) || 'could not reach the server.'));
        }).then(function () { addBtn.disabled = false; addBtn.textContent = label; });
    });

    load();
    /* TPL-PDFDOCX: only PDF and DOCX are accepted; both are saved as a PNG of page 1 */
    var srcOk = false;
    function tplScript(urls) {
        return new Promise(function (ok, fail) {
            var i = 0;
            (function next() {
                if (i >= urls.length) { fail(new Error('Could not load a library')); return; }
                var s = document.createElement('script');
                s.src = urls[i++];
                s.onload = function () { ok(); };
                s.onerror = function () { next(); };
                document.head.appendChild(s);
            })();
        });
    }
    function tplNeed(test, urls) { return test() ? Promise.resolve() : tplScript(urls); }
    function tplDocxToPng(f) {
        var host = document.createElement('div');
        host.style.cssText = 'position:absolute;left:-99999px;top:0;background:#fff';
        return f.arrayBuffer().then(function (buf) {
            return tplNeed(function () { return window.JSZip; }, ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'])
                .then(function () { return tplNeed(function () { return window.docx; }, ['https://cdnjs.cloudflare.com/ajax/libs/docx-preview/0.3.2/docx-preview.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js']); })
                .then(function () { return tplNeed(function () { return window.html2canvas; }, ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js']); })
                .then(function () {
                    document.body.appendChild(host);
                    return window.docx.renderAsync(buf, host, null, { className: 'docx', inWrapper: false, breakPages: true });
                })
                .then(function () {
                    var sec = host.querySelector('section.docx');
                    if (!sec) throw new Error('No pages found');
                    return window.html2canvas(sec, { scale: 1600 / sec.offsetWidth, backgroundColor: '#ffffff', useCORS: true });
                })
                .then(function (c) {
                    document.body.removeChild(host);
                    return new Promise(function (ok, fail) { c.toBlob(function (b) { if (b) ok(b); else fail(new Error('No image')); }, 'image/png'); });
                });
        }).catch(function (e) { if (host.parentNode) host.parentNode.removeChild(host); throw e; });
    }
    fileIn.addEventListener('change', function () {
        var f = fileIn.files && fileIn.files[0];
        srcOk = false;
        if (!f) return;
        var isPdf = /\.pdf$/i.test(f.name), isDocx = /\.docx$/i.test(f.name);
        if (isPdf) { srcOk = true; return; }
        if (!isDocx) { fileIn.value = ''; alert('Only PDF or DOCX files are allowed. Images are not accepted.'); return; }
        var label = addBtn.textContent;
        addBtn.disabled = true; addBtn.textContent = 'Converting Word file...';
        function done() { addBtn.disabled = false; addBtn.textContent = label; }
        f.slice(0, 4).arrayBuffer().then(function (h) {
            var b = new Uint8Array(h);
            if (!(b[0] === 0x50 && b[1] === 0x4B)) throw new Error('bad');
            return tplDocxToPng(f);
        }).then(function (blob) {
            var png = new File([blob], f.name.replace(/\.docx$/i, '') + '.png', { type: 'image/png' });
            var dt = new DataTransfer(); dt.items.add(png); fileIn.files = dt.files;
            srcOk = true; done();
        }).catch(function (e) {
            console.warn(e); fileIn.value = ''; done();
            alert('Could not read that Word file. Make sure it is a real .docx, or upload it as a PDF.');
        });
    });
    addBtn.addEventListener('click', function (e) {
        if (fileIn.files && fileIn.files[0] && !srcOk) {
            e.stopImmediatePropagation(); e.preventDefault();
            alert('Only PDF or DOCX files are allowed.');
        }
    }, true);
    /* PDF support: convert page 1 of a chosen PDF to a PNG in the browser, then upload it as an image */
    function loadPdfJs(cb, bad) {
        if (window.pdfjsLib) { cb(); return; }
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; cb(); };
        s.onerror = bad;
        document.head.appendChild(s);
    }
    fileIn.addEventListener('change', function () {
        var f = fileIn.files && fileIn.files[0];
        if (!f || !(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return;
        var label = addBtn.textContent;
        addBtn.disabled = true; addBtn.textContent = 'Converting PDF...';
        function done() { addBtn.disabled = false; addBtn.textContent = label; }
        function fail(msg) { fileIn.value = ''; done(); alert(msg || 'Could not read that PDF. Export it as a PNG instead.'); }
        loadPdfJs(function () {
            f.arrayBuffer().then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
            .then(function (pdf) { return pdf.getPage(1); })
            .then(function (page) {
                var v0 = page.getViewport({ scale: 1 }), v = page.getViewport({ scale: 1600 / v0.width });
                var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
                var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
                return page.render({ canvasContext: cx, viewport: v }).promise.then(function () { return c; });
            }).then(function (c) {
                c.toBlob(function (b) {
                    if (!b) { fail(); return; }
                    var png = new File([b], f.name.replace(/\.pdf$/i, '') + '.png', { type: 'image/png' });
                    var dt = new DataTransfer(); dt.items.add(png); fileIn.files = dt.files;
                    done();
                }, 'image/png');
            }).catch(function (e) { console.warn(e); fail(); });
        }, function () { fail('Could not load the PDF reader. Check your internet connection, or export the PDF as PNG.'); });
    });
})();