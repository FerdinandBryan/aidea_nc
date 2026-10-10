/* DV_FIXPAPER v1: one clean generator that applies the selected template's rules to the fixed paper */
(function () {
    if (window.__dvFixPaperV1) return;
    window.__dvFixPaperV1 = true;
    var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    var PPR = ['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'];
    var RPR = ['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath'];
    var SECT = ['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid'];
    var MONTH = /^(January|February|March|April|May|June|July|August|September|October|November|December)\.?,?\s+(\d{1,2}(st|nd|rd|th)?,?\s*)?\d{4}\.?$/i;
    var CHAPTER = /^CHAPTER\s+(\d+|[IVXLC]+)\s*[:.\-\u2013]?\s*$/;

    function kid(parent, name) {
        for (var c = parent.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 1 && c.localName === name && c.namespaceURI === W) return c;
        }
        return null;
    }
    function ensure(doc, parent, order, name) {
        var e = kid(parent, name);
        if (e) return e;
        e = doc.createElementNS(W, 'w:' + name);
        var idx = order.indexOf(name), ref = null;
        for (var c = parent.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 1 && c.namespaceURI === W && order.indexOf(c.localName) > idx) { ref = c; break; }
        }
        parent.insertBefore(e, ref);
        return e;
    }
    function setA(el, n, v) { el.setAttributeNS(W, 'w:' + n, String(v)); }
    function ptext(p) {
        return Array.from(p.getElementsByTagNameNS(W, 't')).map(function (n) { return n.textContent; }).join('').trim();
    }
    function inTable(p) {
        for (var n = p.parentNode; n; n = n.parentNode) { if (n.localName === 'tbl' && n.namespaceURI === W) return true; }
        return false;
    }
    function pPrOf(doc, p) {
        var pPr = kid(p, 'pPr');
        if (!pPr) { pPr = doc.createElementNS(W, 'w:pPr'); p.insertBefore(pPr, p.firstChild); }
        return pPr;
    }
    function hasPageBreak(p) {
        if (!p) return false;
        var pPr = kid(p, 'pPr');
        if (pPr && (kid(pPr, 'pageBreakBefore') || kid(pPr, 'sectPr'))) return true;
        return Array.from(p.getElementsByTagNameNS(W, 'br')).some(function (b) {
            return (b.getAttributeNS(W, 'type') || b.getAttribute('w:type')) === 'page';
        });
    }

    function parseRules(rules) {
        var cfg = { body: null, abs: null, top: null, bottom: null, left: null, right: null, font: null, size: null, hanging: false, heads: {} };
        (rules || []).forEach(function (r) {
            var d = String((r && (r.detail || r.name)) || ''), m;
            var hw = /\bword\s+(REFERENCES|APPENDICES)\b/i.exec(d);
            if (hw) {
                var h = { size: null, center: /cent/i.test(d), bold: /\bbold\b/i.test(d), caps: /capital/i.test(d) };
                if ((m = /font size\s*(\d+(?:\.\d+)?)/i.exec(d))) h.size = parseFloat(m[1]);
                cfg.heads[hw[1].toUpperCase()] = h;
                return;
            }
            if (/spac/i.test(d)) {
                var v = null;
                if (/double[- ]?spac/i.test(d)) v = 2;
                else if (/single[- ]?spac/i.test(d)) v = 1;
                else if ((m = /\b(1\.5|2(?:\.0)?)\s*(?:line\s*)?spac/i.exec(d))) v = parseFloat(m[1]);
                if (v !== null) {
                    if (/abstract/i.test(d)) { if (cfg.abs === null) cfg.abs = v; }
                    else if (cfg.body === null) cfg.body = v;
                }
            }
            if (/margin/i.test(d)) {
                if ((m = /left\s*([\d.]+)/i.exec(d))) cfg.left = parseFloat(m[1]);
                if ((m = /right\s*([\d.]+)/i.exec(d))) cfg.right = parseFloat(m[1]);
                if ((m = /top\s*and\s*bottom\s*([\d.]+)/i.exec(d))) { cfg.top = cfg.bottom = parseFloat(m[1]); }
                else {
                    if ((m = /top\s*([\d.]+)/i.exec(d))) cfg.top = parseFloat(m[1]);
                    if ((m = /bottom\s*([\d.]+)/i.exec(d))) cfg.bottom = parseFloat(m[1]);
                }
            }
            if ((m = /font (?:style|name|family)\b.*?\bis\s+([A-Za-z][A-Za-z ]*?)\s*\.?\s*$/i.exec(d))) cfg.font = m[1];
            if ((m = /font size\b.*?\bis\s+(\d+(?:\.\d+)?)/i.exec(d))) cfg.size = parseFloat(m[1]);
            if (/hanging inden/i.test(d)) cfg.hanging = true;
        });
        var any = cfg.body !== null || cfg.abs !== null || cfg.left !== null || cfg.right !== null || cfg.top !== null ||
            cfg.bottom !== null || cfg.font || cfg.size !== null || cfg.hanging || Object.keys(cfg.heads).length;
        return any ? cfg : null;
    }

    async function build(file, cfg) {
        if (!window.JSZip) await new Promise(function (res) { _validatorDeps.ensureJSZip(res); });
        var zip = await JSZip.loadAsync(await _resolveArrayBuffer(file));
        var xf = zip.file('word/document.xml');
        if (!xf) throw new Error('Not a valid DOCX');
        var doc = new DOMParser().parseFromString(await xf.async('string'), 'application/xml');

        var zone = 'front', seenCh = {}, prevP = null, seenText = false;
        var stats = { breaks: 0, spaced: 0, date: 0 };

        Array.from(doc.getElementsByTagNameNS(W, 'p')).forEach(function (p) {
            var t = ptext(p), up = t.toUpperCase().replace(/\s+/g, ' ');
            var tbl = inTable(p), kind = null, key = null, big = null;
            var tocLine = p.getElementsByTagNameNS(W, 'tab').length > 0 || /\.{3,}/.test(t);

            if (!tbl && t && t.length <= 60 && !tocLine) {
                var cm = CHAPTER.exec(up);
                if (up === 'ABSTRACT') kind = 'abstract';
                else if (up === 'APPROVAL SHEET') kind = 'approval';
                else if (/^ACKNOWLEDGEMENTS?$/.test(up)) kind = 'ack';
                else if (/^(TABLE OF CONTENTS|LIST OF TABLES|LIST OF FIGURES|LIST OF APPENDICES)$/.test(up)) kind = 'lists';
                else if (up === 'REFERENCES' || up === 'APPENDICES') { kind = up.toLowerCase(); big = up; }
                else if (cm) {
                    key = cm[1];
                    if (zone === 'lists' && !seenCh[key]) { seenCh[key] = 1; }   /* contents-page entry, not the real heading */
                    else { seenCh[key] = (seenCh[key] || 0) + 1; kind = 'chapter'; }
                }
            }

            if (kind) {
                if (seenText && !hasPageBreak(p) && !hasPageBreak(prevP)) {
                    ensure(doc, pPrOf(doc, p), PPR, 'pageBreakBefore');
                    stats.breaks++;
                }
                zone = (kind === 'abstract') ? 'abstract' : (kind === 'approval') ? 'skip' : (kind === 'ack') ? 'body' :
                       (kind === 'lists') ? 'lists' : (kind === 'chapter') ? 'body' : kind;
            }
            if (t) seenText = true;

            if (!tbl && t) {
                var line = null;
                if (!big) {
                    if (zone === 'front') line = (cfg.body !== null) ? 1 : null;
                    else if (zone === 'abstract' && kind !== 'abstract') line = cfg.abs;
                    else if (zone === 'body' || zone === 'references') line = cfg.body;
                }
                if (line !== null) {
                    var sp = ensure(doc, pPrOf(doc, p), PPR, 'spacing');
                    setA(sp, 'line', Math.round(line * 240));
                    setA(sp, 'lineRule', 'auto');
                    stats.spaced++;
                }
                if (zone === 'front' && MONTH.test(t)) {
                    var pPr = pPrOf(doc, p);
                    setA(ensure(doc, pPr, PPR, 'jc'), 'val', 'center');
                    var ind = kid(pPr, 'ind'); if (ind) pPr.removeChild(ind);
                    Array.from(p.getElementsByTagNameNS(W, 'tab')).forEach(function (x) {
                        if (x.parentNode && x.parentNode.localName === 'r') x.parentNode.removeChild(x);
                    });
                    var ft = p.getElementsByTagNameNS(W, 't')[0];
                    if (ft) ft.textContent = ft.textContent.replace(/^\s+/, '');
                    stats.date++;
                }
                var head = big ? cfg.heads[big] : null;
                if (head && head.center) setA(ensure(doc, pPrOf(doc, p), PPR, 'jc'), 'val', 'center');
                if (head && head.caps) {
                    Array.from(p.getElementsByTagNameNS(W, 't')).forEach(function (n) { n.textContent = n.textContent.toUpperCase(); });
                }
                if (cfg.hanging && zone === 'references' && !big) {
                    var hi = ensure(doc, pPrOf(doc, p), PPR, 'ind');
                    hi.removeAttributeNS(W, 'firstLine');
                    setA(hi, 'left', 720);
                    setA(hi, 'hanging', 720);
                }
            }

            var hd = big ? cfg.heads[big] : null;
            Array.from(p.getElementsByTagNameNS(W, 'r')).forEach(function (r) {
                var rPr = kid(r, 'rPr');
                if (!rPr) { rPr = doc.createElementNS(W, 'w:rPr'); r.insertBefore(rPr, r.firstChild); }
                if (cfg.font) {
                    var f = ensure(doc, rPr, RPR, 'rFonts');
                    ['asciiTheme', 'hAnsiTheme', 'cstheme', 'eastAsiaTheme'].forEach(function (a) { f.removeAttributeNS(W, a); });
                    ['ascii', 'hAnsi', 'cs', 'eastAsia'].forEach(function (a) { setA(f, a, cfg.font); });
                }
                var size = (hd && hd.size) ? hd.size : cfg.size;
                if (size) {
                    setA(ensure(doc, rPr, RPR, 'sz'), 'val', Math.round(size * 2));
                    setA(ensure(doc, rPr, RPR, 'szCs'), 'val', Math.round(size * 2));
                }
                if (hd && hd.bold) { var b = ensure(doc, rPr, RPR, 'b'); b.removeAttributeNS(W, 'val'); }
            });
            prevP = p;
        });

        if (cfg.left !== null || cfg.right !== null || cfg.top !== null || cfg.bottom !== null) {
            Array.from(doc.getElementsByTagNameNS(W, 'sectPr')).forEach(function (s) {
                var mar = ensure(doc, s, SECT, 'pgMar');
                if (cfg.top !== null) setA(mar, 'top', Math.round(cfg.top * 1440));
                if (cfg.bottom !== null) setA(mar, 'bottom', Math.round(cfg.bottom * 1440));
                if (cfg.left !== null) setA(mar, 'left', Math.round(cfg.left * 1440));
                if (cfg.right !== null) setA(mar, 'right', Math.round(cfg.right * 1440));
            });
        }

        zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
        console.log('[Validator] fixpaper applied', cfg, stats);
        return await zip.generateAsync({ type: 'blob' });
    }

    function install() {
        var prev = _dvGenerateFixedDocx;
        _dvGenerateFixedDocx = async function (file, rules, profile) {
            var cfg = parseRules(rules);
            var checklist = (rules || []).some(function (r) { return r && (r.id === 'checklist-spacing' || r.id === 'checklist-margin'); });
            if (!cfg || checklist) return prev.apply(this, arguments);
            try { return await build(file, cfg); }
            catch (e) { console.warn('[Validator] fixpaper failed, using old generator', e); return prev.apply(this, arguments); }
        };
        console.log('[Validator] fixpaper installed');
    }

    var tries = 0, t = setInterval(function () {
        if (typeof _dvGenerateFixedDocx === 'function') { clearInterval(t); install(); }
        else if (++tries > 200) clearInterval(t);
    }, 300);
})();