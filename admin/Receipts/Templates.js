/* AIDEA Admin - Templates.js: upload, list and delete certificate templates (Receipts page). */
(function () {
    var BASE = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api');
    function hd() { return { 'Accept': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') }; }
    var list = document.getElementById('tplList'), nameIn = document.getElementById('tplName'), fileIn = document.getElementById('tplFile'), addBtn = document.getElementById('tplAdd');
    if (!list || !addBtn) return;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
    function ok(r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw j; return j; }); }

    function svAddEdit(d, t) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = 'Edit text';
        b.style.cssText = 'padding:8px 12px;border:1px solid #9ca3af;border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer';
        b.addEventListener('click', function () { svOpenEditor(t); });
        d.appendChild(b);
    }
    function svOpenEditor(t) {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;flex-direction:column;font:14px Arial,sans-serif';
        var bs = 'height:30px;padding:0 10px;border:1px solid #9ca3af;border-radius:6px;background:#fff;color:#111827;cursor:pointer;font:inherit';
        var tb = 'height:28px;min-width:28px;border:0;border-radius:6px;background:transparent;color:#1f2937;cursor:pointer;font:inherit';
        function cb(c, l, ti) { return '<button type="button" data-c="' + c + '" title="' + ti + '" style="' + tb + '">' + l + '</button>'; }
        ov.innerHTML =
            '<div style="display:flex;gap:8px;align-items:center;padding:8px 16px;background:#fff;border-bottom:1px solid #d1d5db"><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#111827"></b>' +
            '<button type="button" data-a="print" style="' + bs + '">Print / PDF</button><button type="button" data-a="doc" style="' + bs + '">Download Word</button><button type="button" data-a="png" style="' + bs + '">Download PNG</button><button type="button" data-a="close" style="' + bs + '">Close</button></div>' +
            '<div id="svTb" style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px 16px;background:#edf2fa;border-bottom:1px solid #d1d5db">' +
            cb('undo', '&#8630;', 'Undo') + cb('redo', '&#8631;', 'Redo') +
            '<select data-f="font" style="' + tb + '"><option value="">Font</option><option>Arial</option><option>Times New Roman</option><option>Calibri</option><option>Cambria</option><option>Georgia</option><option>Verdana</option></select>' +
            '<select data-f="size" style="' + tb + '"><option value="">Size</option><option>10</option><option>11</option><option>12</option><option>14</option><option>16</option><option>18</option><option>24</option><option>32</option></select>' +
            cb('bold', '<b>B</b>', 'Bold') + cb('italic', '<i>I</i>', 'Italic') + cb('underline', '<u>U</u>', 'Underline') +
            '<input type="color" data-k="foreColor" value="#000000" title="Text color" style="width:28px;height:28px;border:0;background:transparent"><input type="color" data-k="hiliteColor" value="#ffff00" title="Highlight" style="width:28px;height:28px;border:0;background:transparent">' +
            cb('justifyLeft', '&#8676;', 'Left') + cb('justifyCenter', '&#8596;', 'Center') + cb('justifyRight', '&#8677;', 'Right') + cb('justifyFull', '&#9776;', 'Justify') +
            cb('insertUnorderedList', '&#8226;&#8801;', 'Bullets') + cb('insertOrderedList', '1.&#8801;', 'Numbers') + cb('outdent', '&#8678;', 'Outdent') + cb('indent', '&#8680;', 'Indent') +
            '</div><div id="svSc" style="flex:1;overflow:auto;background:#e5e7eb;padding:16px"><div id="svMsg" style="text-align:center;color:#4b5563;padding:24px">Loading template...</div><div id="svHost"></div></div>';
        document.body.appendChild(ov);
        ov.querySelector('b').textContent = t.name || 'Template';
        var host = ov.querySelector('#svHost'), msg = ov.querySelector('#svMsg'), saved = null;
        function inHost(n) { while (n) { if (n === host) return true; n = n.parentNode; } return false; }
        function onSel() { if (!ov.isConnected) { document.removeEventListener('selectionchange', onSel); return; } var s = window.getSelection(); if (s && s.rangeCount && inHost(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); }
        document.addEventListener('selectionchange', onSel);
        function restore() { if (!saved) return false; var s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); return true; }
        function run(c, v) { if (!restore()) return; try { document.execCommand('styleWithCSS', false, true); } catch (e) { } document.execCommand(c, false, v); }
        function setSize(px) {
            if (!restore() || saved.collapsed) return;
            try { document.execCommand('styleWithCSS', false, false); } catch (e) { }
            document.execCommand('fontSize', false, '7');
            Array.prototype.forEach.call(host.querySelectorAll('font[size="7"]'), function (f) { var sp = document.createElement('span'); sp.style.fontSize = px + 'px'; while (f.firstChild) sp.appendChild(f.firstChild); f.parentNode.replaceChild(sp, f); });
        }
        var bar = ov.querySelector('#svTb');
        bar.addEventListener('mousedown', function (e) { var n = e.target.tagName; if (n === 'SELECT' || n === 'INPUT' || n === 'OPTION') return; e.preventDefault(); });
        bar.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-c]'); if (b) run(b.getAttribute('data-c')); });
        bar.addEventListener('change', function (e) { var x = e.target, f = x.getAttribute('data-f'); if (f === 'font' && x.value) run('fontName', x.value); else if (f === 'size' && x.value) setSize(parseInt(x.value, 10)); if (f) x.selectedIndex = 0; });
        bar.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (k) run(k, e.target.value); });
        function pagesHtml() { var h = ''; Array.prototype.forEach.call(host.querySelectorAll('section.docx'), function (s) { var c = s.cloneNode(true); c.removeAttribute('contenteditable'); h += c.outerHTML; }); return h; }
        function stylesHtml() { var h = ''; Array.prototype.forEach.call(host.querySelectorAll('style'), function (s) { h += s.outerHTML; }); return h; }
        var fname = ((t.name || 'template').replace(/[^\w\- ]+/g, '').trim() || 'template');
        ov.querySelector('[data-a="close"]').addEventListener('click', function () { document.removeEventListener('selectionchange', onSel); ov.remove(); });
        ov.querySelector('[data-a="print"]').addEventListener('click', function () {
            var w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
            w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + fname + '</title>' + stylesHtml() + '<style>@page{margin:0}body{margin:0}section.docx{margin:0 auto!important;box-shadow:none!important}header p{white-space:nowrap!important}</style></head><body>' + pagesHtml() + '</body></html>');
            w.document.close(); w.onload = function () { w.focus(); w.print(); };
        });
        ov.querySelector('[data-a="doc"]').addEventListener('click', function () {
            var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' + stylesHtml() + '</head><body>' + pagesHtml() + '</body></html>';
            var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + html], { type: 'application/msword' })); a.download = fname + '-edited.doc';
            document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
        ov.querySelector('[data-a="png"]').addEventListener('click', function () {
            tplNeed(function () { return window.html2canvas; }, ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js']).then(function () {
                var secs = host.querySelectorAll('section.docx'), i = 0;
                (function next() {
                    if (i >= secs.length) return;
                    var s = secs[i++];
                    window.html2canvas(s, { scale: 1600 / s.offsetWidth, backgroundColor: '#ffffff', useCORS: true }).then(function (c) {
                        var a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = fname + '-page' + i + '.png'; document.body.appendChild(a); a.click(); a.remove(); next();
                    });
                })();
            }).catch(function () { alert('Could not create the PNG.'); });
        });
        fetch(BASE + '/certificate-templates/' + t.id + '/original', { headers: hd() }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(function (buf) {
            return tplNeed(function () { return window.JSZip; }, ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'])
                .then(function () { return tplNeed(function () { return window.docx; }, ['https://cdnjs.cloudflare.com/ajax/libs/docx-preview/0.3.2/docx-preview.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js']); })
                .then(function () { return tplFixAlt(buf).then(function (fb) { return window.docx.renderAsync(fb, host, null, { className: 'docx', inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false }); }); });
        }).then(function () {
            msg.remove(); tplAlignHdr(host); tplTightHdr(host);
            Array.prototype.forEach.call(host.querySelectorAll('section.docx'), function (s) { s.setAttribute('contenteditable', 'true'); s.setAttribute('spellcheck', 'true'); s.style.margin = '0 auto 16px'; s.style.outline = 'none'; });
        }).catch(function (e) {
            msg.textContent = (e && /HTTP 404/.test(e.message)) ? 'This template has no original Word file. Re-upload it as a .docx.' : 'Could not open this template (' + ((e && e.message) || 'error') + ').';
        });
    }
    function tplFixHdr(x) {
        var am = /<wp:anchor\b[\s\S]*?<\/wp:anchor>/g, m, edge = 0, pos = -1;
        while ((m = am.exec(x))) {
            var d = m[0];
            if (!/<wp:wrapSquare/.test(d) || !/<wp:positionH relativeFrom="column"/.test(d)) continue;
            var ph = /<wp:positionH[^>]*>\s*<wp:posOffset>(-?\d+)/.exec(d), pv = /<wp:positionV[^>]*>\s*<wp:posOffset>(-?\d+)/.exec(d), cx = /<wp:extent cx="(\d+)"/.exec(d), dr = /distR="(\d+)"/.exec(d);
            if (!ph || !pv || !cx || parseInt(pv[1], 10) >= 0) continue;
            edge = Math.round((parseInt(ph[1], 10) + parseInt(cx[1], 10) + (dr ? parseInt(dr[1], 10) : 114300)) / 635);
            pos = m.index; break;
        }
        if (edge <= 0) return x;
        var pr = /<w:p[ >][\s\S]*?<\/w:p>/g, p, prev = null, found = false;
        while ((p = pr.exec(x))) {
            if (p.index <= pos && pos < p.index + p[0].length) { found = true; break; }
            prev = { i: p.index, s: p[0] };
        }
        if (!found || !prev || !/<w:t[ >]/.test(prev.s)) return x;
        var ns;
        if (/<w:ind [^>]*w:left="/.test(prev.s)) ns = prev.s.replace(/(<w:ind [^>]*w:left=")\d+(")/, function (a, b, c) { return b + edge + c; });
        else if (/<w:pPr>/.test(prev.s)) ns = prev.s.replace('<w:pPr>', '<w:pPr><w:ind w:left="' + edge + '"/>');
        else ns = prev.s.replace(/^(<w:p(?: [^>]*)?>)/, function (a) { return a + '<w:pPr><w:ind w:left="' + edge + '"/></w:pPr>'; });
        return x.slice(0, prev.i) + ns + x.slice(prev.i + prev.s.length);
    }
    function tplFixAlt(buf) {
        return window.JSZip.loadAsync(buf).then(function (zip) {
            var names = Object.keys(zip.files).filter(function (n) { return /^word\/(document|header\d*|footer\d*)\.xml$/.test(n); });
            return Promise.all(names.map(function (n) {
                return zip.file(n).async('string').then(function (x) {
                    var y = x.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/g, function (blk) {
                        var ch = /<mc:Choice[\s\S]*?<\/mc:Choice>/.exec(blk), fb = /<mc:Fallback[\s\S]*?<\/mc:Fallback>/.exec(blk);
                        if (!ch || !fb) return blk;
                        var m = /<a:blip [^>]*?r:embed="([^"]+)"/.exec(ch[0]);
                        if (!m) return blk;
                        var nf = fb[0].replace(/(<a:blip [^>]*?r:embed=")[^"]+(")/, function (all, p1, p2) { return p1 + m[1] + p2; });
                        return blk.replace(fb[0], function () { return nf; });
                    });
                    if (/^word\/header/.test(n)) y = tplFixHdr(y); if (y !== x) zip.file(n, y);
                });
            })).then(function () { return zip.generateAsync({ type: 'arraybuffer' }); });
        }).catch(function () { return buf; });
    }
    function tplAlignHdr(host) {
        function textLeft(p) {
            var w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), n;
            while ((n = w.nextNode())) {
                if (!n.nodeValue.trim()) continue;
                var r = document.createRange(); r.selectNodeContents(n);
                var rc = r.getClientRects();
                if (rc.length) return rc[0].left;
            }
            return null;
        }
        var heads = host.querySelectorAll('header');
        if (!heads.length) { var s0 = host.querySelector('section.docx'); heads = s0 ? [s0] : []; }
        Array.prototype.forEach.call(heads, function (h) {
            var ps = h.querySelectorAll('p'), first = null, ref = null, i;
            for (i = 0; i < ps.length; i++) {
                if (textLeft(ps[i]) === null) continue;
                if (!first) { first = ps[i]; continue; }
                ref = ps[i]; break;
            }
            if (!first || !ref) return;
            first.style.marginLeft = ''; first.style.textIndent = ''; var d = textLeft(ref) - textLeft(first);
            if (d > 4 && d < 300) first.style.textIndent = d + 'px';
        });
    }
    function tplTightHdr(host) {
        function textTop(p) {
            var w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), n;
            while ((n = w.nextNode())) {
                if (!n.nodeValue.trim()) continue;
                var r = document.createRange(); r.selectNodeContents(n);
                var rc = r.getClientRects();
                if (rc.length) return rc[0].top;
            }
            return null;
        }
        var heads = host.querySelectorAll('header');
        if (!heads.length) { var s0 = host.querySelector('section.docx'); heads = s0 ? [s0] : []; }
        Array.prototype.forEach.call(heads, function (h) {
            var ps = h.querySelectorAll('p'), lines = [], i;
            for (i = 0; i < ps.length && lines.length < 3; i++) {
                var tp = textTop(ps[i]);
                if (tp !== null) lines.push({ p: ps[i], t: tp });
            }
            if (lines.length < 3) return;
            var gap = lines[1].t - lines[0].t, pitch = lines[2].t - lines[1].t;
            if (pitch > 4 && gap > pitch + 3 && gap < 120) lines[0].p.style.marginBottom = (pitch - gap) + 'px';
        });
    }
    function card(t) {
        var d = document.createElement('div');
        d.style.cssText = 'border:1px solid rgba(128,128,128,.3);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px';
        d.innerHTML = '<img alt="" style="width:100%;height:110px;object-fit:contain;background:rgba(128,128,128,.12);border-radius:6px"><div style="font-weight:600;font-size:14px;word-break:break-word">' + esc(t.name) + '</div><button type="button" style="align-self:flex-start;padding:6px 12px;border:0;border-radius:8px;background:#fee2e2;color:#b91c1c;font:inherit;font-size:13px;font-weight:600;cursor:pointer">Delete</button>';
        list.appendChild(d); svAddEdit(d, t);
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
        var fd = new FormData(); var isW = /\.docx$/i.test(f.name); var blank = isW ? (function () { var c = document.createElement('canvas'); c.width = 8; c.height = 6; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 8, 6); var s = atob(c.toDataURL('image/png').split(',')[1]), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new File([u], 'template.png', { type: 'image/png' }); })() : null;
        fd.append('name', nm); fd.append('image', isW ? blank : f); if (isW) fd.append('original', f); else if (window.svOrig && window.svOrig.png === f) fd.append('original', window.svOrig.file);
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
                    return window.html2canvas(sec, { scale: 1600 / sec.offsetWidth, backgroundColor: '#ffffff', useCORS: true, ignoreElements: function (el) { return el.tagName === 'IMG' && /^https?:/i.test(el.getAttribute('src') || '') && !host.contains(el); } });
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
        f.slice(0, 4).arrayBuffer().then(function (h) {
            var b = new Uint8Array(h);
            if (!(b[0] === 0x50 && b[1] === 0x4B)) { fileIn.value = ''; srcOk = false; alert('That is not a real .docx file.'); return; }
            srcOk = true;
        });
        return;
        var label = addBtn.textContent;
        addBtn.disabled = true; addBtn.textContent = 'Converting Word file...';
        function done() { addBtn.disabled = false; addBtn.textContent = label; }
        f.slice(0, 4).arrayBuffer().then(function (h) {
            var b = new Uint8Array(h);
            if (!(b[0] === 0x50 && b[1] === 0x4B)) throw new Error('bad');
            return tplDocxToPng(f);
        }).then(function (blob) {
            var png = new File([blob], f.name.replace(/\.docx$/i, '') + '.png', { type: 'image/png' }); window.svOrig = { png: png, file: f };
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