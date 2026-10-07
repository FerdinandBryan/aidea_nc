/* AIDEA Admin - CertGen.js: certificate generator, shared by Receipts and Payments. Open with window.AideaCertGen.open({ service, onDone(file) }). */

(function () {
    var W = 1600, H = 1131, SERIF = 'Georgia, serif', SANS = 'Arial';
    var DEF = { bg: '#ffffff', primary: '#0f3d6e', accent: '#e0a82e', text: '#333333' };
    var ROLES = {
        analyst:    { label: 'Data Analyst', head: 'CERTIFICATE OF DATA ANALYSIS' },
        grammarian: { label: 'Grammarian',   head: 'CERTIFICATE OF GRAMMAR REVIEW' }
    };

    function fmtDate(v) {
        if (!v) return '';
        var d = new Date(v + 'T00:00:00');
        return isNaN(d) ? v : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    function wrap(ctx, text, maxW) {
        var words = String(text).split(/\s+/), lines = [], cur = '';
        words.forEach(function (w) {
            var t = cur ? cur + ' ' + w : w;
            if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else { cur = t; }
        });
        if (cur) lines.push(cur);
        return lines;
    }

    /* ---- read the design of the template image ---- */
    function hexc(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
    function dist(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }
    function lum(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

    function analyze(img) {
        var w = 240, h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
        var d = x.getImageData(0, 0, w, h).data, bins = {}, i;
        for (i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            var k = (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5);
            var b = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 });
            b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
        }
        var list = Object.keys(bins).map(function (k) {
            var b = bins[k]; return { n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] };
        }).sort(function (a, b) { return b.n - a.n; });
        if (!list.length) return Object.assign({}, DEF);

        var bg = list[0].c, total = d.length / 4, darkBg = lum(bg) < 0.45;
        var rest = list.filter(function (e) { return dist(e.c, bg) > 70 && e.n > total * 0.003; });
        var pool = darkBg ? rest.filter(function (e) { return lum(e.c) > 0.5; })
                          : rest.filter(function (e) { return lum(e.c) < 0.6; });
        var primary = (pool[0] || rest[0] || {}).c || null;
        var accent = null;
        for (i = 0; i < rest.length; i++) {
            if (primary && dist(rest[i].c, primary) > 90) { accent = rest[i].c; break; }
        }
        var text = null;
        if (!darkBg) pool.forEach(function (e) { if (!text || lum(e.c) < lum(text)) text = e.c; });
        return {
            bg: hexc(bg),
            primary: primary ? hexc(primary) : (darkBg ? '#ffffff' : DEF.primary),
            accent: accent ? hexc(accent) : DEF.accent,
            text: darkBg ? '#ffffff' : (text && lum(text) < 0.35 ? hexc(text) : DEF.text)
        };
    }

    function strip(ctx, x, y0, n) {
        x = Math.max(1, Math.min(W - 2, x));
        var d = ctx.getImageData(x - 1, y0, 3, n).data, out = [];
        for (var i = 0; i < n; i++) {
            var o = i * 12, r = 0, g = 0, b = 0;
            for (var j = 0; j < 3; j++) { r += d[o + j * 4]; g += d[o + j * 4 + 1]; b += d[o + j * 4 + 2]; }
            out.push([Math.round(r / 3), Math.round(g / 3), Math.round(b / 3)]);
        }
        return out;
    }
    function eraseBoxes(ctx, st) {
        if (!st.on) return;
        var hh = ctx.canvas.height;
        Object.keys(st.tpl).forEach(function (k) {
            var b = st.tpl[k].box;
            if (!b) return;
            var x0 = Math.max(0, Math.floor(b.x0 * W - 10)), x1 = Math.min(W - 1, Math.ceil(b.x1 * W + 10));
            var y0 = Math.max(0, Math.floor(b.y0 * hh - 6)), y1 = Math.min(hh - 1, Math.ceil(b.y1 * hh + 6));
            var n = y1 - y0 + 1;
            if (n < 1 || x1 - x0 < 2) return;
            var L = strip(ctx, x0 - 7, y0, n), R = strip(ctx, x1 + 7, y0, n);
            for (var i = 0; i < n; i++) {
                var g = ctx.createLinearGradient(x0, 0, x1, 0);
                g.addColorStop(0, 'rgb(' + L[i].join(',') + ')');
                g.addColorStop(1, 'rgb(' + R[i].join(',') + ')');
                ctx.fillStyle = g; ctx.fillRect(x0, y0 + i, x1 - x0, 1);
            }
        });
    }

        /* ---- layout that matches the Norzagaray certificate (template with header/footer only) ---- */
    function drawLayout(ctx, d, role, st) { var ov = (st && st.txt) || {};
        var k = ctx.canvas.width / 1170, F = 'Arial, Helvetica, sans-serif'; ctx.save(); ctx.translate(0, 44 * k);
        var L = 138 * k, R = 1018 * k, MW = R - L, px = Math.round(25 * k), lh = 29 * k, C = 585 * k;
        var analyst = /analy/i.test(String(role.head || '') + ' ' + String(role.label || ''));
        function f(b, s, i) { return (i ? 'italic ' : '') + (b ? 'bold ' : '') + Math.round(s) + 'px ' + F; }
        ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; [[690,190,350,60],[120,322,930,58],[120,468,930,432],[290,925,590,100],[290,1138,590,80],[250,1214,670,70]].forEach(function (r) { ctx.fillRect(r[0] * k, r[1] * k, r[2] * k, r[3] * k); }); ctx.fillStyle = '#000';

        function para(parts, x, y, justify) {
            var toks = [];
            parts.forEach(function (p) {
                String(p.t).split(/\s+/).filter(Boolean).forEach(function (w) {
                    ctx.font = f(p.b, px); toks.push({ t: w, b: p.b, w: ctx.measureText(w).width });
                });
            });
            ctx.font = f(false, px);
            var sp = ctx.measureText(' ').width, lines = [], cur = [], cw = 0;
            toks.forEach(function (tk) {
                var nw = cur.length ? cw + sp + tk.w : tk.w;
                if (nw > MW && cur.length) { lines.push(cur); cur = [tk]; cw = tk.w; } else { cur.push(tk); cw = nw; }
            });
            if (cur.length) lines.push(cur);
            lines.forEach(function (ln, i) {
                var sum = 0; ln.forEach(function (tk) { sum += tk.w; });
                var gap = (justify && i < lines.length - 1 && ln.length > 1) ? (MW - sum) / (ln.length - 1) : sp, cx = x;
                ln.forEach(function (tk) { ctx.font = f(tk.b, px); ctx.fillText(tk.t, cx, y + i * lh); cx += tk.w + gap; });
            });
            return y + (lines.length - 1) * lh;
        }
        function center(text, y, size, bold, italic) {
            ctx.font = f(bold, size, italic); ctx.textAlign = 'center'; ctx.fillText(text, C, y); ctx.textAlign = 'left';
        }

        /* Protocol No. (top right) */
        var a = 'Protocol No.: ', pv = d.proto || '\u2014';
        ctx.font = f(false, px); var wa = ctx.measureText(a).width;
        ctx.font = f(true, px); var wp = ctx.measureText(pv).width;
        ctx.font = f(false, px); ctx.fillText(a, R - wa - wp, 218 * k);
        ctx.font = f(true, px); ctx.fillText(pv, R - wp, 218 * k);

        /* heading */
        center((ov.head ? String(ov.head) : String(role.head || '')).toUpperCase(), 364 * k, 34 * k, true, false);

        /* paragraph with the title in bold */
        var title = '\u201C' + String(d.title || 'TITLE OF THE DOCUMENT').toUpperCase() + '\u201D';
        var dt = fmtDate(d.date) || '\u2014';
        var parts = analyst
            ? [{ t: 'This is to certify that the data for the research study', b: false }, { t: title, b: true },
               { t: 'have been evaluated and treated with the appropriate statistical treatment by the undersigned. The statistical treatment was aligned with the objectives and statement of the problem of the study for analysis, interpretation, and discussion.', b: false }]
            : [{ t: ov.intro || 'This is to certify that the manuscript entitled', b: false }, { t: title, b: true },
               { t: ov.outro || 'has been reviewed and finalized by the undersigned.', b: false }];
        var y = para(parts, L, 501 * k, true);
        para([{ t: ov.issued || 'This certification was issued on', b: false }, { t: dt + ',', b: true },
              { t: ov.purpose || "upon the researcher's request for whatever legal purpose this may serve.", b: false }], L, y + 2 * lh, true);

        /* name + signature line + caption */
        ctx.lineWidth = Math.max(1, 1.3 * k);
        center(d.name || 'Name', 962 * k, 25 * k, true, false);
        ctx.beginPath(); ctx.moveTo(C - 262 * k, 971 * k); ctx.lineTo(C + 262 * k, 971 * k); ctx.stroke();
        center(ov.cap || ('Name of ' + (analyst ? 'Data Analyst' : 'Grammarian') + ' and Signature'), 999 * k, 23 * k, false, true);

        /* date signed */
        center(String(dt).toUpperCase(), 1171 * k, 25 * k, true, false); ctx.beginPath(); ctx.moveTo(C - 262 * k, 1180 * k); ctx.lineTo(C + 262 * k, 1180 * k); ctx.stroke();
        
        center(ov.dsig || 'Date Signed', 1207 * k, 23 * k, false, true); ctx.restore();
    }
    /* ---- draw the certificate in the SYSTEM layout ---- */
    function draw(canvas, d, st) {
        var pal = st.pal, role = ROLES[d.role] || { label: d.role || '', head: 'CERTIFICATE OF ' + String(d.role || '').toUpperCase() };
        var BGP = { head: { x: 0.5, y: 0.235 }, intro1: { x: 0.5, y: 0.315 }, title: { x: 0.5, y: 0.405 }, intro2: { x: 0.5, y: 0.585 }, proto: { x: 0.17, y: 0.70 }, date: { x: 0.83, y: 0.70 }, name: { x: 0.5, y: 0.79 }, role: { x: 0.5, y: 0.85 } }; var BG = !!(st.bg && st.img); var H = BG ? Math.round(W * st.img.naturalHeight / st.img.naturalWidth) : 1131; canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        if (BG) { ctx.drawImage(st.img, 0, 0, W, H); eraseBoxes(ctx, st); } else { ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); }
        var boxes = [];

        if (!BG) { ctx.strokeStyle = pal.primary; ctx.lineWidth = 14; ctx.strokeRect(40, 40, W - 80, H - 80); }
        if (!BG) { ctx.strokeStyle = pal.accent; ctx.lineWidth = 4; ctx.strokeRect(68, 68, W - 136, H - 136); }
        ctx.textAlign = 'center';
        ctx.fillStyle = pal.primary; ctx.font = 'bold 34px Arial';
        var S1 = st.on && st.tpl.school; if (S1) ctx.font = 'bold ' + Math.round(S1.size) + 'px Arial'; if (S1 || !BG) ctx.fillText(S1 ? S1.text : 'NORZAGARAY COLLEGE', S1 ? S1.x * W : W / 2, S1 ? S1.y * H : 170);
        ctx.fillStyle = pal.text; ctx.font = '22px Arial';
        var S2 = st.on && st.tpl.sub; if (S2) ctx.font = Math.round(S2.size) + 'px Arial'; if (BG ? S2 : (!S1 || S2)) ctx.fillText(S2 ? S2.text : 'AIDEA', S2 ? S2.x * W : W / 2, S2 ? S2.y * H : 208);

        function put(key, text, size, style, fam, col, align, dx, dy) {
            var T = st.on && st.tpl[key]; var p = st.pos[key] || (T ? { x: T.x, y: T.y } : (BG && BGP[key] ? BGP[key] : { x: dx, y: dy })); if (T) { if (T.keep && T.text) text = T.text; if (T.size) size = T.size; } if (BG && !T && !st.pos[key] && Object.keys(st.tpl).length > 0 && (key === 'head' || key === 'intro1' || key === 'intro2')) return { x: p.x * W, y: p.y * H };
            var x = p.x * W, y = p.y * H, px = Math.round(size * st.scale);
            ctx.font = style + ' ' + px + 'px ' + fam;
            ctx.fillStyle = col; ctx.textAlign = align;
            ctx.fillText(text, x, y);
            var w = ctx.measureText(text).width;
            var x0 = align === 'center' ? x - w / 2 : (align === 'left' ? x : x - w);
            boxes.push({ key: key, ax: x, ay: y, x0: x0 - 12, x1: x0 + w + 12, y0: y - px, y1: y + px * 0.3 });
            return { x: x, y: y };
        }

        if (st.logo && !BG) {
            var lp = st.pos.logo || { x: 0.15, y: 0.17 };
            var lh = Math.round(130 * st.scale), lw = lh * st.logo.width / st.logo.height;
            var lx = lp.x * W, ly = lp.y * H;
            ctx.drawImage(st.logo, lx - lw / 2, ly - lh / 2, lw, lh);
            boxes.push({ key: 'logo', ax: lx, ay: ly, x0: lx - lw / 2, x1: lx + lw / 2, y0: ly - lh / 2, y1: ly + lh / 2 });
        }

        var LAY = !!BG; if (LAY) { drawLayout(ctx, d, role, st); } else { var h = put('head', role.head, 60, 'bold', SERIF, pal.primary, 'center', 0.5, 0.292);
        ctx.fillStyle = pal.accent; ctx.fillRect(h.x - 180, h.y + 30, 360, 5);
        put('intro1', 'This is to certify that the manuscript entitled', 28, 'italic', SERIF, pal.text, 'center', 0.5, 0.398);

        var tp = st.pos.title || (st.on && st.tpl.title) || (BG ? BGP.title : { x: 0.5, y: 0.473 });
        var tx = tp.x * W, ty = tp.y * H, tpx = Math.round(46 * st.scale);
        ctx.font = 'bold ' + tpx + 'px ' + SERIF;
        ctx.fillStyle = pal.primary; ctx.textAlign = 'center';
        var lines = wrap(ctx, d.title || 'Title of the document', 1200).slice(0, 3), gap = Math.round(62 * st.scale), maxw = 0;
        lines.forEach(function (ln, i) { ctx.fillText(ln, tx, ty + i * gap); maxw = Math.max(maxw, ctx.measureText(ln).width); });
        boxes.push({ key: 'title', ax: tx, ay: ty, x0: tx - maxw / 2 - 12, x1: tx + maxw / 2 + 12, y0: ty - tpx, y1: ty + (lines.length - 1) * gap + tpx * 0.3 });

        put('intro2', 'has been reviewed and finalized by the undersigned.', 28, 'italic', SERIF, pal.text, 'center', 0.5, 0.66);
        put('proto', 'Protocol No.: ' + (d.proto || '\u2014'), 26, 'normal', SANS, pal.text, 'left', 0.125, 0.77);
        put('date', 'Date: ' + (fmtDate(d.date) || '\u2014'), 26, 'normal', SANS, pal.text, 'right', 0.875, 0.77);
        var n = put('name', d.name || 'Name', 34, 'bold', SERIF, pal.primary, 'center', 0.5, 0.853);
        ctx.strokeStyle = pal.text; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(n.x - 230, n.y + 20); ctx.lineTo(n.x + 230, n.y + 20); ctx.stroke();
        put('role', role.label, 24, 'normal', SANS, pal.text, 'center', 0.5, 0.906); }
        st.boxes = boxes;
    }

    /* ---- small UI helpers ---- */
    function inp() { return 'width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#111827;font:inherit;box-sizing:border-box'; }
    function btn(bg, fg) { return 'padding:10px 16px;border:0;border-radius:10px;background:' + bg + ';color:' + fg + ';font:inherit;font-weight:600;cursor:pointer'; }
    function field(label, control) { return '<label style="display:block;font-size:12px;font-weight:600;color:#475569">' + label + '<div style="margin-top:4px">' + control + '</div></label>'; }

    function modal(html) {
        var o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.6);overflow:auto';
        o.innerHTML = html;
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        function close() { document.removeEventListener('keydown', onKey); o.remove(); }
        document.addEventListener('keydown', onKey);
        o.addEventListener('mousedown', function (e) { if (e.target === o) close(); });
        o.addEventListener('click', function (e) { if (e.target.closest('[data-cg-close]')) close(); });
        document.body.appendChild(o);
        Array.prototype.forEach.call(o.querySelectorAll('[data-cg-close]'), function (x) {
            if (x.textContent.trim() === '\u2715') x.style.display = 'none';
        });
        
        Array.prototype.forEach.call(o.querySelectorAll('[data-cg-close]'), function (x) {
            if (x.textContent.trim() === '\u2715') x.style.display = 'none';
        });
        var dlg = o.firstElementChild;
        if (dlg) {
            var bar = document.createElement('div');
            bar.style.cssText = 'position:sticky;top:0;height:0;z-index:5;text-align:right;overflow:visible';
            var cb = document.createElement('button');
            cb.type = 'button';
            cb.textContent = '\u2715 Close';
            cb.title = 'Close (Esc)';
            cb.setAttribute('aria-label', 'Close');
            cb.style.cssText = 'position:relative;top:-8px;right:-8px;padding:8px 14px;border:0;border-radius:999px;background:#ef4444;color:#fff;font:inherit;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
            cb.addEventListener('click', close);
            bar.appendChild(cb);
            dlg.insertBefore(bar, dlg.firstChild);
        }
        return { o: o, close: close };
    }

    function loadImage(file, done) {
        if (!file) return;
        if (!/^image\//.test(file.type)) { alert('Please choose an image (PNG, JPG or WebP).'); return; }
        var im = new Image();
        im.onload = function () { done(im); };
        im.onerror = function () { alert('Could not read that image.'); };
        im.src = URL.createObjectURL(file);
    }

    function choice(id, title, text) {
        return '<button type="button" data-choice="' + id + '" style="text-align:left;padding:16px;border:1.5px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#111827;font:inherit;cursor:pointer">' +
            '<strong style="display:block;font-size:15px;margin-bottom:6px">' + title + '</strong>' +
            '<span style="font-size:12.5px;color:#475569">' + text + '</span></button>';
    }

    /* ---- read the text of the template with Tesseract.js (free, in-browser) ---- */
    function loadTess(ok, fail) {
        if (window.Tesseract) return ok();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = ok; s.onerror = fail;
        document.head.appendChild(s);
    }
    function mapLines(lines, img) {
        var sx = 1 / img.naturalWidth, sy = 1 / img.naturalHeight, k = W / img.naturalWidth;
        var L = lines.filter(function (l) { return l.text && l.text.trim().length > 1 && l.confidence > 40; }).map(function (l) {
            var b = l.bbox, h = b.y1 - b.y0;
            return { t: l.text.trim(), cx: (b.x0 + b.x1) / 2 * sx, x0: b.x0 * sx, x1: b.x1 * sx, y0: b.y0 * sy, y1: b.y1 * sy, y: (b.y1 - h * 0.2) * sy, size: Math.max(14, h * k * 0.85) };
        }).sort(function (a, b) { return a.y - b.y; });
        var out = {};
        function bx(l) { return { x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1 }; }
        function find(rx, key, keep, align) {
            for (var i = 0; i < L.length; i++) {
                var l = L[i];
                if (!l.used && rx.test(l.t)) {
                    l.used = true;
                    out[key] = { text: l.t, x: align === 'left' ? l.x0 : (align === 'right' ? l.x1 : l.cx), y: l.y, size: l.size, keep: keep, box: bx(l) };
                    return l;
                }
            }
            return null;
        }
        var head = find(/certificate/i, 'head', true, 'center');
        var i1 = find(/to certify|\bcertify\b|entitled/i, 'intro1', true, 'center');
        var i2 = find(/reviewed|finalized|undersigned|hereby/i, 'intro2', true, 'center');
        var pr = find(/protocol/i, 'proto', false, 'left');
        if (pr && /date/i.test(pr.t)) { out.date = { x: pr.x1, y: pr.y, size: pr.size, keep: false }; }
        else find(/date/i, 'date', false, 'right');
        var ro = find(/data analyst|grammarian|analyst/i, 'role', false, 'center');
        if (ro) out.name = { x: ro.cx, y: ro.y - 0.053 };
        if (i1 && i2) out.title = { x: (i1.cx + i2.cx) / 2, y: i1.y + 0.29 * (i2.y - i1.y) };
        if (head) {
            var top = L.filter(function (l) { return !l.used && l.y < head.y - 0.01 && /[A-Za-z]{3}/.test(l.t); });
            if (top[0]) out.school = { text: top[0].t, x: top[0].cx, y: top[0].y, size: top[0].size, box: bx(top[0]) };
            if (top[1]) out.sub = { text: top[1].t, x: top[1].cx, y: top[1].y, size: top[1].size, box: bx(top[1]) };
        }
        return out;
    }
    function svTxtPanel(st, q, redraw) {
        var old = q('#cgTxtEdit'); if (old) old.remove();
        var anchor = q('#cgOcrStatus');
        if (!anchor || !anchor.parentNode) return;
        st.txt = st.txt || {};
        var w = document.createElement('div');
        w.id = 'cgTxtEdit';
        w.style.cssText = 'margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;color:#111827';
        var h = document.createElement('div');
        h.style.cssText = 'font-weight:600;margin-bottom:6px';
        h.textContent = 'Certificate wording (leave blank to keep the default)';
        w.appendChild(h);
        var defs = [
            ['head', 'Heading', 'Default: from the selected service'],
            ['intro', 'Opening sentence', 'This is to certify that the manuscript entitled'],
            ['outro', 'Closing sentence', 'has been reviewed and finalized by the undersigned.'],
            ['issued', 'Issued line', 'This certification was issued on'],
            ['purpose', 'Purpose line', "upon the researcher's request for whatever legal purpose this may serve."],
            ['cap', 'Name caption', 'Name of Grammarian and Signature'],
            ['dsig', 'Date caption', 'Date Signed']
        ];
        defs.forEach(function (d) {
            var lab = document.createElement('label');
            lab.style.cssText = 'display:block;margin-bottom:6px;font-weight:600;color:#475569';
            lab.appendChild(document.createTextNode(d[1]));
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.value = st.txt[d[0]] || '';
            inp.placeholder = d[2];
            inp.style.cssText = 'display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font:inherit;color:#111827;background:#fff';
            inp.addEventListener('input', function () { st.txt[d[0]] = inp.value; redraw(); });
            lab.appendChild(inp);
            w.appendChild(lab);
        });
        anchor.parentNode.insertAdjacentElement('afterend', w);
    }
    function svTplPanel(st, q) {
        var old = q('#cgTplEdit'); if (old) old.remove();
        var keys = ['school', 'sub'].filter(function (k) { return st.tpl && st.tpl[k] && st.tpl[k].text; });
        var anchor = q('#cgOcrStatus');
        if (!keys.length || !anchor || !anchor.parentNode) return;
        var w = document.createElement('div');
        w.id = 'cgTplEdit';
        w.style.cssText = 'margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;color:#111827';
        var h = document.createElement('div');
        h.style.cssText = 'font-weight:600;margin-bottom:6px';
        h.textContent = 'Template text (edit to replace the original)';
        w.appendChild(h);
        var names = { school: 'Top line', sub: 'Second line' };
        keys.forEach(function (k) {
            var lab = document.createElement('label');
            lab.style.cssText = 'display:block;margin-bottom:6px;font-weight:600;color:#475569';
            lab.appendChild(document.createTextNode(names[k]));
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.value = st.tpl[k].text;
            inp.style.cssText = 'display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font:inherit;color:#111827;background:#fff';
            inp.addEventListener('input', function () { st.tpl[k].text = inp.value; });
            lab.appendChild(inp);
            w.appendChild(lab);
        });
        anchor.parentNode.insertAdjacentElement('afterend', w);
    }
    function runOcr(st, q, redraw) {
        var img = st.img, status = q('#cgOcrStatus'), box = q('#cgOcr');
        function say(m) { if (status) status.textContent = m; }
        function done(m) { say(m); if (box) box.disabled = false; svTplPanel(st, q); svTxtPanel(st, q, redraw); redraw(); }
        if (box) box.disabled = true;
        say('(reading template, first time may take a while...)');
        loadTess(function () {
            window.Tesseract.recognize(img.src, 'eng', {
                logger: function (m) { if (m.status === 'recognizing text') say('(reading ' + Math.round(m.progress * 100) + '%)'); }
            }).then(function (r) {
                if (st.img !== img) return;
                st.tpl = mapLines(r.data.lines || [], img);
                var n = Object.keys(st.tpl).length;
                done(n ? '(found ' + n + ' items)' : '(no text found, using defaults)');
            }).catch(function () { done('(could not read the image, using defaults)'); });
        }, function () { done('(could not load Tesseract, check your internet)'); });
    }
    /* ---- automatic protocol number: NC-YYYY-000 ---- */
    function svcCode(s) {
        s = String(s || '').toLowerCase();
        if (/plagiar/.test(s)) return 'PLRSPA';
        if (/data\s*analy/.test(s)) return 'RSDA';
        if (/grammar/.test(s)) return 'RSE';
        if (/ncrc/.test(s)) return 'RSREC';
        return '';
    }
    function protoKey(yr, svc) { var c = svcCode(svc); return 'aidea_cert_seq_' + (c ? c + '_' : '') + yr; }
    function protoCount(yr, svc) { try { return parseInt(localStorage.getItem(protoKey(yr, svc)), 10) || 0; } catch (e) { return 0; } }
    function protoPeek(yr, svc) {
        var n = String(protoCount(yr, svc) + 1).padStart(3, '0'), c = svcCode(svc);
        return c ? c + '-' + n + '-' + yr : 'NC-' + yr + '-' + n;
    }
    function protoCommit(yr, svc) { try { localStorage.setItem(protoKey(yr, svc), String(protoCount(yr, svc) + 1)); } catch (e) {} }

    var cgExtra = {};
    function svLoad(urls) {
        return new Promise(function (ok, fail) {
            var i = 0;
            (function next() {
                if (i >= urls.length) { fail(new Error('Could not load a library')); return; }
                var s = document.createElement('script'); s.src = urls[i++];
                s.onload = ok; s.onerror = next; document.head.appendChild(s);
            })();
        });
    }
    function svNeed(test, urls) { return test() ? Promise.resolve() : svLoad(urls); }
    function svDocxGen(buf, name) {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;top:4vh;bottom:4vh;left:50%;transform:translateX(-50%);width:min(1240px,94vw);z-index:99999;background:rgba(0,0,0,.65);border-radius:12px;overflow:hidden;box-shadow:0 0 0 100vmax rgba(0,0,0,.55);display:flex;flex-direction:column;font:14px Arial,sans-serif;color:#111827';
        var bs = 'height:30px;padding:0 10px;border:1px solid #9ca3af;border-radius:6px;background:#fff;color:#111827;cursor:pointer;font:inherit';
        var tb = 'height:28px;min-width:28px;border:0;border-radius:6px;background:transparent;color:#1f2937;cursor:pointer;font:inherit';
        var fi = 'height:30px;padding:0 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;color:#111827;background:#fff;min-width:0';
        function cb(c, l, ti) { return '<button type="button" data-c="' + c + '" title="' + ti + '" style="' + tb + '">' + l + '</button>'; }
        ov.innerHTML =
            '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;background:#fff;border-bottom:1px solid #d1d5db">' +
            '<input id="gTitle" placeholder="Title" style="' + fi + ';flex:2;min-width:160px"><input id="gProto" placeholder="Protocol No." style="' + fi + ';width:130px"><input id="gDate" type="date" style="' + fi + '"><input id="gName" placeholder="Name" style="' + fi + ';width:170px">' +
            '<button type="button" data-a="print" style="' + bs + '">Print / PDF</button><button type="button" data-a="docx" style="' + bs + '">Save</button><button type="button" data-a="close" style="' + bs + '">Close</button></div>' +
            '<div id="gTb" style="display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px 16px;background:#edf2fa;border-bottom:1px solid #d1d5db">' +
            cb('undo', '&#8630;', 'Undo') + cb('redo', '&#8631;', 'Redo') +
            '<select data-f="font" style="' + tb + '"><option value="">Font</option><option>Arial</option><option>Times New Roman</option><option>Calibri</option><option>Cambria</option><option>Georgia</option></select>' +
            '<select data-f="size" style="' + tb + '"><option value="">Size</option><option>10</option><option>11</option><option>12</option><option>14</option><option>16</option><option>18</option><option>24</option><option>32</option></select>' +
            cb('bold', '<b>B</b>', 'Bold') + cb('italic', '<i>I</i>', 'Italic') + cb('underline', '<u>U</u>', 'Underline') +
            '<input type="color" data-k="foreColor" value="#000000" style="width:28px;height:28px;border:0;background:transparent"><input type="color" data-k="hiliteColor" value="#ffff00" style="width:28px;height:28px;border:0;background:transparent">' +
            cb('justifyLeft', '&#8676;', 'Left') + cb('justifyCenter', '&#8596;', 'Center') + cb('justifyRight', '&#8677;', 'Right') + cb('justifyFull', '&#9776;', 'Justify') +
            cb('insertUnorderedList', '&#8226;&#8801;', 'Bullets') + cb('insertOrderedList', '1.&#8801;', 'Numbers') + '</div>' +
            '<div style="flex:1;overflow:auto;background:#e5e7eb;padding:16px"><div id="gMsg" style="text-align:center;color:#4b5563;padding:24px">Opening ' + String(name || 'template').replace(/[<>&]/g, '') + '...</div><div id="gHost"></div></div>';
        document.body.appendChild(ov);
        ov.querySelector('#gDate').value = new Date().toISOString().slice(0, 10);
        var host = ov.querySelector('#gHost'), msg = ov.querySelector('#gMsg'), saved = null, phs = [];
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
        var bar = ov.querySelector('#gTb');
        bar.addEventListener('mousedown', function (e) { var n = e.target.tagName; if (n === 'SELECT' || n === 'INPUT' || n === 'OPTION') return; e.preventDefault(); });
        bar.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-c]'); if (b) run(b.getAttribute('data-c')); });
        bar.addEventListener('change', function (e) { var x = e.target, f = x.getAttribute('data-f'); if (f === 'font' && x.value) run('fontName', x.value); else if (f === 'size' && x.value) setSize(parseInt(x.value, 10)); if (f) x.selectedIndex = 0; });
        bar.addEventListener('input', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (k) run(k, e.target.value); });
        function val(id) { return (ov.querySelector(id).value || '').trim(); }
        function fillCells(label, v) {
            Array.prototype.forEach.call(host.querySelectorAll('td'), function (td) {
                if (td.textContent.replace(/[\s:]+/g, ' ').trim().toLowerCase() !== label) return;
                var nx = td.nextElementSibling; if (!nx) return;
                if (!nx._svFill && nx.textContent.trim()) return;
                nx._svFill = true; nx.textContent = v;
            });
        }
        function apply() {
            var d = val('#gDate'), dt = d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
            var vals = { title: val('#gTitle'), protocol: val('#gProto'), name: val('#gName'), date: dt };
            phs.forEach(function (s) { s.textContent = vals[s.getAttribute('data-ph')] || s._tok; });
            if (vals.protocol) fillCells('protocol no', vals.protocol);
            if (vals.title) fillCells('title', vals.title);
        }
        ov.querySelectorAll('#gTitle,#gProto,#gDate,#gName').forEach(function (i) { i.addEventListener('input', apply); });
        function close() { document.removeEventListener('selectionchange', onSel); ov.remove(); }
        ov.querySelector('[data-a="close"]').addEventListener('click', close);
        ov.querySelector('[data-a="print"]').addEventListener('click', function () {
            svPrintLive(ov); return; var w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
            var st = ''; Array.prototype.forEach.call(host.querySelectorAll('style'), function (s) { st += s.outerHTML; });
            var pg = ''; Array.prototype.forEach.call(host.querySelectorAll('section.docx'), function (s) { var c = s.cloneNode(true); c.removeAttribute('contenteditable'); pg += c.outerHTML; });
            w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate</title>' + st + '<style>@page{margin:0}body{margin:0}section.docx{margin:0 auto!important;box-shadow:none!important}header p{white-space:nowrap!important}</style></head><body>' + pg + '</body></html>');
            w.document.close(); w.onload = function () { w.focus(); w.print(); };
        });
        ov.querySelector('[data-a="docx"]').addEventListener('click', function () {
            svSaveDocx(close, buf, name, { title: val('#gTitle'), protocol: val('#gProto'), name: val('#gName'), date: (function () { var d = val('#gDate'); return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''; })() });
            return;
            svNeed(function () { return window.html2canvas; }, ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js']).then(function () {
                var secs = host.querySelectorAll('section.docx'), i = 0;
                (function next() {
                    if (i >= secs.length) return;
                    var s = secs[i++];
                    window.html2canvas(s, { scale: 1600 / s.offsetWidth, backgroundColor: '#ffffff', useCORS: true }).then(function (c) {
                        var a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'certificate-page' + i + '.png'; document.body.appendChild(a); a.click(); a.remove(); next();
                    });
                })();
            }).catch(function () { alert('Could not create the PNG.'); });
        });
        svNeed(function () { return window.JSZip; }, ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'])
            .then(function () { return svNeed(function () { return window.docx; }, ['https://cdnjs.cloudflare.com/ajax/libs/docx-preview/0.3.2/docx-preview.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js']); })
            .then(function () { return svFixAlt(buf).then(function (fb) { return window.docx.renderAsync(fb, host, null, { className: 'docx', inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false }); }); })
            .then(function () {
                msg.remove(); svAlignHdr(host); svTightHdr(host); svHdrFinish(host);
                var rx = /\{\{\s*(title|name|date|protocol)\s*\}\}/gi, nodes = [], w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT), n;
                while ((n = w.nextNode())) { if (/\{\{/.test(n.nodeValue)) nodes.push(n); }
                nodes.forEach(function (tn) {
                    var parts = tn.nodeValue.split(rx), frag = document.createDocumentFragment();
                    for (var i = 0; i < parts.length; i++) {
                        if (i % 2 === 0) { if (parts[i]) frag.appendChild(document.createTextNode(parts[i])); }
                        else { var sp = document.createElement('span'); sp.setAttribute('data-ph', parts[i].toLowerCase()); sp._tok = '{{' + parts[i].toLowerCase() + '}}'; sp.textContent = sp._tok; phs.push(sp); frag.appendChild(sp); }
                    }
                    tn.parentNode.replaceChild(frag, tn);
                });
                Array.prototype.forEach.call(host.querySelectorAll('section.docx'), function (s) { s.setAttribute('contenteditable', 'true'); s.setAttribute('spellcheck', 'true'); s.style.margin = '0 auto 16px'; s.style.outline = 'none'; }); svPageTabs(ov, host);
                apply();
            }).catch(function (e) { msg.textContent = 'Could not open this template (' + ((e && e.message) || 'error') + ').'; });
    }
    function svPageTabs(ov, host) {
        var secs = host.querySelectorAll('section.docx');
        var bar = ov.querySelector('#gTb');
        if (!bar || !secs.length) return;
        var wrap = document.createElement('span');
        wrap.style.cssText = 'margin-left:auto;display:flex;gap:4px;align-items:center;font-size:13px;color:#475569';
        if (secs.length < 2) {
            wrap.textContent = '1 page';
        } else {
            wrap.appendChild(document.createTextNode('Pages:'));
            Array.prototype.forEach.call(secs, function (s, i) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = 'Page ' + (i + 1);
                b.style.cssText = 'height:28px;padding:0 10px;border:1px solid #9ca3af;border-radius:6px;background:#fff;color:#111827;cursor:pointer;font:inherit';
                b.addEventListener('click', function () { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
                wrap.appendChild(b);
            });
        }
        bar.appendChild(wrap);
    }
    function svFixHdr(x) {
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
    function svFixAlt(buf) {
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
                    if (/^word\/header/.test(n)) y = svFixHdr(y); if (y !== x) zip.file(n, y);
                });
            })).then(function () { return zip.generateAsync({ type: 'arraybuffer' }); });
        }).catch(function () { return buf; });
    }
    function svAlignHdr(host) {
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
    function svTightHdr(host) {
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
    function svPrintLive(ov) { try { svAlignHdr(ov.querySelector('#gHost')); } catch (e) { } try { svHdrFinish(ov.querySelector('#gHost')); } catch (e) { }
        var st = document.createElement('style');
        st.textContent = '@media print{' +
            '@page{margin:0}' +
            'html,body{height:auto!important;overflow:visible!important;background:#fff!important}' +
            'body>*{display:none!important}' +
            'body>.svprinting{display:block!important;position:static!important;transform:none!important;width:auto!important;box-shadow:none!important;overflow:visible!important;background:#fff!important;border-radius:0!important}' +
            '.svprinting>div:nth-child(1),.svprinting>div:nth-child(2),.svprinting #gMsg{display:none!important}' +
            '.svprinting>div:nth-child(3){display:block!important;overflow:visible!important;padding:0!important;background:#fff!important}' +
            '.svprinting section.docx{margin:0 auto!important;box-shadow:none!important;page-break-after:always}' +
            '.svprinting section.docx:last-of-type{page-break-after:auto}' +
            '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
        document.head.appendChild(st);
        ov.classList.add('svprinting');
        function done() { ov.classList.remove('svprinting'); st.remove(); window.removeEventListener('afterprint', done); }
        window.addEventListener('afterprint', done);
        setTimeout(function () { window.print(); }, 60);
    }
    function svHideBlank(host) {
        function chk(im) {
            if (im.naturalWidth <= 2 && im.naturalHeight <= 2) {
                var r = im.getBoundingClientRect();
                if (r.width > 100 || r.height > 100) im.style.visibility = 'hidden';
            }
        }
        Array.prototype.forEach.call(host.querySelectorAll('img'), function (im) {
            if (im.complete) chk(im);
            else im.addEventListener('load', function () { chk(im); }, { once: true });
        });
    }
    function svHdrFinish(host) {
        try { svHideBlank(host); } catch (e) { }
        Array.prototype.forEach.call(host.querySelectorAll('header'), function (h) {
            Array.prototype.forEach.call(h.querySelectorAll('.svhdrline'), function (o) { o.remove(); });
            var imgs = Array.prototype.slice.call(h.querySelectorAll('img')).filter(function (im) { var r = im.getBoundingClientRect(); return r.height > 40 && r.width > 40 && im.style.visibility !== 'hidden'; });
            if (!imgs.length) return;
            imgs.forEach(function (im) { im.style.transform = ''; });
            var seal = imgs.reduce(function (a, b) { return b.getBoundingClientRect().left < a.getBoundingClientRect().left ? b : a; });
            var ps = Array.prototype.filter.call(h.querySelectorAll('p'), function (p) { return p.textContent.trim(); }).slice(0, 4);
            if (!ps.length) return;
            var sr = seal.getBoundingClientRect(), t0 = ps[0].getBoundingClientRect(), t1 = ps[ps.length - 1].getBoundingClientRect();
            var d = (t0.top + t1.bottom) / 2 - (sr.top + sr.bottom) / 2;
            var hdrMid = (t0.top + t1.bottom) / 2;
            imgs.forEach(function (im) { var ir = im.getBoundingClientRect(), dd = hdrMid - (ir.top + ir.bottom) / 2; if (Math.abs(dd) > 2 && Math.abs(dd) < 80) im.style.transform = 'translateY(' + dd + 'px)'; });
            if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
            var hr = h.getBoundingClientRect(), s2 = seal.getBoundingClientRect();
            var ln = document.createElement('div');
            ln.className = 'svhdrline';
            ln.setAttribute('contenteditable', 'false');
            ln.style.cssText = 'position:absolute;left:-12px;width:648px;height:2px;background:#4a7ebb;pointer-events:none;top:' + Math.round(s2.bottom - hr.top + 19) + 'px';
            h.appendChild(ln);
            var svRightLogo = imgs.reduce(function (a, b) { return b.getBoundingClientRect().left > a.getBoundingClientRect().left ? b : a; });
            if (svRightLogo !== seal) {
                svRightLogo.style.transform = '';
                var rl = svRightLogo.getBoundingClientRect(), lr = ln.getBoundingClientRect(), sb = seal.getBoundingClientRect();
                var dx = lr.right - rl.right, dy = sb.bottom - rl.bottom;
                if (Math.abs(dx) < 300 && Math.abs(dy) < 120) svRightLogo.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            }
        });
    }
    function svPdfToImage(f) {
        return svNeed(function () { return window.pdfjsLib; }, ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'])
            .then(function () {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                return f.arrayBuffer();
            })
            .then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
            .then(function (pdf) { return pdf.getPage(1); })
            .then(function (page) {
                var v0 = page.getViewport({ scale: 1 }), v = page.getViewport({ scale: 1600 / v0.width });
                var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
                var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
                return page.render({ canvasContext: cx, viewport: v }).promise.then(function () { return c; });
            })
            .then(function (c) {
                return new Promise(function (ok, fail) {
                    c.toBlob(function (b) { if (b) ok(new File([b], f.name.replace(/\.pdf$/i, '') + '.png', { type: 'image/png' })); else fail(new Error('No image')); }, 'image/png');
                });
            });
    }
    function svDocxToPng(buf) {
        return svNeed(function () { return window.JSZip; }, ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'])
            .then(function () { return svNeed(function () { return window.docx; }, ['https://cdnjs.cloudflare.com/ajax/libs/docx-preview/0.3.2/docx-preview.min.js', 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js']); })
            .then(function () { return svNeed(function () { return window.html2canvas; }, ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js']); })
            .then(function () {
                var host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;background:#fff';
                document.body.appendChild(host);
                return window.docx.renderAsync(buf, host, null, { inWrapper: false, breakPages: true }).then(function () {
                    var pg = host.querySelector('section.docx') || host;
                    return window.html2canvas(pg, {
                        scale: 1.5, useCORS: true, backgroundColor: '#fff',
                        ignoreElements: function (el) { return el.tagName === 'IMG' && /^https?:/i.test(el.getAttribute('src') || '') && !host.contains(el); }
                    });
                }).then(function (c) {
                    host.remove();
                    return new Promise(function (ok, fail) {
                        c.toBlob(function (b) { if (b) ok(new File([b], 'template.png', { type: 'image/png' })); else fail(new Error('No image')); }, 'image/png');
                    });
                }).catch(function (e) { host.remove(); throw e; });
            });
    }
    function svFillXml(x, v) {
        var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
        return x.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function (p) {
            var re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, txt = '', m;
            while ((m = re.exec(p))) txt += m[1];
            if (!/\{\{/.test(txt)) return p;
            var out = txt.replace(/\{\{\s*(title|name|date|protocol)\s*\}\}/gi, function (all, k) { var r = v[k.toLowerCase()]; return r ? esc(r) : all; });
            if (out === txt) return p;
            var i = 0;
            return p.replace(re, function () { return i++ === 0 ? '<w:t xml:space="preserve">' + out + '</w:t>' : '<w:t></w:t>'; });
        });
    }
    function svDownloadDocx(buf, name, vals) {
        svNeed(function () { return window.JSZip; }, ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'])
            .then(function () { return window.JSZip.loadAsync(buf); })
            .then(function (zip) {
                var names = Object.keys(zip.files).filter(function (n) { return /^word\/(document|header\d*|footer\d*)\.xml$/.test(n); });
                return Promise.all(names.map(function (n) {
                    return zip.file(n).async('string').then(function (x) { zip.file(n, svFillXml(x, vals)); });
                })).then(function () {
                    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
                });
            })
            .then(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = String(name || 'certificate').replace(/[\\\/:*?"<>|]/g, '') + '.docx';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            })
            .catch(function () { alert('Could not create the Word file.'); });
    }
    function svSaveDocx(closeFn, buf, name, vals) {
        if (!(cgExtra && typeof cgExtra.onDone === 'function')) { svSaveDocxOld(closeFn, buf, name, vals); return; }
        var host = document.getElementById('gHost');
        var secs = host ? host.querySelectorAll('section.docx') : [];
        if (!secs.length) { svSaveDocxOld(closeFn, buf, name, vals); return; }
        var fname = 'certificate-' + String((vals && vals.protocol) || name || 'template').replace(/[^\w.-]+/g, '_') + '.pdf';
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { }
        try { svAlignHdr(host); } catch (e) { }
        try { svHdrFinish(host); } catch (e) { }
        svNeed(function () { return window.html2canvas; }, ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'])
            .then(function () { return svNeed(function () { return window.jspdf && window.jspdf.jsPDF; }, ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js']); })
            .then(function () {
                var J = window.jspdf.jsPDF, pdf = null, i = 0;
                return (function next() {
                    if (i >= secs.length) return Promise.resolve();
                    var s = secs[i];
                    var w = s.offsetWidth, h = s.offsetHeight;
                    return window.html2canvas(s, { scale: 1600 / w, backgroundColor: '#ffffff', useCORS: true }).then(function (c) {
                        var pw = w * 0.75, ph = h * 0.75, o = pw > ph ? 'l' : 'p';
                        if (!pdf) { pdf = new J({ orientation: o, unit: 'pt', format: [pw, ph] }); }
                        else { pdf.addPage([pw, ph], o); }
                        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
                        i++;
                        return next();
                    });
                })().then(function () { return pdf.output('blob'); });
            })
            .then(function (blob) {
                var file = new File([blob], fname, { type: 'application/pdf' });
                closeFn();
                cgExtra.onDone(file);
            }, function () {
                svSaveDocxOld(closeFn, buf, name, vals);
            });
    }

    function svSaveDocxOld(closeFn, buf, name, vals) {
        if (!(cgExtra && typeof cgExtra.onDone === 'function')) { svDownloadDocx(buf, name, vals); return; }
        var mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        var fname = 'certificate-' + String(vals.protocol || name || 'template').replace(/[^\w.-]+/g, '_') + '.docx';
        svNeed(function () { return window.JSZip; }, ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'])
            .then(function () { return window.JSZip.loadAsync(buf); })
            .then(function (zip) {
                var names = Object.keys(zip.files).filter(function (n) { return /^word\/(document|header\d*|footer\d*)\.xml$/.test(n); });
                return Promise.all(names.map(function (n) {
                    return zip.file(n).async('string').then(function (x) { zip.file(n, svFillXml(x, vals)); });
                })).then(function () { return zip.generateAsync({ type: 'blob', mimeType: mime, compression: 'DEFLATE' }); });
            })
            .then(function (blob) {
                var file = new File([blob], fname, { type: mime });
                var cvFd = new FormData(); cvFd.append('file', file);
                return fetch((typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api') + '/certificates/docx-to-pdf', {
                    method: 'POST',
                    headers: { 'Accept': 'application/pdf', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') },
                    body: cvFd
                }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
                  .then(function (pb) { return new File([pb], fname.replace(/\.docx$/i, '.pdf'), { type: 'application/pdf' }); })
                  .catch(function () { return file; })
                  .then(function (out) { closeFn(); cgExtra.onDone(out); });
                closeFn();
                cgExtra.onDone(file);
            })
            .catch(function () { alert('Could not save the Word file.'); });
    }
    function svBlankPng() {
        var c = document.createElement('canvas'); c.width = 8; c.height = 6;
        var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 8, 6);
        return new Promise(function (ok, fail) {
            c.toBlob(function (b) { if (b) ok(new File([b], 'template.png', { type: 'image/png' })); else fail(new Error('No image')); }, 'image/png');
        });
    }
    function svSaveTpl(orig, f, png) {
        var nm = prompt('Save as a reusable template? Enter a name (Cancel = do not save):', f.name.replace(/\.(docx|pdf)$/i, ''));
        if (!nm || !nm.trim()) return;
        (png ? Promise.resolve(png) : svBlankPng()).then(function (img) {
            var fd = new FormData();
            fd.append('name', nm.trim()); fd.append('image', img);
            if (!png) fd.append('original', f);
            var h = Object.assign({}, tplHd); delete h['Content-Type']; delete h['content-type'];
            return fetch(tplBase + '/certificate-templates', { method: 'POST', headers: h, body: fd });
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            alert('Saved. It now appears in the template list.');
        }).catch(function (e) { alert('Not saved: ' + ((e && e.message) || 'error')); });
    }
    function openChooser() {
        var m = modal(
            '<div style="width:min(580px,100%);background:#fff;color:#111827;border-radius:14px;padding:22px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<h3 style="margin:0;font-size:18px">Generate certificate</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<p style="margin:0 0 16px;font-size:13px;color:#475569">Which template do you want to use?</p>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">' +
            choice('sys', 'System template', 'Use the built-in AIDEA certificate design.') +
            choice('new', 'New template', 'Attach a Word (.docx) file to edit all its text, or a PDF or image.') +
            '</div>' +
            '<input type="file" id="cgFile" accept=".docx,.pdf,image/png,image/jpeg,image/webp" hidden>' +
            '<p style="margin:14px 0 0;font-size:12px;color:#64748b">Choose a Word (.docx) file to edit it like in Word. A PDF is opened as a picture, so save it as .docx to edit the text.</p>' +
            '</div>');
        var file = m.o.querySelector('#cgFile');
        var tplBase = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api');
        var tplHd = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') };
        (function () {
            var first = m.o.querySelector('[data-choice]'), grid = first && first.parentNode;
            if (!grid) return;
            fetch(tplBase + '/certificate-templates', { headers: tplHd }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (list) {
                (Array.isArray(list) ? list : []).forEach(function (t) {
                    var nm = String(t.name || 'Template').replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';'; });
                    grid.insertAdjacentHTML('beforeend', choice('tpl:' + parseInt(t.id, 10), nm, 'Saved template'));
                });
            }).catch(function (e) { console.warn('Saved templates not loaded:', e); });
        })();
        m.o.addEventListener('click', function (e) {
            var c = e.target.closest ? e.target.closest('[data-choice]') : null;
            if (!c || c._svSkip) return;
            var v = String(c.getAttribute('data-choice'));
            if (v.indexOf('tpl:') !== 0) return;
            e.stopImmediatePropagation(); e.preventDefault();
            var id = parseInt(v.slice(4), 10), st0 = c.querySelector('strong');
            fetch(tplBase + '/certificate-templates/' + id + '/original', { headers: tplHd }).then(function (r) { if (!r.ok) throw new Error('none'); return r.arrayBuffer(); })
                .then(function (buf) { m.close(); svDocxGen(buf, st0 ? st0.textContent : ''); })
                .catch(function () { c._svSkip = true; c.click(); c._svSkip = false; });
        }, true);
        m.o.addEventListener('click', function (e) {
            var c = e.target.closest('[data-choice]');
            if (!c) return;
            if (c.getAttribute('data-choice') === 'sys') { m.close(); openGenerator(Object.assign({ mode: 'system' }, cgExtra)); }
            else if (String(c.getAttribute('data-choice')).indexOf('tpl:') === 0) {
                var tid = parseInt(String(c.getAttribute('data-choice')).slice(4), 10);
                fetch(tplBase + '/certificate-templates/' + tid + '/image', { headers: tplHd }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
                    var im = new Image();
                    im.onload = function () { m.close(); openGenerator(Object.assign({ mode: 'template', img: im, pal: analyze(im) }, cgExtra)); };
                    im.onerror = function () { alert('Could not open that template.'); };
                    im.src = j.image;
                }).catch(function (e) { alert('Could not load that template.'); console.warn(e); });
            } else file.click();
        });
        file.addEventListener('change', function () {
            var f0 = file.files && file.files[0];
            if (f0 && /\.docx$/i.test(f0.name)) {
                file.value = '';
                f0.arrayBuffer().then(function (buf) {
                    var b = new Uint8Array(buf.slice(0, 2));
                    if (!(b[0] === 0x50 && b[1] === 0x4B)) { alert('That is not a real .docx file.'); return; }
                    m.close(); svSaveTpl(buf, f0, null); svDocxGen(buf, f0.name.replace(/\.docx$/i, ''));
                });
                return;
            }
            if (f0 && /\.pdf$/i.test(f0.name)) {
                file.value = '';
                svPdfToImage(f0).then(function (png) { svSaveTpl(null, f0, png);
                    loadImage(png, function (im) { m.close(); openGenerator(Object.assign({ mode: 'template', img: im, pal: analyze(im) }, cgExtra)); });
                }).catch(function () { alert('Could not read that PDF. Save it as a .docx to edit the text.'); });
                return;
            }
            loadImage(file.files[0], function (im) { m.close(); openGenerator(Object.assign({ mode: 'template', img: im, pal: analyze(im) }, cgExtra)); });
        });
    }

    /* ---- drag a box around the logo / seal on the template ---- */
    function pickLogo(img, done) {
        var cw = Math.min(820, window.innerWidth - 80), sc = cw / img.naturalWidth, ch = Math.round(img.naturalHeight * sc);
        var m = modal(
            '<div style="width:min(' + (cw + 40) + 'px,100%);background:#fff;color:#111827;border-radius:14px;padding:18px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
            '<h3 style="margin:0;font-size:17px">Select the logo or seal</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<p style="margin:0 0 10px;font-size:13px;color:#475569">Drag a box around the logo on your template.</p>' +
            '<canvas id="lgCv" width="' + cw + '" height="' + ch + '" style="width:100%;height:auto;border:1px solid #d1d5db;border-radius:8px;touch-action:none;cursor:crosshair"></canvas>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">' +
            '<button type="button" data-cg-close style="' + btn('#e5e7eb', '#111827') + '">Cancel</button>' +
            '<button type="button" id="lgUse" style="' + btn('#1d4ed8', '#fff') + '">Use selection</button></div></div>');
        var cv = m.o.querySelector('#lgCv'), x = cv.getContext('2d'), r = null, start = null;
        function paint() {
            x.drawImage(img, 0, 0, cv.width, cv.height);
            if (r) {
                x.fillStyle = 'rgba(29,78,216,.18)'; x.fillRect(r.x, r.y, r.w, r.h);
                x.strokeStyle = '#1d4ed8'; x.lineWidth = 2; x.strokeRect(r.x, r.y, r.w, r.h);
            }
        }
        function pt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * cv.width / b.width, y: (e.clientY - b.top) * cv.height / b.height }; }
        paint();
        cv.addEventListener('pointerdown', function (e) { start = pt(e); r = { x: start.x, y: start.y, w: 0, h: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (z) {} e.preventDefault(); });
        cv.addEventListener('pointermove', function (e) {
            if (!start) return;
            var p = pt(e);
            r = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
            paint();
        });
        cv.addEventListener('pointerup', function () { start = null; });
        m.o.querySelector('#lgUse').addEventListener('click', function () {
            if (!r || r.w < 10 || r.h < 10) { alert('Drag a box around the logo first.'); return; }
            var out = document.createElement('canvas');
            out.width = Math.round(r.w / sc); out.height = Math.round(r.h / sc);
            out.getContext('2d').drawImage(img, r.x / sc, r.y / sc, r.w / sc, r.h / sc, 0, 0, out.width, out.height);
            m.close(); done(out);
        });
    }

    function openGenerator(init) {
        var st = { bg: init.mode === 'template', on: false, tpl: {}, mode: init.mode, img: init.img || null, pal: Object.assign({}, init.pal || DEF), logo: null, pos: {}, scale: 1, boxes: [], drag: null };
        var isTpl = st.mode === 'template';
        var today = new Date().toISOString().slice(0, 10);
        function clr(id, label, val) { return '<label style="font-size:13px">' + label + ' <input id="' + id + '" type="color" value="' + val + '" style="vertical-align:middle"></label>'; }

        var m = modal(
            '<div style="width:min(980px,100%);max-height:94vh;overflow:auto;background:#fff;color:#111827;border-radius:14px;padding:20px;font-family:inherit">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
            '<h3 style="margin:0;font-size:18px">Generate certificate \u00B7 ' + (isTpl ? 'New template (copied to system layout)' : 'System template') + '</h3>' +
            '<button type="button" data-cg-close style="border:0;background:transparent;font-size:20px;cursor:pointer">\u2715</button></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px">' +
            field('Title', '<input id="cgTitle" type="text" placeholder="Title of the document" style="' + inp() + '">') +
            field('Protocol No. (automatic)', '<input id="cgProto" type="text" readonly title="Numbered automatically" style="' + inp() + '">') +
            field('Date', '<input id="cgDate" type="date" value="' + today + '" style="' + inp() + '">') +
            field('Service', '<select id="cgRole" style="' + inp() + '"><option value="analyst">Data Analyst</option><option value="grammarian">Grammarian</option></select>') +
            field('Send to (paid users of this service)', '<select id="cgUser" style="' + inp() + '"><option value="">Loading...</option></select>') +
            field('Name', '<input id="cgName" type="text" placeholder="Name of the Data Analyst / Grammarian" style="' + inp() + '">') +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-bottom:10px;color:#334155">' +
            (isTpl ? '<img id="cgThumb" src="' + st.img.src + '" alt="Your template" title="Your template (reference)" style="height:56px;border:1px solid #cbd5e1;border-radius:6px">' : '') +
            clr('cgBg', 'Background', st.pal.bg) + clr('cgPrimary', 'Main', st.pal.primary) +
            clr('cgAccent', 'Accent', st.pal.accent) + clr('cgText', 'Text', st.pal.text) +
            (isTpl ? '<label style="font-size:13px"><input id="cgBgMode" type="checkbox" checked style="vertical-align:middle"> Copy design exactly</label><label style="font-size:13px"><input id="cgOcr" type="checkbox" checked disabled style="vertical-align:middle"> Copy text from template <span id="cgOcrStatus" style="color:#64748b"></span></label>' : '') + '<label style="font-size:13px">Text size <input id="cgScale" type="range" min="70" max="150" value="100" style="vertical-align:middle"></label>' +
            '<span style="font-size:12px;color:#64748b">Drag any text or the logo on the preview to move it.</span></div>' +
            '<canvas id="cgCanvas" style="width:100%;height:auto;border:1px solid #d1d5db;border-radius:8px;touch-action:none"></canvas>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap">' +
            (isTpl ? 
                
                '<button type="button" id="cgChange" style="' + btn('#e5e7eb', '#111827') + '">Change template</button>' : '') +
            
            
            '<button type="button" id="cgPrint" style="' + btn('#e5e7eb', '#111827') + '">Print / PDF</button>' +
            '<button type="button" id="cgSend" style="' + btn('#16a34a', '#fff') + '">Send to user</button>' +
            '</div>' +
            (isTpl ? '<input type="file" id="cgFile2" accept="image/png,image/jpeg,image/webp" hidden>' : '') +
            '</div>');
        var o = m.o, canvas = o.querySelector('#cgCanvas');
        function q(s) { return o.querySelector(s); }

        function data() {
            st.scale = (Number(q('#cgScale').value) || 100) / 100; if (!st.locked) q('#cgProto').value = protoPeek((q('#cgDate').value || today).slice(0, 4), q('#cgRole').value); if (isTpl) { var oc = q('#cgOcr'); st.on = false; var bm = q('#cgBgMode'); st.bg = !!(bm && bm.checked); }
            st.pal = { bg: q('#cgBg').value, primary: q('#cgPrimary').value, accent: q('#cgAccent').value, text: q('#cgText').value };
            return {
                title: q('#cgTitle').value.trim(), proto: q('#cgProto').value.trim(),
                date: q('#cgDate').value, role: q('#cgRole').value, name: q('#cgName').value.trim()
            };
        }
        function redraw() { draw(canvas, data(), st); }
        function issue() { if (st.locked) return; var yr = (q('#cgDate').value || today).slice(0, 4); st.locked = q('#cgProto').value; protoCommit(yr, q('#cgRole').value); }
        function setPal(p) { q('#cgBg').value = p.bg; q('#cgPrimary').value = p.primary; q('#cgAccent').value = p.accent; q('#cgText').value = p.text; }
        redraw();
        o.addEventListener('input', redraw); if (isTpl) runOcr(st, q, redraw);
        o.addEventListener('change', redraw);
        fetch((typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api') + '/services', { headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
            var a = Array.isArray(j) ? j : (j.services || j.data || j.items || j.results || []);
            var seen = {}, names = [];
            a.forEach(function (s) {
                var nm = s && (s.name || s.title);
                if (!nm || s.active === false || seen[nm]) return;
                seen[nm] = 1; names.push(String(nm));
            });
            if (!names.length) return;
            var sel = q('#cgRole');
            sel.innerHTML = '';
            names.forEach(function (nm) { var op = document.createElement('option'); op.value = nm; op.textContent = nm; sel.appendChild(op); });
            if (init && init.service) {
                var want = String(init.service).toLowerCase(), wc = svcCode(want);
                for (var si = 0; si < sel.options.length; si++) {
                    var ov = sel.options[si].value.toLowerCase();
                    if (ov === want || (wc && svcCode(ov) === wc)) { sel.value = sel.options[si].value; break; }
                }
            }
            redraw();
        }).catch(function (e) { console.warn('Services not loaded, using defaults:', e); });

        function pt(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
        function hit(p) {
            for (var i = st.boxes.length - 1; i >= 0; i--) {
                var b = st.boxes[i];
                if (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) return b;
            }
            return null;
        }
        canvas.addEventListener('pointerdown', function (e) {
            var p = pt(e), b = hit(p);
            if (!b) return;
            st.drag = { key: b.key, ox: p.x - b.ax, oy: p.y - b.ay };
            try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', function (e) {
            var p = pt(e);
            if (st.drag) {
                st.pos[st.drag.key] = { x: (p.x - st.drag.ox) / canvas.width, y: (p.y - st.drag.oy) / canvas.height };
                redraw();
            } else {
                canvas.style.cursor = hit(p) ? 'move' : 'default';
            }
        });
        function endDrag() { st.drag = null; }
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

        
        if (isTpl) {
            var f2 = q('#cgFile2');
            
            
            q('#cgChange').addEventListener('click', function () { f2.click(); });
            f2.addEventListener('change', function () {
                loadImage(f2.files[0], function (im) {
                    st.img = im; st.logo = null; st.pos = {};
                    q('#cgThumb').src = im.src;
                    setPal(analyze(im)); st.tpl = {}; runOcr(st, q, redraw); redraw();
                });
            });
        }

        document.createElement('button').addEventListener('click', function () { issue();
            var d = data();
            canvas.toBlob(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'certificate-' + (d.proto || 'template').replace(/[^\w.-]+/g, '_') + '.png';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            }, 'image/png');
        });
        var CG_BASE = (typeof API_BASE !== 'undefined' ? API_BASE : 'https://aideanc-production.up.railway.app/api');
        var cgPays = [];
        function cgHeaders() { return { 'Accept': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') }; }
        function cgFillUsers() {
            var sel = q('#cgUser'); if (!sel) return;
            var svc = String(q('#cgRole').value || '').trim().toLowerCase(), code = svcCode(svc), prev = sel.value;
            var list = cgPays.filter(function (p) {
                if (!p || !p.user_id || String(p.status || '').toLowerCase() !== 'paid') return false;
                var pn = String(p.service || '').trim().toLowerCase();
                return pn === svc || (code && svcCode(pn) === code);
            });
            sel.innerHTML = '';
            var first = document.createElement('option'); first.value = '';
            first.textContent = list.length ? 'Select a user...' : 'No paid users for this service';
            sel.appendChild(first);
            list.forEach(function (p) {
                var op = document.createElement('option'); op.value = String(p.id);
                op.textContent = (p.student || 'User') + ' \u00B7 ' + (p.ref || ('#' + p.id));
                sel.appendChild(op);
            });
            if (prev) sel.value = prev;
        }
        function cgPick() {
            var id = q('#cgUser').value;
            for (var i = 0; i < cgPays.length; i++) { if (String(cgPays[i].id) === id) return cgPays[i]; }
            return null;
        }
        fetch(CG_BASE + '/payments', { headers: cgHeaders() }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
            cgPays = Array.isArray(j) ? j : (j.data || j.payments || []);
            cgFillUsers();
        }).catch(function (e) { console.warn('Payments not loaded:', e); cgFillUsers(); });
        new MutationObserver(function () { cgFillUsers(); }).observe(q('#cgRole'), { childList: true });
        o.addEventListener('change', function (e) { if (e.target && e.target.id === 'cgRole') cgFillUsers(); });

        if (init && typeof init.onDone === 'function') {
            var cgU = q('#cgUser'); if (cgU && cgU.parentNode) cgU.parentNode.style.display = 'none';
            var cgUse = q('#cgSend'); cgUse.textContent = 'Use this certificate';
            cgUse.addEventListener('click', function (e) {
                e.stopImmediatePropagation();
                var dd = data();
                canvas.toBlob(function (blob) {
                    if (!blob) { alert('Could not render the certificate.'); return; }
                    issue();
                    var file = new File([blob], 'certificate-' + (dd.proto || 'template').replace(/[^\w.-]+/g, '_') + '.jpg', { type: 'image/jpeg' });
                    m.close(); init.onDone(file);
                }, 'image/jpeg', 0.9);
            });
        }
        q('#cgSend').addEventListener('click', function () {
            var p = cgPick();
            if (!p) { alert('Choose the user to send to first.'); return; }
            if (!confirm('Send this certificate to ' + (p.student || 'this user') + ' by email and to their account?')) return;
            var sb = q('#cgSend'), label = sb.textContent, d = data();
            sb.disabled = true; sb.textContent = 'Sending...';
            function done() { sb.disabled = false; sb.textContent = label; }
            canvas.toBlob(function (blob) {
                if (!blob) { alert('Could not render the certificate.'); done(); return; }
                var fd = new FormData();
                fd.append('type', 'certificate');
                fd.append('files[]', blob, 'certificate-' + (d.proto || 'template').replace(/[^\w.-]+/g, '_') + '.png');
                fetch(CG_BASE + '/payments/' + p.id + '/send-files', { method: 'POST', headers: cgHeaders(), body: fd }).then(function (r) {
                    return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw j; sb.dataset.mail = String(j && j.mail); return j; });
                }).then(function () {
                    issue(); st.locked = null; redraw();
                    alert(sb.dataset.mail === 'false' ? 'Certificate saved to ' + (p.student || 'the user') + '\u2019s account, but the email could not be sent.' : 'Certificate sent to ' + (p.student || 'the user') + '.');
                    done();
                }).catch(function (e) {
                    alert('Not sent: ' + ((e && (e.message || (e.errors && JSON.stringify(e.errors)))) || 'could not reach the server.'));
                    done();
                });
            }, 'image/png');
        });

        q('#cgPrint').addEventListener('click', function () { issue();
            var w = window.open('', '_blank');
            if (!w) { alert('Allow pop-ups to print, or use Download PNG.'); return; }
            w.document.write('<html><head><title>Certificate</title><style>@page{size:landscape;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="' + canvas.toDataURL('image/png') + '"></body></html>');
            w.document.close();
            w.onload = function () { w.focus(); w.print(); };
        });
    }

    window.AideaCertGen = { open: function (opts) { cgExtra = opts || {}; openChooser(); } };
    var tabs = document.getElementById('certTabs');
    if (false && tabs) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '+ Generate certificate';
        b.style.cssText = 'margin-left:12px;margin-bottom:14px;padding:10px 16px;border:0;border-radius:999px;background:#2f6bff;color:#fff;font:inherit;font-weight:600;cursor:pointer;vertical-align:top';
        b.addEventListener('click', function () { cgExtra = {}; openChooser(); });
        tabs.insertAdjacentElement('afterend', b);
    }
})();
