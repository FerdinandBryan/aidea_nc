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
        var cfg = { body: null, abs: null, top: null, bottom: null, left: null, right: null, font: null, size: null, alignment: null, indentation: null, hanging: false, heads: {} };
        (rules || []).forEach(function (r) {
            var d = String((r && (r.detail || r.name)) || '').replace(/[^\x00-\x7F]+/g, ' '), m;
            var hw = /\bword\s+(REFERENCES|APPENDICES)\b/i.exec(d);
            if (hw) {
                var h = { size: null, center: /cent/i.test(d), bold: /\bbold\b/i.test(d), caps: /capital/i.test(d) };
                if ((m = /font size\s*(\d+(?:\.\d+)?)/i.exec(d))) h.size = parseFloat(m[1]);
                cfg.heads[hw[1].toUpperCase()] = h;
                return;
            }
            if (/spac/i.test(d)) {
                var v = null;
                if (/double(?:[- ]+line)?[- ]*spac/i.test(d)) v = 2;
                else if (/single(?:[- ]+line)?[- ]*spac/i.test(d)) v = 1;
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
            // Admin rules can contain prose or explicit type/value settings.
            if (!/\b(heading|title|word|table|figure|abstract|references|appendices)\b/i.test(d)) {
                var a = /\b(justified|justify|left[- ]aligned|right[- ]aligned|cent(?:er|re)(?:ed|d)?[- ]aligned)\b/i.exec(d);
                if (a) cfg.alignment = /^just/i.test(a[1]) ? 'both' : /^left/i.test(a[1]) ? 'left' : /^right/i.test(a[1]) ? 'right' : 'center';
                if ((m = /(?:first[- ]line\s+indent(?:ation)?|indent(?:ation)?)\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(?:inch|in\b|")/i.exec(d))) cfg.indentation = parseFloat(m[1]);
            }
            if ((m = /\b(Times New Roman|Arial|Calibri|Cambria|Georgia|Verdana)\b/i.exec(d))) cfg.font = m[1];
            if ((m = /\b(\d+(?:\.\d+)?)\s*(?:pt|point)\b/i.exec(d))) cfg.size = parseFloat(m[1]);
            if ((m = /\b(\d+(?:\.\d+)?)[- ]inch\s+margins?\b/i.exec(d))) {
                ['top', 'bottom', 'left', 'right'].forEach(function (side) { cfg[side] = parseFloat(m[1]); });
            }
            if ((m = /font size\s*[:=]?\s*(\d+(?:\.\d+)?)/i.exec(d))) cfg.size = parseFloat(m[1]);
            if (/hanging inden/i.test(d)) cfg.hanging = true;
        });
        // Explicit values take precedence over descriptive text.
        (rules || []).forEach(function (r) {
            if (!r || r.value == null) return;
            var type = String(r.type || '').toLowerCase(), value = Number(r.value);
            if (type === 'spacing' && Number.isFinite(value) && value > 0) cfg.body = value;
            if (type === 'indentation' && Number.isFinite(value) && value >= 0) cfg.indentation = value;
            if (type === 'alignment') {
                var a = String(r.value).toLowerCase().trim();
                if (a === 'justify' || a === 'justified') a = 'both';
                if (['both', 'left', 'right', 'center'].indexOf(a) !== -1) cfg.alignment = a;
            }
            if (type === 'margin') {
                ['top', 'bottom', 'left', 'right'].forEach(function (side) {
                    var v = typeof r.value === 'object' ? r.value[side] : r.value;
                    if (v != null && Number.isFinite(Number(v)) && Number(v) >= 0) cfg[side] = Number(v);
                });
            }
        });
        var any = cfg.alignment !== null || cfg.indentation !== null || cfg.body !== null || cfg.abs !== null || cfg.left !== null || cfg.right !== null || cfg.top !== null ||
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
            var tocLine = /\.{3,}/.test(t) || (p.getElementsByTagNameNS(W, 'tab').length > 0 && !CHAPTER.test(up) && /\s(?:\d+|[ivxlc]+)\s*$/i.test(t));

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

            // For a title page followed directly by Chapter 1, use one break
            // before the chapter instead of retaining breaks inside the title.
            if (kind === 'chapter' && /^(1|I)$/i.test(key) && zone === 'front') {
                var titleBody = p.parentNode;
                var chapterPr = pPrOf(doc, p);
                if (titleBody.localName === 'body' && titleBody.namespaceURI === W) {
                    for (var title = titleBody.firstChild; title && title !== p; title = title.nextSibling) {
                        if (title.nodeType !== 1 || title.localName !== 'p') continue;
                        var tp = kid(title, 'pPr');
                        var oldBreak = tp && kid(tp, 'pageBreakBefore');
                        if (oldBreak) tp.removeChild(oldBreak);
                        Array.from(title.getElementsByTagNameNS(W, 'br')).forEach(function (br) {
                            if (br.getAttributeNS(W, 'type') === 'page') br.parentNode.removeChild(br);
                        });
                        Array.from(title.getElementsByTagNameNS(W, 'lastRenderedPageBreak')).forEach(function (br) { br.parentNode.removeChild(br); });
                    }
                }
                // A break after the heading must not substitute for a break before it.
                setA(ensure(doc, chapterPr, PPR, 'pageBreakBefore'), 'val', 1);
                var chapterSpacing = ensure(doc, chapterPr, PPR, 'spacing');
                setA(chapterSpacing, 'before', 0);
                chapterSpacing.removeAttributeNS(W, 'beforeAutospacing');
            }

            if (kind) {
                if (seenText && !hasPageBreak(p)) {
                    setA(ensure(doc, pPrOf(doc, p), PPR, 'pageBreakBefore'), 'val', 1);
                    stats.breaks++;
                }
                zone = (kind === 'abstract') ? 'abstract' : (kind === 'approval') ? 'skip' : (kind === 'ack') ? 'body' :
                       (kind === 'lists') ? 'lists' : (kind === 'chapter') ? 'body' : kind;
            }
            if (t) seenText = true;

            // Apply the template's line spacing to title-page paragraphs,
            // including blank paragraphs used as spacers.
            if (!tbl && zone === 'front') {
                var titlePr = pPrOf(doc, p);
                var titleSpacing = ensure(doc, titlePr, PPR, 'spacing');
                setA(titleSpacing, 'line', Math.round((cfg.body !== null ? cfg.body : 1) * 240));
                setA(titleSpacing, 'lineRule', 'auto');
                setA(titleSpacing, 'before', 0);
                setA(titleSpacing, 'after', 0);
                titleSpacing.removeAttributeNS(W, 'beforeAutospacing');
                titleSpacing.removeAttributeNS(W, 'afterAutospacing');
                if (MONTH.test(t)) {
                    var dateBreak = kid(titlePr, 'pageBreakBefore');
                    if (dateBreak) titlePr.removeChild(dateBreak);
                    // Keep the date attached to the preceding title-page paragraph.
                    if (prevP && !inTable(prevP)) {
                        setA(ensure(doc, pPrOf(doc, prevP), PPR, 'keepNext'), 'val', 1);
                    }
                }
            }

            if (!tbl && t) {
                var line = null;
                if (!big) {
                    if (zone === 'front') line = cfg.body;
                    else if (zone === 'abstract' && kind !== 'abstract') line = cfg.abs !== null ? cfg.abs : cfg.body;
                    else line = cfg.body;
                }
                if (line !== null) {
                    var sp = ensure(doc, pPrOf(doc, p), PPR, 'spacing');
                    setA(sp, 'line', Math.round(line * 240));
                    setA(sp, 'lineRule', 'auto');
                    stats.spaced++;
                }
                // Keep front matter, section headings, lists and table layout intact.
                if (!kind && (zone === 'body' || zone === 'abstract' || zone === 'references')) {
                    if (cfg.alignment !== null) setA(ensure(doc, pPrOf(doc, p), PPR, 'jc'), 'val', cfg.alignment);
                    if (cfg.indentation !== null && zone !== 'references') {
                        var bodyIndent = ensure(doc, pPrOf(doc, p), PPR, 'ind');
                        bodyIndent.removeAttributeNS(W, 'hanging');
                        bodyIndent.removeAttributeNS(W, 'firstLineChars');
                        setA(bodyIndent, 'firstLine', Math.round(cfg.indentation * 1440));
                    }
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

    async function spreadTitlePage(zip, doc) {
        var body = doc.getElementsByTagNameNS(W, 'body')[0];
        if (!body) return;
        var title = [], date = null;
        for (var node = body.firstChild; node; node = node.nextSibling) {
            if (node.nodeType !== 1) continue;
            if (node.localName !== 'p') return;
            var text = ptext(node);
            if (/^(CHAPTER|ABSTRACT|APPROVAL SHEET|ACKNOWLEDGEMENT|TABLE OF CONTENTS)\b/i.test(text)) break;
            title.push(node);
            if (MONTH.test(text)) { date = node; break; }
        }
        if (!date || title.length < 2 || !window._dvLoadPreviewLib) return;
        var visible = title.filter(function (p) { return !!ptext(p); });
        var partial = visible.find(function (p) { return /in partial fulfi[l]?lment/i.test(ptext(p)); });
        var by = visible.find(function (p) { return /^by\s*$/i.test(ptext(p)); });
        if (!partial || !by) return;
        await window._dvLoadPreviewLib();
        // Replace blank spacer paragraphs with measured gaps between groups.
        title.forEach(function (p) {
            if (!ptext(p) && !p.getElementsByTagNameNS(W, 'drawing').length &&
                !p.getElementsByTagNameNS(W, 'pict').length && !p.getElementsByTagNameNS(W, 'sectPr').length) p.parentNode.removeChild(p);
        });
        visible.forEach(function (p) {
            var props = pPrOf(doc, p), spacing = ensure(doc, props, PPR, 'spacing');
            setA(spacing, 'before', 0); setA(spacing, 'after', 0);
            spacing.removeAttributeNS(W, 'beforeAutospacing');
            spacing.removeAttributeNS(W, 'afterAutospacing');
            setA(ensure(doc, props, PPR, 'jc'), 'val', 'center');
        });
        var section = doc.getElementsByTagNameNS(W, 'sectPr')[0];
        var margins = section && kid(section, 'pgMar');
        function margin(side) {
            var value = margins && margins.getAttributeNS(W, side);
            return value == null ? 1440 : Number(value);
        }
        var usable = (15840 - margin('top') - margin('bottom')) / 15;
        var box = document.createElement('div');
        box.style.cssText = 'position:absolute;left:-10000px;top:0;width:856px;visibility:hidden;';
        document.body.appendChild(box);
        try {
            zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
            await window.docx.renderAsync(await zip.generateAsync({ type: 'blob' }), box, null, {
                className: 'dvTitleMeasure', inWrapper: false, breakPages: false,
                ignoreLastRenderedPageBreak: true, ignoreHeight: true,
                renderHeaders: false, renderFooters: false, __dvMeasure: true
            });
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            var article = box.querySelector('section.dvTitleMeasure > article');
            if (!article || article.children.length < visible.length) return;
            var height = 0;
            Array.from(article.children).slice(0, visible.length).forEach(function (p) {
                var style = getComputedStyle(p);
                height += p.getBoundingClientRect().height +
                    (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
            });
            // Fill the printable height without changing font or line spacing.
            var extra = Math.max(0, usable * 0.90 - height);
            [[partial, 0.45], [by, 0.35], [date, 0.20]].forEach(function (group) {
                setA(ensure(doc, pPrOf(doc, group[0]), PPR, 'spacing'), 'before', Math.round(extra * group[1] * 15));
            });
        } finally { box.remove(); }
    }

    async function shortPaper(blob) {
        if (!window.JSZip) await new Promise(function (resolve) { _validatorDeps.ensureJSZip(resolve); });
        var zip = await JSZip.loadAsync(blob);
        var file = zip.file('word/document.xml');
        if (!file) throw new Error('Not a valid DOCX');
        var doc = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
        // Use an actual run-level page break, which docx-preview splits into
        // pages, rather than relying solely on paragraph break properties.
        var chapterPattern = /^CHAPTER\s*(?:[1-5]|I|II|III|IV|V|ONE|TWO|THREE|FOUR|FIVE)\s*[:.\-\u2013]?$/i;
        Array.from(doc.getElementsByTagNameNS(W, 'p')).forEach(function (original) {
            if (inTable(original)) return;
            var paragraph = original;
            var text = ptext(paragraph).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            if (!chapterPattern.test(text)) {
                // Some Word files store the title/date and chapter heading in
                // one paragraph, separated by line breaks. Separate the runs.
                var marker = Array.from(paragraph.getElementsByTagNameNS(W, 't')).find(function (t) {
                    return chapterPattern.test((t.textContent || '').trim());
                });
                if (!marker) return;
                var run = marker;
                while (run.parentNode && run.parentNode !== paragraph) run = run.parentNode;
                if (run.parentNode !== paragraph || run.localName !== 'r') return;
                var before = [];
                for (var n = paragraph.firstChild; n && n !== run; n = n.nextSibling) {
                    if (n.localName !== 'pPr') before.push(n);
                }
                if (before.length) {
                    var split = doc.createElementNS(W, 'w:p');
                    var props = kid(paragraph, 'pPr');
                    if (props) split.appendChild(props.cloneNode(true));
                    paragraph.parentNode.insertBefore(split, paragraph.nextSibling);
                    for (var n = run; n;) {
                        var next = n.nextSibling;
                        split.appendChild(n);
                        n = next;
                    }
                    paragraph = split;
                }
            }
            var props = pPrOf(doc, paragraph);
            var beforeBreak = kid(props, 'pageBreakBefore');
            if (beforeBreak) props.removeChild(beforeBreak);
            // Remove old breaks before the first visible text to avoid two pages.
            var firstText = paragraph.getElementsByTagNameNS(W, 't')[0];
            Array.from(paragraph.getElementsByTagNameNS(W, 'br')).forEach(function (br) {
                if (br.getAttributeNS(W, 'type') === 'page' && firstText &&
                    (br.compareDocumentPosition(firstText) & 4)) br.parentNode.removeChild(br);
            });
            Array.from(paragraph.getElementsByTagNameNS(W, 'lastRenderedPageBreak')).forEach(function (br) { br.parentNode.removeChild(br); });
            var breakRun = doc.createElementNS(W, 'w:r');
            var pageBreak = doc.createElementNS(W, 'w:br');
            setA(pageBreak, 'type', 'page');
            breakRun.appendChild(pageBreak);
            paragraph.insertBefore(breakRun, props.nextSibling);
        });
        var sections = Array.from(doc.getElementsByTagNameNS(W, 'sectPr'));
        if (!sections.length) {
            var body = doc.getElementsByTagNameNS(W, 'body')[0];
            if (!body) throw new Error('The document has no body.');
            var section = doc.createElementNS(W, 'w:sectPr');
            body.appendChild(section);
            sections.push(section);
        }
        sections.forEach(function (section) {
            var size = ensure(doc, section, SECT, 'pgSz');
            // Short bond / US Letter, in twentieths of a point (1440 per inch).
            setA(size, 'w', 12240);
            setA(size, 'h', 15840);
            setA(size, 'orient', 'portrait');
        });
        zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
        await spreadTitlePage(zip, doc);
        zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
        return zip.generateAsync({ type: 'blob' });
    }

    function install() {
        var prev = _dvGenerateFixedDocx;
        _dvGenerateFixedDocx = async function (file, rules, profile) {
            var cfg = parseRules(rules);
            var checklist = (rules || []).some(function (r) { return r && (r.id === 'checklist-spacing' || r.id === 'checklist-margin'); });
            if (!cfg || checklist) return shortPaper(await prev.apply(this, arguments));
            try { return await shortPaper(await build(file, cfg)); }
            catch (e) { console.warn('[Validator] fixpaper failed, using old generator', e); return shortPaper(await prev.apply(this, arguments)); }
        };
        console.log('[Validator] fixpaper installed');
    }

    if (typeof _dvGenerateFixedDocx === 'function') { install(); return; }
    var tries = 0, t = setInterval(function () {
        if (typeof _dvGenerateFixedDocx === 'function') { clearInterval(t); install(); }
        else if (++tries > 200) clearInterval(t);
    }, 300);
})();