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
    try { var saved = localStorage.getItem(skey); if (saved) right.textContent = saved; } catch (e) { }
    right.addEventListener('input', function () {
      try {
        var v = right.innerText.replace(/\n$/, '');
        if (v) localStorage.setItem(skey, v); else localStorage.removeItem(skey);
      } catch (e) { }
    });
    right.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, t);
    });
    row.appendChild(left);
    row.appendChild(right);
    scroll.appendChild(row);
    return { left: left, right: right };
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
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
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
          sec.style.transform = 'scale(' + k + ')';
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