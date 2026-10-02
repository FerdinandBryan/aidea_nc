// reviewer_split_view.js - Thesis Review: View opens a split screen.
// Left: the original paper as page images. Right: a blank page beside every page.
(function () {
  'use strict';
  var LIBS = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    zip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    docx: 'https://cdnjs.cloudflare.com/ajax/libs/docx-preview/0.3.2/docx-preview.min.js'
  };
  var loading = {};
  var notesKey = 'svNotes';

  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { fail(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  function injectCss() {
    if (document.getElementById('svCss')) return;
    var st = document.createElement('style');
    st.id = 'svCss';
    st.textContent =
      '#svOv{position:fixed;top:0;right:0;bottom:0;left:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:2vh 2vw}' +
      '.sv-win{width:min(1280px,100%);height:100%;background:#e5e7eb;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;color:#111827}' +
      '.sv-head{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #d1d5db}' +
      '.sv-title{flex:1;min-width:0;font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.sv-stat{font-size:12px;color:#6b7280;white-space:nowrap}' +
      '.sv-btn{font-size:13px;padding:6px 12px;border:1px solid #9ca3af;border-radius:8px;background:#fff;color:#111827;cursor:pointer;text-decoration:none;white-space:nowrap}' +
      '.sv-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:8px 16px 0;font-size:12px;font-weight:500;color:#4b5563}' +
      '.sv-scroll{flex:1;overflow:auto;padding:8px 16px 16px}' +
      '.sv-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-bottom:16px;align-items:start}' +
      '.sv-pg,.sv-blank{box-sizing:border-box;background:#fff;min-width:0}' +
      '.sv-pg{border:1px solid #cbd5e1;position:relative}' +
      '.sv-pg canvas{display:block;width:100%;height:auto}' +
      '.sv-pg{user-select:text;-webkit-user-select:text}' +
      '.sv-text{position:absolute;left:0;top:0;overflow:hidden;line-height:1;user-select:text;-webkit-user-select:text}' +
      '.sv-text span,.sv-text br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}' +
      '.sv-text ::selection{background:rgba(59,130,246,.35)}' +
      '.sv-blank{border:1px solid #cbd5e1;display:block;padding:7%;overflow:auto;text-align:left;white-space:pre-wrap;word-wrap:break-word;color:#111827;font:14px/1.7 Georgia,serif;cursor:text}' +
      '.sv-blank:empty::before{content:attr(data-ph);color:#9ca3af}' +
      '.sv-blank:focus{outline:2px solid #3b82f6;outline-offset:-1px}' +
      '.sv-msg{padding:24px;text-align:center;color:#4b5563;font-size:14px}';
    document.head.appendChild(st);
  }

  function cellWidth(scroll) {
    return Math.max(120, (scroll.clientWidth - 32 - 16) / 2);
  }

  function makeRow(scroll, num, ratio) {
    var row = document.createElement('div');
    row.className = 'sv-row';
    var left = document.createElement('div');
    left.className = 'sv-pg';
    var right = document.createElement('div');
    right.className = 'sv-blank';
    right.setAttribute('contenteditable', 'true');
    right.setAttribute('spellcheck', 'true');
    right.setAttribute('role', 'textbox');
    right.setAttribute('aria-multiline', 'true');
    right.setAttribute('aria-label', 'Your page ' + num);
    right.setAttribute('data-ph', 'Type here (page ' + num + ')');
    right.style.aspectRatio = String(ratio);
    var skey = notesKey + ':' + num;
    try { var saved = localStorage.getItem(skey); var savedH = localStorage.getItem(skey + ':h'); if (savedH) { right.innerHTML = savedH; } else if (saved) { right.textContent = saved; } } catch (e) { }
    right.addEventListener('input', function () {
      try {
        var v = right.innerText.replace(/\n$/, '');
        if (v) { localStorage.setItem(skey, v); localStorage.setItem(skey + ':h', right.innerHTML); } else { localStorage.removeItem(skey); localStorage.removeItem(skey + ':h'); }
      } catch (e) { }
    });
    right.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text');
      var h = (e.clipboardData || window.clipboardData).getData('text/html'); var clean = h ? svCleanHtml(h) : ''; if (clean) { document.execCommand('insertHTML', false, clean); } else { document.execCommand('insertText', false, t); }
    });
    row.appendChild(left);
    row.appendChild(right);
    scroll.appendChild(row);
    return { left: left, right: right };
  }

    function svEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function svFontInfo(f) {
    var raw = String((f && f.name) || '').replace(/^[A-Z]{6}\+/, '');
    var base = raw.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, '');
    var fam = base.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    var generic = /courier|mono|consolas/i.test(raw) ? 'monospace' : ((/times|georgia|garamond|cambria|palatino|book|minion|serif/i.test(raw) && !/sans/i.test(raw)) ? 'serif' : 'sans-serif');
    if (!fam) fam = generic === 'serif' ? 'Times New Roman' : (generic === 'monospace' ? 'Courier New' : 'Arial');
    return {
      family: "'" + fam + "', " + generic,
      bold: !!(f && f.bold) || /bold|black|heavy/i.test(raw),
      italic: !!(f && f.italic) || /italic|oblique/i.test(raw)
    };
  }

  function svFontsFor(page, tl) {
    var wait = (tl._tlp && tl._tlp.promise) ? tl._tlp.promise : Promise.resolve();
    return wait.catch(function () { }).then(function () {
      return page.getTextContent();
    }).then(function (tc) {
      var items = tc.items.filter(function (it) { return typeof it.str === 'string' && it.str !== ''; });
      var spans = Array.prototype.filter.call(tl.querySelectorAll('span'), function (s) { return !s.querySelector('span') && s.textContent !== ''; });
      if (items.length !== spans.length) return;
      items.forEach(function (it, i) {
        var f = null;
        try { if (page.commonObjs.has(it.fontName)) f = page.commonObjs.get(it.fontName); } catch (e) { }
        if (f) spans[i]._svf = svFontInfo(f);
      });
    }).catch(function () { });
  }

  function svTextLayerHtml(tl, rg) {
    var spans = Array.prototype.filter.call(tl.querySelectorAll('span'), function (s) { return !s.querySelector('span') && s.textContent !== ''; });
    var out = '', lastTop = null, lastH = 0, lastRight = 0, lastText = '';
    spans.forEach(function (s) {
      var txt = s.textContent;
      if (rg) {
        if (!rg.intersectsNode(s)) return;
        var tn = s.firstChild, a = 0, b = txt.length;
        if (tn && tn.nodeType === 3) {
          if (rg.startContainer === tn) a = rg.startOffset;
          if (rg.endContainer === tn) b = rg.endOffset;
        }
        txt = txt.slice(a, b);
      }
      if (!txt) return;
      var cs = getComputedStyle(s), r = s.getBoundingClientRect();
      var fs = parseFloat(cs.fontSize) || 14;
      if (lastTop !== null) {
        var d = r.top - lastTop;
        if (Math.abs(d) > lastH * 0.5) { out += '<br>'; if (d > lastH * 2.5) out += '<br>'; }
        else if (r.left - lastRight > fs * 0.15 && !/\s$/.test(lastText) && !/^\s/.test(txt)) out += ' ';
      }
      var fam, bold = false, italic = false, fi = s._svf;
      if (fi) { fam = fi.family; bold = fi.bold; italic = fi.italic; }
      else {
        var ff = cs.fontFamily;
        fam = /monospace/.test(ff) ? "'Courier New', monospace" : (/sans-serif/.test(ff) ? 'Arial, sans-serif' : (/serif/.test(ff) ? "'Times New Roman', serif" : 'Arial, sans-serif'));
      }
      var st = 'font-family:' + fam + ';font-size:' + fs.toFixed(2) + 'px' + (bold ? ';font-weight:bold' : '') + (italic ? ';font-style:italic' : '');
      out += '<span style="' + st + '">' + svEsc(txt) + '</span>';
      lastTop = r.top; lastH = r.height || fs; lastRight = r.right; lastText = txt;
    });
    return out;
  }

  function svStyle(cs, k) {
    var fs = (parseFloat(cs.fontSize) || 14) * (k || 1);
    var s = 'font-family:' + String(cs.fontFamily).replace(/"/g, "'") + ';font-size:' + fs.toFixed(2) + 'px';
    var w = cs.fontWeight;
    if (w === 'bold' || parseInt(w, 10) >= 600) s += ';font-weight:bold';
    if (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') s += ';font-style:italic';
    if (/underline/.test(cs.textDecorationLine || cs.textDecoration || '')) s += ';text-decoration:underline';
    return s;
  }

  function svDomHtml(root, k) {
    function walk(n) {
      if (n.nodeType === 3) {
        var p = n.parentElement, t = n.nodeValue;
        if (!p || !t) return '';
        return '<span style="' + svStyle(getComputedStyle(p), k) + '">' + svEsc(t) + '</span>';
      }
      if (n.nodeType !== 1) return '';
      var tag = n.tagName.toLowerCase();
      if (/^(style|script|svg|img|canvas)$/.test(tag)) return '';
      if (tag === 'br') return '<br>';
      var inner = '';
      Array.prototype.forEach.call(n.childNodes, function (c) { inner += walk(c); });
      if (/^(td|th)$/.test(tag)) return inner + ' ';
      if (/^(p|div|li|h[1-6]|tr|section|article|header|footer)$/.test(tag)) {
        if (!inner) return /^(p|li|h[1-6])$/.test(tag) ? '<div><br></div>' : '';
        var ta = getComputedStyle(n).textAlign;
        if (ta === 'end') ta = 'right'; var stl = ''; if (/^(center|right|justify)$/.test(ta)) stl += 'text-align:' + ta + ';'; if (tag !== 'section') { var cs2 = getComputedStyle(n), ind = (parseFloat(cs2.paddingLeft) || 0) + (parseFloat(cs2.marginLeft) || 0), ti = parseFloat(cs2.textIndent) || 0; if (ind > 0.5) stl += 'padding-left:' + (ind * (k || 1)).toFixed(1) + 'px;'; if (Math.abs(ti) > 0.5) stl += 'text-indent:' + (ti * (k || 1)).toFixed(1) + 'px;'; } var st = stl ? ' style="' + stl + '"' : '';
        return '<div' + st + '>' + inner + '</div>';
      }
      return inner;
    }
    return walk(root);
  }

  function svAllHtml(scroll) {
    var parts = [];
    Array.prototype.forEach.call(scroll.querySelectorAll('.sv-pg'), function (p) {
      var t = p.querySelector('.sv-text'), h = '';
      if (t) h = svLinesHtml(t, null);
      else { var sec = p.querySelector('section') || p; h = svDomHtml(sec, sec._svk || 1); }
      if (h) parts.push(h);
    });
    return parts.join('<br><br>');
  }

  function svCleanHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.body || !doc.body.textContent.trim()) return '';
    function walk(n) {
      if (n.nodeType === 3) return svEsc(n.nodeValue);
      if (n.nodeType !== 1) return '';
      var tag = n.tagName.toLowerCase();
      if (/^(script|style|head|meta|link|title|svg|img|iframe|object|canvas)$/.test(tag)) return '';
      if (tag === 'br') return '<br>';
      var inner = '';
      Array.prototype.forEach.call(n.childNodes, function (c) { inner += walk(c); });
      if (/^(td|th)$/.test(tag)) return inner + ' ';
      var s = n.style || {}, st = '';
      if (s.fontFamily) st += 'font-family:' + String(s.fontFamily).replace(/"/g, "'") + ';';
      if (s.fontSize) st += 'font-size:' + s.fontSize + ';';
      var fw = s.fontWeight || '';
      if ((/^(b|strong)$/.test(tag) && !/^(normal|400)$/.test(fw)) || /^(bold|[6-9]00)$/.test(fw)) st += 'font-weight:bold;';
      if ((/^(i|em)$/.test(tag) || /^(italic|oblique)$/.test(s.fontStyle || '')) && s.fontStyle !== 'normal') st += 'font-style:italic;';
      if (tag === 'u' || /underline/.test(s.textDecoration || s.textDecorationLine || '')) st += 'text-decoration:underline;';
      if (/^(p|div|li|h[1-6]|tr|ul|ol|table|tbody|section|article)$/.test(tag)) {
        if (/^(center|right|justify)$/.test(s.textAlign || '')) st += 'text-align:' + s.textAlign + ';'; if (s.textAlignLast === 'justify') st += 'text-align-last:justify;'; if (/^[\d.]+px$/.test(s.paddingLeft || '')) st += 'padding-left:' + s.paddingLeft + ';'; if (/^-?[\d.]+px$/.test(s.textIndent || '')) st += 'text-indent:' + s.textIndent + ';';
        return '<div' + (st ? ' style="' + st + '"' : '') + '>' + (inner || '<br>') + '</div>';
      }
      return st ? '<span style="' + st + '">' + inner + '</span>' : inner;
    }
    return walk(doc.body).trim();
  }

  function svSpanStyleOf(s) {
    var cs = getComputedStyle(s), fs = parseFloat(cs.fontSize) || 14, fam, bold = false, italic = false, fi = s._svf;
    if (fi) { fam = fi.family; bold = fi.bold; italic = fi.italic; }
    else {
      var ff = cs.fontFamily;
      fam = /monospace/.test(ff) ? "'Courier New', monospace" : (/sans-serif/.test(ff) ? 'Arial, sans-serif' : (/serif/.test(ff) ? "'Times New Roman', serif" : 'Arial, sans-serif'));
    }
    return { fs: fs, st: 'font-family:' + fam + ';font-size:' + fs.toFixed(2) + 'px' + (bold ? ';font-weight:bold' : '') + (italic ? ';font-style:italic' : '') };
  }

  function svMode(vals, minCount, preferMax) {
    var m = {}, best = null, bc = 0;
    vals.forEach(function (v) { var key = Math.round(v / 3); m[key] = (m[key] || 0) + 1; });
    Object.keys(m).forEach(function (key) {
      var kk = +key;
      if (m[key] > bc || (m[key] === bc && (preferMax ? kk > best : kk < best))) { bc = m[key]; best = kk; }
    });
    return bc >= minCount ? best * 3 : null;
  }

  function svLinesHtml(tl, rg) {
    var spans = Array.prototype.filter.call(tl.querySelectorAll('span'), function (s) { return !s.querySelector('span') && s.textContent !== ''; });
    if (!spans.length) return '';
    var box = tl.getBoundingClientRect(), bw = box.width || 1, lines = [];
    spans.forEach(function (s) {
      var r = s.getBoundingClientRect();
      var o = { s: s, top: r.top, left: r.left - box.left, right: r.right - box.left, h: r.height || 10 };
      var ln = lines.length ? lines[lines.length - 1] : null;
      if (ln && Math.abs(o.top - ln.top) <= Math.max(ln.h, o.h) * 0.5) {
        ln.items.push(o); ln.left = Math.min(ln.left, o.left); ln.right = Math.max(ln.right, o.right); ln.h = Math.max(ln.h, o.h);
      } else { lines.push({ items: [o], top: o.top, h: o.h, left: o.left, right: o.right }); }
    });
    var leftM = svMode(lines.map(function (l) { return l.left; }), 3, false);
    if (leftM === null) leftM = Math.min.apply(null, lines.map(function (l) { return l.left; }));
    var tol = Math.max(3, bw * 0.008);
    var near = lines.filter(function (l) { return Math.abs(l.left - leftM) < tol * 2; });
    var rightM = svMode(near.map(function (l) { return l.right; }), Math.max(3, Math.ceil(near.length * 0.3)), true);
    var justOK = rightM !== null;
    if (rightM === null) rightM = Math.max.apply(null, lines.map(function (l) { return l.right; }));
    var bodyW = Math.max(rightM - leftM, 1);
    var mid = (leftM + rightM) / 2, cx = Math.abs(mid - bw / 2) < bw * 0.03 ? bw / 2 : mid;
    var out = '', prev = null;
    lines.forEach(function (l) {
      var html = '', lastRight = null, lastText = '', partial = false, fsz = 14;
      l.items.forEach(function (o) {
        var txt = o.s.textContent;
        if (rg) {
          if (!rg.intersectsNode(o.s)) { partial = true; return; }
          var tn = o.s.firstChild, a = 0, b = txt.length;
          if (tn && tn.nodeType === 3) {
            if (rg.startContainer === tn) a = rg.startOffset;
            if (rg.endContainer === tn) b = rg.endOffset;
          }
          if (a > 0 || b < txt.length) partial = true;
          txt = txt.slice(a, b);
        }
        if (!txt) return;
        var f = svSpanStyleOf(o.s); fsz = f.fs;
        if (lastRight !== null && o.left - lastRight > f.fs * 0.15 && !/\s$/.test(lastText) && !/^\s/.test(txt)) html += ' ';
        html += '<span style="' + f.st + '">' + svEsc(txt) + '</span>';
        lastRight = o.right; lastText = txt;
      });
      if (!html) return;
      var al = 'left', ind = 0, L = l.left, R = l.right;
      if (!partial) {
        if (Math.abs(L - leftM) < tol) { if (justOK && Math.abs(R - rightM) < tol && R - L > bodyW * 0.85) al = 'justify'; }
        else if (Math.abs((L + R) / 2 - cx) < tol * 1.5 && L - leftM > tol * 2) al = 'center';
        else if (Math.abs(R - rightM) < tol && L - leftM > bodyW * 0.15) al = 'right';
        else if (L - leftM > fsz * 0.5) ind = L - leftM;
      }
      var stl = '';
      if (al === 'center') stl = 'text-align:center;';
      else if (al === 'right') stl = 'text-align:right;';
      else if (al === 'justify') stl = 'text-align:justify;text-align-last:justify;';
      else if (ind > 0) stl = 'padding-left:' + ind.toFixed(1) + 'px;';
      if (prev && l.top - prev.top > prev.h * 2.5) out += '<div><br></div>';
      out += '<div' + (stl ? ' style="' + stl + '"' : '') + '>' + html + '</div>';
      prev = l;
    });
    return out;
  }

  function renderPdf(buf, scroll, stat) {
    return loadScript(LIBS.pdf).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.worker;
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (doc) {
      var n = doc.numPages, i = 1;
      function next() {
        if (i > n) { stat.textContent = n + (n === 1 ? ' page' : ' pages'); return; }
        var num = i++;
        stat.textContent = 'Page ' + num + ' of ' + n;
        return doc.getPage(num).then(function (page) {
          var base = page.getViewport({ scale: 1 });
          var scale = (cellWidth(scroll) / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          var vp = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          var row = makeRow(scroll, num, base.width / base.height);
          row.left.appendChild(canvas);
          var tl = document.createElement('div');
          tl.className = 'sv-text';
          var cssVp = page.getViewport({ scale: cellWidth(scroll) / base.width });
          tl.style.width = Math.floor(cssVp.width) + 'px';
          tl.style.height = Math.floor(cssVp.height) + 'px';
          tl.style.setProperty('--scale-factor', String(cssVp.scale));
          row.left.appendChild(tl);
          try {
            if (window.pdfjsLib.renderTextLayer) {
              tl._tlp = window.pdfjsLib.renderTextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: cssVp, textDivs: [] });
            }
          } catch (e) { }
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(function () { svFontsFor(page, tl); });
        }).then(next);
      }
      return next();
    });
  }

  function renderDocx(buf, scroll, stat, ov) {
    return loadScript(LIBS.zip).then(function () {
      return loadScript(LIBS.docx);
    }).then(function () {
      var host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
      ov.appendChild(host);
      return window.docx.renderAsync(buf, host, null, { className: 'docx', inWrapper: false, breakPages: true }).then(function () {
        var secs = host.querySelectorAll('section.docx');
        if (!secs.length) throw new Error('No pages found in this document.');
        var colW = cellWidth(scroll);
        Array.prototype.forEach.call(secs, function (sec, idx) {
          var w = sec.offsetWidth, h = sec.offsetHeight, k = colW / w;
          var row = makeRow(scroll, idx + 1, w / h);
          row.left.style.height = (h * k) + 'px';
          row.left.style.overflow = 'hidden';
          row.right.style.aspectRatio = '';
          row.right.style.height = (h * k) + 'px';
          sec.style.transformOrigin = 'top left';
          sec.style.transform = 'scale(' + k + ')'; sec._svk = k;
          sec.style.margin = '0';
          row.left.appendChild(sec);
        });
        stat.textContent = secs.length + (secs.length === 1 ? ' page' : ' pages');
      });
    });
  }

  function openViewer(url, title, src) {
    injectCss();
    notesKey = src ? ('svNotes:' + src.id + ':' + src.n) : ('svNotes:' + url);
    var ov = document.createElement('div');
    ov.id = 'svOv';
    ov.innerHTML =
      '<div class="sv-win" role="dialog" aria-modal="true" aria-label="Paper viewer">' +
      '<div class="sv-head"><div class="sv-title"></div><span class="sv-stat">Loading</span>' +
      
      '<a class="sv-btn sv-open" target="_blank" rel="noopener">Open in new tab</a>' +
      '<button type="button" class="sv-btn sv-close">Close</button></div>' +
      '<div class="sv-cols"><div>Original paper</div><div>Your page (type here)</div></div>' +
      '<div class="sv-scroll"></div></div>';
    document.body.appendChild(ov);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    var scroll = ov.querySelector('.sv-scroll');
    var stat = ov.querySelector('.sv-stat');
    ov.querySelector('.sv-title').textContent = title || 'Thesis paper';
    ov.querySelector('.sv-open').href = url;

    function close() {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    function onKey(e) { if (e.key === 'Escape' && !(document.activeElement && document.activeElement.isContentEditable)) close(); }
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.sv-close').addEventListener('click', close);
    var copyBtn = ov.querySelector('.sv-copy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var parts = [];
      Array.prototype.forEach.call(scroll.querySelectorAll('.sv-pg'), function (p) {
        var t = p.querySelector('.sv-text');
        var s = (t ? t.innerText || t.textContent : p.innerText) || '';
        s = s.replace(/[ \t]+\n/g, '\n').trim();
        if (s) parts.push(s);
      });
      var all = parts.join('\n\n');
      function done(msg) { copyBtn.textContent = msg; setTimeout(function () { copyBtn.textContent = 'Copy all text'; }, 1800); }
      if (!all) { done('No text found'); return; }
      var rich = svAllHtml(scroll); if (rich && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) { navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([all], { type: 'text/plain' }), 'text/html': new Blob([rich], { type: 'text/html' }) })]).then(function () { done('Copied'); }, function () { navigator.clipboard.writeText(all).then(function () { done('Copied'); }, function () { done('Copy failed'); }); }); } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(all).then(function () { done('Copied'); }, function () { done('Copy failed'); });
      } else { done('Copy failed'); }
    });
    ov.addEventListener('copy', function (e) {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      var rg = sel.getRangeAt(0);
      var tls = Array.prototype.filter.call(ov.querySelectorAll('.sv-text'), function (t) { return rg.intersectsNode(t); });
      if (!tls.length) return;
      var html = tls.map(function (t) { return svLinesHtml(t, rg); }).join('<br><br>');
      if (!html) return;
      e.clipboardData.setData('text/html', html);
      e.clipboardData.setData('text/plain', sel.toString());
      e.preventDefault();
    });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    function fail(err) {
      stat.textContent = '';
      scroll.innerHTML = '';
      var m = document.createElement('div');
      m.className = 'sv-msg';
      m.textContent = "Couldn't load this paper here. Use Open in new tab instead.";
      scroll.appendChild(m);
      if (window.console) console.error('Split viewer:', err);
    }

    var base = (typeof ADMIN_API !== 'undefined') ? ADMIN_API : 'https://aideanc-production.up.railway.app/api';
    var token = '';
    try { token = localStorage.getItem('auth_token') || ''; } catch (e) { }
    var target = src ? base + '/reviewer/assignments/' + src.id + '/file/' + src.n : url;
    fetch(target, src ? { headers: { 'Authorization': 'Bearer ' + token } } : {}).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.arrayBuffer();
    }).then(function (buf) {
      var b = new Uint8Array(buf.slice(0, 4));
      if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return renderPdf(buf, scroll, stat);
      if (b[0] === 0x50 && b[1] === 0x4B) return renderDocx(buf, scroll, stat, ov);
      throw new Error('Unsupported file type');
    }).catch(fail);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    var card = a.closest('.review-card');
    if (!card) return;
    var label = (a.textContent || '').trim();
    if (!/^(view|original)/i.test(label)) return;
    e.preventDefault();
    e.stopPropagation();
    var t = card.querySelector('.review-card-title');
    var id = card.getAttribute('data-id');
    var hrefs = [];
    Array.prototype.forEach.call(card.querySelectorAll('a[href]'), function (x) {
      if (x.hasAttribute('download')) return;
      if (!/^(view|original)/i.test((x.textContent || '').trim())) return;
      if (hrefs.indexOf(x.href) < 0) hrefs.push(x.href);
    });
    var n = Math.max(0, hrefs.indexOf(a.href));
    openViewer(a.href, t ? t.textContent.trim() : '', id ? { id: id, n: n } : null);
  }, true);
})();