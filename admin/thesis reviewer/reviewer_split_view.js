// reviewer_split_view.js - Thesis Review: View opens a split screen.
// Left: the original paper as page images. Right: a blank page beside every page.
(function () {
  'use strict';
  var LIBS = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    zip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    docx: 'https://cdnjs.cloudflare.com/ajax/libs/docx-preview/0.3.2/docx-preview.min.js',
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
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
      '.sv-msg{padding:24px;text-align:center;color:#4b5563;font-size:14px}' +
      '.sv-doconly .sv-blank,.sv-doconly .sv-tb,.sv-doconly .sv-save,.sv-doconly .sv-cols>div:nth-child(2){display:none!important}' +
      '.sv-doconly .sv-cols{display:block!important;text-align:center}' +
      '.sv-doconly .sv-row{display:block!important}' +
      '.sv-doconly .sv-pg{margin-left:auto;margin-right:auto}' +
      '.sv-doconly .sv-scroll{display:flex!important;flex-direction:column;align-items:center}' +
      '.sv-doconly .sv-row{display:flex!important;justify-content:center;width:100%}' +
      '.sv-doconly .sv-pg{flex:0 0 auto;margin:0 auto!important}' +
      '.sv-doconly .sv-pg canvas{display:block;margin:0 auto}';
    document.head.appendChild(st);
  }

  function cellWidth(scroll) {
    var ovx = scroll.closest ? scroll.closest('#svOv') : null; if (ovx && ovx.classList.contains('sv-doconly')) return Math.min(900, Math.max(120, scroll.clientWidth - 32)); return Math.max(120, (scroll.clientWidth - 32 - 16) / 2);
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
        var v = svBodyText(right).replace(/\n$/, '');
        if (v) { localStorage.setItem(skey, v); localStorage.setItem(skey + ':h', svBodyHtml(right)); } else { localStorage.removeItem(skey); localStorage.removeItem(skey + ':h'); }
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

  function svBodyHtml(right) {
    var c = right.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.sv-hf'), function (x) { x.parentNode.removeChild(x); });
    return c.innerHTML;
  }

  function svBodyText(right) {
    var hs = right.querySelectorAll('.sv-hf'), i;
    for (i = 0; i < hs.length; i++) hs[i].style.display = 'none';
    var t = right.innerText;
    for (i = 0; i < hs.length; i++) hs[i].style.display = '';
    return t;
  }

  function svHfPrep(right) {
    if (getComputedStyle(right).position === 'static') right.style.position = 'relative'; var hasBody = false; Array.prototype.forEach.call(right.childNodes, function (n) { if (!(n.nodeType === 1 && n.classList.contains('sv-hf'))) hasBody = true; }); if (!hasBody) { var anchor = document.createElement('div'); anchor.innerHTML = '<br>'; right.insertBefore(anchor, right.firstChild); }
  }

  function svHfPdf(tl, right) {
    try {
      var box = tl.getBoundingClientRect(), H = box.height;
      if (!H || right.querySelector('.sv-hf')) return;
      svHfPrep(right);
      Array.prototype.forEach.call(tl.querySelectorAll('span'), function (s) {
        if (s.querySelector('span') || !s.textContent.trim()) return;
        var r = s.getBoundingClientRect(), bt = r.top - box.top, bb = r.bottom - box.top;
        if (!(bb < H * 0.085 || bt > H * 0.915)) return;
        var f = svSpanStyleOf(s), d = document.createElement('div');
        d.className = 'sv-hf';
        d.setAttribute('contenteditable', 'false');
        d.style.cssText = 'position:absolute;left:' + (r.left - box.left).toFixed(1) + 'px;top:' + bt.toFixed(1) + 'px;white-space:pre;line-height:1;transform-origin:0 0;color:#111827;pointer-events:none;user-select:none;-webkit-user-select:none;' + f.st + (s.style.transform ? ';transform:' + s.style.transform : '');
        d.textContent = s.textContent;
        right.appendChild(d);
      });
    } catch (e) { }
  }

  function svHfDocx(sec, left, right, k) {
    try {
      var els = sec.querySelectorAll('header, footer');
      if (!els.length) return;
      svHfPrep(right);
      var cb = left.getBoundingClientRect();
      Array.prototype.forEach.call(els, function (el) {
        if (!el.textContent.trim()) return;
        var r = el.getBoundingClientRect(), d = document.createElement('div'), c = el.cloneNode(true);
        c.style.margin = '0'; c.style.position = 'static';
        d.className = 'sv-hf docx';
        d.setAttribute('contenteditable', 'false');
        d.style.cssText = 'position:absolute;left:' + (r.left - cb.left).toFixed(1) + 'px;top:' + (r.top - cb.top).toFixed(1) + 'px;width:' + el.offsetWidth + 'px;transform:scale(' + k + ');transform-origin:0 0;pointer-events:none;user-select:none;-webkit-user-select:none;color:#000';
        d.appendChild(c);
        right.appendChild(d);
      });
    } catch (e) { }
  }

  function svHfPdf(tl, right) {
    try {
      var cv = tl.parentNode && tl.parentNode.querySelector('canvas');
      if (!cv || right.querySelector('.sv-hf')) return;
      svHfPrep(right);
      var W = cv.width, H = cv.height, z = Math.round(H * 0.12);
      [0, H - z].forEach(function (y, idx) {
        var t = document.createElement('canvas');
        t.width = W; t.height = z;
        var c = t.getContext('2d');
        c.fillStyle = '#fff'; c.fillRect(0, 0, W, z);
        c.drawImage(cv, 0, y, W, z, 0, 0, W, z);
        var d = c.getImageData(0, 0, W, z).data, any = false;
        for (var i = 0; i < d.length; i += 16) { if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) { any = true; break; } }
        if (!any) return;
        var im = document.createElement('img');
        im.className = 'sv-hf';
        im.setAttribute('contenteditable', 'false');
        im.src = t.toDataURL('image/jpeg', 0.92);
        im.style.cssText = 'position:absolute;left:0;width:100%;height:auto;' + (idx === 0 ? 'top:0;' : 'bottom:0;') + 'pointer-events:none;user-select:none;-webkit-user-select:none;';
        right.appendChild(im); var ihpx = Math.round(right.clientWidth * z / W) + 6; if (idx === 0) right.style.paddingTop = ihpx + 'px'; else right.style.paddingBottom = ihpx + 'px';
      });
    } catch (e) { }
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
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(function () { svFontsFor(page, tl).then(function () { svHfPdf(tl, row.right); }); });
        }).then(next);
      }
      return next();
    });
  }

  function renderDocx(buf, scroll, stat, ov) {
    return loadScript(LIBS.zip).then(function () {
      return loadScript(LIBS.docx).catch(function () { return loadScript('https://cdn.jsdelivr.net/npm/docx-preview@0.3.2/dist/docx-preview.min.js'); }).catch(function () { return loadScript('https://unpkg.com/docx-preview@0.3.2/dist/docx-preview.min.js'); });
    }).then(function () {
      var host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
      ov.appendChild(host);
      return window.docx.renderAsync(buf, host, null, { className: 'docx', inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false }).then(function () {
        var secs = host.querySelectorAll('section.docx');
        if (!secs.length) throw new Error('No pages found in this document.');
        var colW = cellWidth(scroll);
        Array.prototype.forEach.call(secs, function (sec, idx) {
          var w = sec.offsetWidth, h = sec.offsetHeight, k = colW / w;
          var row = makeRow(scroll, idx + 1, w / h);
          row.left.style.height = (h * k) + 'px'; row.left.style.width = colW + 'px'; /* SV-CUTFIX */
          row.left.style.overflow = 'hidden';
          row.right.style.aspectRatio = '';
          row.right.style.height = (h * k) + 'px';
          sec.style.transformOrigin = 'top left';
          sec.style.transform = 'scale(' + k + ')'; sec._svk = k;
          sec.style.margin = '0';
          row.left.appendChild(sec); svHfDocx(sec, row.left, row.right, k); if (!ov.classList.contains('sv-doconly')) { sec.setAttribute('contenteditable', 'true'); sec.setAttribute('spellcheck', 'true'); sec.style.outline = 'none'; sec.addEventListener('input', function () { sec._svEdited = true; }); } /* SV-DIRECT */
        });
        stat.textContent = secs.length + (secs.length === 1 ? ' page' : ' pages');
      });
    });
  }

  function svEditPages(scroll, ov) {
    var pages = [], css = '';
    Array.prototype.forEach.call(ov.querySelectorAll('style'), function (s) { css += s.textContent + '\n'; });
    Array.prototype.forEach.call(scroll.querySelectorAll('.sv-pg'), function (p) {
      var tl = p.querySelector('.sv-text'), cv = p.querySelector('canvas');
      if (tl && cv) {
        var c = tl.cloneNode(true);
        Array.prototype.forEach.call(c.querySelectorAll('span'), function (s) {
          if (s.querySelector('span')) return;
          s.setAttribute('contenteditable', 'true');
          s.setAttribute('spellcheck', 'false');
        });
        var img = '';
        try { img = cv.toDataURL('image/jpeg', 0.92); } catch (e) { }
        pages.push('<div class="pp" style="width:' + tl.style.width + ';height:' + tl.style.height + '"><img src="' + img + '"><div class="tl" style="' + (c.getAttribute('style') || '') + '">' + c.innerHTML + '</div></div>');
      } else if (p.querySelector('section')) {
        pages.push('<div class="dp" contenteditable="true" spellcheck="true" style="width:' + p.offsetWidth + 'px;height:' + p.offsetHeight + 'px">' + p.innerHTML + '</div>');
      }
    });
    return { pages: pages, css: css };
  }

  function svEditorDoc2(res, title) {
    var css = 'body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif}' +
      '.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;padding:8px 16px;background:#fff;border-bottom:1px solid #d1d5db}' +
      '.bar b{flex:1;min-width:0;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.bar button{font-size:13px;padding:6px 12px;border:1px solid #9ca3af;border-radius:8px;background:#fff;color:#111827;cursor:pointer}' +
      '.pp,.dp{position:relative;margin:16px auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);overflow:hidden}' +
      '.pp img{width:100%;height:100%;display:block}' +
      '.tl{position:absolute;left:0;top:0;overflow:hidden;line-height:1}' +
      '.tl span{position:absolute;white-space:pre;transform-origin:0% 0%;color:#000;background:#fff;box-shadow:0 0 0 1px #fff;cursor:text;outline:none}' +
      '.tl span:focus{box-shadow:0 0 0 1px #fff,0 0 0 2px #3b82f6}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '@page{margin:0}@media print{body{background:#fff}.bar{display:none}.pp,.dp{margin:0;box-shadow:none;page-break-after:always}}';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + svEsc((title || 'Paper') + ' (editable)') + '</title><style>' + css + '</style><style>' + res.css + '</style></head><body>' +
      '<div class="bar"><b>' + svEsc(title || 'Paper') + ' - click any text to edit</b><button id="pr" type="button">Print / Save as PDF</button></div>' +
      '<div id="pages">' + res.pages.join('') + '</div></body></html>';
  }

  function svEditorDoc(pages, w, h, title) {
    var css = 'body{margin:0;background:#e5e7eb;font-family:Arial,sans-serif}' +
      '.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;padding:8px 16px;background:#fff;border-bottom:1px solid #d1d5db}' +
      '.bar b{flex:1;min-width:0;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.bar button{font-size:13px;padding:6px 12px;border:1px solid #9ca3af;border-radius:8px;background:#fff;color:#111827;cursor:pointer}' +
      '.pg{box-sizing:border-box;width:' + w + 'px;max-width:100%;min-height:' + h + 'px;margin:16px auto;padding:7%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);color:#000;line-height:1.35;outline:none;overflow-wrap:break-word;cursor:text}' +
      '@media print{body{background:#fff}.bar{display:none}.pg{margin:0;box-shadow:none;page-break-after:always;width:auto;min-height:0}}';
    var body = pages.map(function (p) {
      return '<div class="pg" contenteditable="true" spellcheck="true">' + (p || '<div><br></div>') + '</div>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + svEsc((title || 'Paper') + ' (editable)') + '</title><style>' + css + '</style></head><body>' +
      '<div class="bar"><b>' + svEsc(title || 'Paper') + ' - editable copy</b><button id="dl" type="button">Download Word</button><button id="pr" type="button">Print / Save as PDF</button></div>' +
      '<div id="pages">' + body + '</div></body></html>';
  }

  function svToolbar(ov, scroll) {
    var cols = ov.querySelector('.sv-cols');
    if (!cols || ov.querySelector('.sv-tb')) return;
    if (!document.getElementById('svTbCss')) {
      var st = document.createElement('style');
      st.id = 'svTbCss';
      st.textContent = '.sv-tb{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:6px 16px;background:#edf2fa;border-bottom:1px solid #d1d5db;flex-shrink:0}' +
        '.sv-tb button,.sv-tb select{height:28px;border:0;border-radius:6px;background:transparent;color:#1f2937;font-size:13px;cursor:pointer;padding:0 8px}' +
        '.sv-tb button:hover,.sv-tb select:hover{background:#dde3ee}' +
        '.sv-tb .sep{width:1px;height:20px;background:#c7ccd6;margin:0 6px}' +
        '.sv-tb input[type=color]{width:28px;height:28px;border:0;padding:2px;background:transparent;cursor:pointer}';
      document.head.appendChild(st);
    }
    var tb = document.createElement('div');
    tb.className = 'sv-tb';
    var fonts = ['Arial', 'Times New Roman', 'Georgia', 'Calibri', 'Cambria', 'Verdana', 'Tahoma', 'Courier New'];
    var sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
    var btn = function (c, label, title, style) { return '<button type="button" data-c="' + c + '" title="' + title + '" style="' + (style || '') + '">' + label + '</button>'; };
    tb.innerHTML =
      btn('undo', '&#8630;', 'Undo') + btn('redo', '&#8631;', 'Redo') + '<span class="sep"></span>' +
      '<select data-f="font" title="Font"><option value="">Font</option>' + fonts.map(function (x) { return '<option value="' + x + '" style="font-family:\'' + x + '\'">' + x + '</option>'; }).join('') + '</select>' +
      '<select data-f="size" title="Font size"><option value="">Size</option>' + sizes.map(function (x) { return '<option value="' + x + '">' + x + '</option>'; }).join('') + '</select>' +
      '<span class="sep"></span>' +
      btn('bold', 'B', 'Bold (Ctrl+B)', 'font-weight:bold') + btn('italic', 'I', 'Italic (Ctrl+I)', 'font-style:italic') +
      btn('underline', 'U', 'Underline (Ctrl+U)', 'text-decoration:underline') + btn('strikeThrough', 'S', 'Strikethrough', 'text-decoration:line-through') +
      '<input type="color" data-k="foreColor" value="#000000" title="Text color"><input type="color" data-k="hiliteColor" value="#ffff00" title="Highlight color">' +
      '<span class="sep"></span>' +
      btn('justifyLeft', '&#8676;', 'Align left') + btn('justifyCenter', '&#8596;', 'Center') + btn('justifyRight', '&#8677;', 'Align right') + btn('justifyFull', '&#9776;', 'Justify') +
      '<span class="sep"></span>' +
      btn('insertUnorderedList', '&#8226;&#8801;', 'Bulleted list') + btn('insertOrderedList', '1.&#8801;', 'Numbered list') +
      btn('outdent', '&#8678;', 'Decrease indent') + btn('indent', '&#8680;', 'Increase indent') +
      '<span class="sep"></span>' + btn('removeFormat', 'Tx', 'Clear formatting');
    cols.parentNode.insertBefore(tb, cols);

    var saved = null;
    function blankOf(n) {
      while (n) { if (n.nodeType === 1 && n.classList && n.classList.contains('sv-blank')) return n; n = n.parentNode; }
      return null;
    }
    function onSel() {
      if (!ov.isConnected) { document.removeEventListener('selectionchange', onSel); return; }
      var s = window.getSelection();
      if (s && s.rangeCount && blankOf(s.anchorNode)) saved = s.getRangeAt(0).cloneRange();
    }
    document.addEventListener('selectionchange', onSel);
    function restore() {
      var b = saved && blankOf(saved.startContainer);
      if (!b) return null;
      b.focus();
      var s = window.getSelection();
      s.removeAllRanges(); s.addRange(saved);
      return b;
    }
    function run(cmd, val) {
      if (!restore()) return;
      try { document.execCommand('styleWithCSS', false, true); } catch (e) { }
      document.execCommand(cmd, false, val);
    }
    function setSize(px) {
      var b = restore();
      if (!b || saved.collapsed) return;
      try { document.execCommand('styleWithCSS', false, false); } catch (e) { }
      document.execCommand('fontSize', false, '7');
      Array.prototype.forEach.call(b.querySelectorAll('font[size="7"], span[style*="xxx-large"]'), function (f) {
        var sp = document.createElement('span');
        sp.style.fontSize = px + 'px';
        while (f.firstChild) sp.appendChild(f.firstChild);
        f.parentNode.replaceChild(sp, f);
      });
      b.dispatchEvent(new Event('input', { bubbles: true }));
    }
    tb.addEventListener('mousedown', function (e) {
      var t = e.target.tagName;
      if (t === 'SELECT' || t === 'INPUT' || t === 'OPTION') return;
      e.preventDefault();
    });
    tb.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-c]') : null;
      if (b) run(b.getAttribute('data-c'));
    });
    tb.addEventListener('change', function (e) {
      var t = e.target, f = t.getAttribute('data-f');
      if (f === 'font' && t.value) run('fontName', t.value);
      else if (f === 'size' && t.value) setSize(parseInt(t.value, 10));
      if (f) t.selectedIndex = 0;
    });
    tb.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k');
      if (k) run(k, e.target.value);
    });
  }

  function svSaveInit(ov, scroll, title, src) {
    var btn = ov.querySelector('.sv-save');
    if (!btn) return;
    var id = src ? src.id : null;
    function notify() {
      try { document.dispatchEvent(new CustomEvent('sv-saved', { detail: { id: id, dirty: !!(window.svSaved && window.svSaved.dirty) } })); } catch (e) { }
    }
    function flash(msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = 'Save'; }, 1800);
    }
    function build() {
      var pages = [];
      Array.prototype.forEach.call(scroll.querySelectorAll('.sv-blank'), function (b) {
        if (svBodyText(b).replace(/\s+/g, '')) pages.push('<div class="pg">' + svBodyHtml(b) + '</div>');
      });
      Array.prototype.slice.call(scroll.querySelectorAll('.sv-pg section.docx')).reverse().forEach(function (s) {
        if (!s._svEdited) return;
        var c = s.cloneNode(true);
        c.removeAttribute('contenteditable');
        pages.unshift('<div class="pg">' + c.innerHTML + '</div>');
      });
      if (!pages.length) return null;
      var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>div.pg{page-break-after:always}</style></head><body>' + pages.join('') + '</body></html>';
      var name = ((title || 'paper').replace(/[^\w\- ]+/g, '').trim() || 'paper') + '-edited.doc';
      return new File(['\ufeff' + html], name, { type: 'application/msword' });
    }
    btn.addEventListener('click', function () {
      var f = build();
      if (!f) { flash('Nothing to save'); return; }
      window.svSaved = { id: id, file: f, name: f.name, dirty: false };
      flash('Saved \u2713');
      notify();
    });
    scroll.addEventListener('input', function () {
      var s = window.svSaved;
      if (s && String(s.id) === String(id) && !s.dirty) { s.dirty = true; notify(); }
    });
  }

  function renderXlsx(buf, scroll, stat, title) {
    return loadScript(LIBS.xlsx).then(function () {
      var wb = window.XLSX.read(buf, { type: 'array' });
      scroll.innerHTML = '';
      var bar = document.createElement('div');
      bar.className = 'sv-msg';
      bar.textContent = 'Spreadsheet view (read only). Download the original to edit it in Excel. ';
      var a = document.createElement('a');
      a.className = 'sv-btn';
      a.textContent = 'Download original';
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = ((title || 'sheet').replace(/[^\w\- ]+/g, '').trim() || 'sheet') + '.xlsx';
      bar.appendChild(a);
      scroll.appendChild(bar);
      wb.SheetNames.forEach(function (name) {
        var h = document.createElement('div');
        h.style.cssText = 'font-weight:600;font-size:14px;padding:12px 16px 4px';
        h.textContent = name;
        var wrap = document.createElement('div');
        wrap.style.cssText = 'overflow:auto;padding:0 16px 16px';
        wrap.innerHTML = '<style>.sv-xl td{border:1px solid #cbd5e1;padding:4px 8px;font:13px Arial,sans-serif;color:#111827;white-space:nowrap}.sv-xl{border-collapse:collapse;background:#fff}</style>' + window.XLSX.utils.sheet_to_html(wb.Sheets[name]).replace('<table', '<table class="sv-xl"');
        scroll.appendChild(h);
        scroll.appendChild(wrap);
      });
      stat.textContent = wb.SheetNames.length + (wb.SheetNames.length === 1 ? ' sheet' : ' sheets');
    });
  }

  function svSaveAs(a) {
    var card = a.closest('.review-card');
    var id = card ? card.getAttribute('data-id') : null;
    var all = card ? Array.prototype.filter.call(card.querySelectorAll('a[download]'), function (x) { return /download/i.test(x.textContent || ''); }) : [a];
    var n = Math.max(0, all.indexOf(a));
    var nm = '';
    try { nm = decodeURIComponent(a.href.split('?')[0].split('/').pop() || ''); } catch (e) { }
    if (!/\.[A-Za-z0-9]{2,5}$/.test(nm)) {
      var tt = card && card.querySelector('.review-card-title');
      nm = (((tt && tt.textContent) || 'paper').replace(/[^\w\- ]+/g, '').trim() || 'paper') + '.docx';
    }
    var base = (typeof ADMIN_API !== 'undefined') ? ADMIN_API : 'https://aideanc-production.up.railway.app/api';
    var token = '';
    try { token = localStorage.getItem('auth_token') || ''; } catch (e) { }
    function getBlob() {
      var viaApi = id ? fetch(base + '/reviewer/assignments/' + id + '/file/' + n, { headers: { 'Authorization': 'Bearer ' + token } }) : Promise.reject(new Error('no id'));
      return viaApi.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
        .catch(function () { return fetch(a.href).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }); });
    }
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({ suggestedName: nm }).then(function (h) {
        return getBlob().then(function (blob) {
          return h.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); });
        });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        alert('Could not save the file. Please try again.');
        if (window.console) console.error('Save as:', err);
      });
    } else {
      var name = window.prompt('File name:', nm);
      if (!name) return;
      getBlob().then(function (blob) {
        var l = document.createElement('a');
        l.href = URL.createObjectURL(blob);
        l.download = name;
        document.body.appendChild(l);
        l.click();
        setTimeout(function () { URL.revokeObjectURL(l.href); document.body.removeChild(l); }, 1000);
      }).catch(function () { alert('Could not download the file. Please try again.'); });
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[download]') : null;
    if (!a || !a.closest('.review-card') || !/download/i.test(a.textContent || '')) return;
    e.preventDefault();
    e.stopPropagation();
    svSaveAs(a);
  }, true);

  function openViewer(url, title, src, docOnly) {
    injectCss();
    notesKey = src ? ('svNotes:' + src.id + ':' + src.n) : ('svNotes:' + url);
    var ov = document.createElement('div');
    ov.id = 'svOv'; if (docOnly) ov.classList.add('sv-doconly');
    ov.innerHTML =
      '<div class="sv-win" role="dialog" aria-modal="true" aria-label="Paper viewer">' +
      '<div class="sv-head"><div class="sv-title"></div><span class="sv-stat">Loading</span>' +
      
      '<button type="button" class="sv-btn sv-open sv-save">Save</button>' +
      '<button type="button" class="sv-btn sv-close">Close</button></div>' +
      '<div class="sv-cols"><div>Original paper</div><div>Your page (type here)</div></div>' +
      '<div class="sv-scroll"></div></div>';
    document.body.appendChild(ov);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    var scroll = ov.querySelector('.sv-scroll'); svToolbar(ov, scroll);
    var stat = ov.querySelector('.sv-stat');
    ov.querySelector('.sv-title').textContent = title || 'Thesis paper';
    var openA = ov.querySelector('.sv-open'); svSaveInit(ov, scroll, title, src);
    openA.href = url;
    openA.addEventListener('click-legacy-disabled', function (e) {
      var pages = [], pw = 0, ph = 0;
      Array.prototype.forEach.call(scroll.querySelectorAll('.sv-pg'), function (p) {
        var t = p.querySelector('.sv-text'), h = '';
        if (t) h = svLinesHtml(t, null);
        else { var sec = p.querySelector('section') || p; h = svDomHtml(sec, sec._svk || 1); }
        if (!pw) { pw = p.offsetWidth; ph = p.offsetHeight; }
        pages.push(h);
      });
      if (!pages.some(Boolean)) return;
      var w = window.open('', '_blank');
      if (!w) return;
      e.preventDefault();
      w.document.open();
      w.document.write(svEditorDoc2(svEditPages(scroll, ov), title));
      w.document.close();
      var dl = w.document.getElementById('dl'), pr = w.document.getElementById('pr');
      if (dl) dl.addEventListener('click', function () {
        var body = w.document.getElementById('pages').innerHTML;
        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>div.pg{page-break-after:always}</style></head><body>' + body + '</body></html>';
        var a = w.document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + html], { type: 'application/msword' }));
        a.download = ((title || 'paper').replace(/[^\w\- ]+/g, '').trim() || 'paper') + '-edited.doc';
        w.document.body.appendChild(a); a.click(); w.document.body.removeChild(a);
      });
      if (pr) pr.addEventListener('click', function () { w.print(); });
      w.document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.closest && ev.target.closest('.tl')) ev.preventDefault(); });
    });

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
      m.textContent = (err && err.message === 'Unsupported file type') ? "This file type cannot be previewed (older .doc or .xls). Close this and download the file to open it in Word or Excel." : "Couldn't load this paper here (" + ((err && err.message) || 'unknown error') + "). Close it and try again.";
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
      if (b[0] === 0x50 && b[1] === 0x4B) return loadScript(LIBS.zip).then(function () { return window.JSZip.loadAsync(buf); }).then(function (z) { if (z.file('xl/workbook.xml')) return renderXlsx(buf, scroll, stat, title); return renderDocx(buf, scroll, stat, ov); });
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
    openViewer(a.href, t ? t.textContent.trim() : '', id ? { id: id, n: n } : null, /^original/i.test(label));
  }, true);
})();