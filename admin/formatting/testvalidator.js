// thesis_validator.js
// AIDEA – Norzagaray College
// Validates that an uploaded file is actually a thesis / research paper / capstone
// before allowing Format Check or Plagiarism Check to proceed.
//
// FIX: thesis.file from the API is a plain object {name, size, type, url} — not a real
//      File object. When .arrayBuffer() is unavailable, the file is fetched via its URL.
//      Plain API file objects now go through the SAME full validation (keyword scoring +
//      formatting analysis) as real File objects — the old shortcut that skipped
//      validation entirely for API-provided files has been removed.
//
// NEW: Real formatting checks (spacing / margins / indentation / alignment), pulled
//      from an ADMIN-SELECTED active template in localStorage (written by formatting.js),
//      or a built-in default thesis format if none is chosen. Two downloadable outputs
//      are generated from the checked file:
//        1) a REDLINED copy — problem paragraphs highlighted + a red inline note
//        2) an AUTO-FIXED copy — spacing/margins/indentation/alignment corrected
//      DOCX generation is exact (works directly on the document XML). PDF generation
//      is best-effort: redlining overlays highlights/notes on the original pages;
//      auto-fixing re-typesets the extracted text with the target formatting, since
//      an existing PDF's internal spacing can't be reliably reflowed client-side —
//      the fixed PDF says so on its first page.
//
// NEW (user/student side): openDocValidationModalForFile(file, actionLabel, onValidCallback)
//      Mirrors openDocValidationModal but works directly off a File object the student
//      picks, instead of a thesisId looked up from window.theses. If no file is passed
//      yet, the modal shows an inline picker first. Produces the exact same two
//      downloads (redlined copy + auto-fixed copy) via the shared generators.
//
// PATCH 1 (modal fallback): this script no longer assumes window.openModal / window.closeModal
//      exist globally. formatting.js (admin page) defines those globally, but
//      submit-thesis.html (student page) does NOT load formatting.js — only this
//      validator. Every internal call now goes through _dvOpenModal / _dvCloseModal,
//      which use window.openModal/closeModal when available (admin page) and fall back
//      to a local show/hide implementation otherwise (student page).
//
// PATCH 2 (template picker restored): earlier this version silently picked whichever
//      active template _getFormatRules() found first — there was no way for the
//      student or admin to choose WHICH paper / format template ("Proposal",
//      "Final Defense", "Revised Final", etc.) to check the file against. Both entry
//      points now render a picker step first: file (student can upload/replace it;
//      admin sees the known submission file) + a dropdown of active templates from
//      Format Templates (formatting.js). Only after the user picks a template and
//      clicks "Run" does the actual check execute against that chosen template's rules.
//      A "← Change" button on the result screen lets the user go back and re-pick.
// ─────────────────────────────────────────────────────────────────────────────

const _WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* ══════════════════════════════════════════
   SMALL UTILS
══════════════════════════════════════════ */
function _escHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ══════════════════════════════════════════
   MODAL SHOW/HIDE — self-contained fallback
   Uses window.openModal / window.closeModal when the host page
   provides them (admin pages that load formatting.js). Otherwise
   falls back to toggling display directly, so this script also
   works standalone on pages like submit-thesis.html.
══════════════════════════════════════════ */
function _dvOpenModal(id) {
    if (typeof window.openModal === 'function') {
        window.openModal(id);
        return;
    }
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}
function _dvCloseModal(id) {
    if (typeof window.closeModal === 'function') {
        window.closeModal(id);
        return;
    }
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'none';
        document.body.style.overflow = '';
    }
}
// Backward/forward-compatible global alias some pages/buttons may call directly.
window.closeDocValidationModal = () => _dvCloseModal('docValidationModal');
window._dvOpenModal = _dvOpenModal;
window._dvCloseModal = _dvCloseModal;

/* ══════════════════════════════════════════
   LAZY-LOAD DEPENDENCIES
══════════════════════════════════════════ */
const _validatorDeps = {
    loadScript(src, onload) {
        if (document.querySelector(`script[src="${src}"]`)) { onload(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = onload;
        s.onerror = () => console.warn('[Validator] Failed to load:', src);
        document.head.appendChild(s);
    },

    ensurePdfJs(cb) {
        if (window.pdfjsLib) { cb(); return; }
        this.loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
            () => {
                if (window.pdfjsLib) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                }
                cb();
            }
        );
    },

    ensureJSZip(cb) {
        if (window.JSZip) { cb(); return; }
        this.loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
            cb
        );
    },

    ensurePdfLib(cb) {
        if (window.PDFLib) { cb(); return; }
        this.loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
            cb
        );
    },
};

/* ══════════════════════════════════════════
   HELPER: Resolve an ArrayBuffer from either
   a real File object OR a plain {name, url} object
══════════════════════════════════════════ */
async function _resolveArrayBuffer(file) {
    // Real File / Blob — has .arrayBuffer() natively
    if (typeof file.arrayBuffer === 'function') {
        return file.arrayBuffer();
    }

    // Plain metadata object from API — fetch via URL
    if (file.url) {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`Failed to fetch file (HTTP ${res.status})`);
        return res.arrayBuffer();
    }

    throw new Error('file.arrayBuffer is not a function and no URL available');
}

/* ══════════════════════════════════════════
   INDICATOR DICTIONARIES
══════════════════════════════════════════ */
const _THESIS_SIGNALS = {
    structural: [
        'chapter 1', 'chapter 2', 'chapter 3', 'chapter 4', 'chapter 5',
        'background of the study', 'statement of the problem',
        'review of related literature', 'review of related studies',
        'theoretical framework', 'conceptual framework',
        'scope and limitation', 'scope and delimitation',
        'significance of the study', 'definition of terms',
        'research methodology', 'research design',
        'data gathering', 'data collection', 'data analysis',
        'findings and discussion', 'summary of findings',
        'conclusions and recommendations', 'bibliography', 'references',
    ],
    academic: [
        'this study aims', 'the purpose of this study', 'this research',
        'the researchers', 'this paper', 'proposed system', 'capstone project',
        'the proponents', 'general objective', 'specific objective',
        'null hypothesis', 'alternative hypothesis', 'hypothesis',
        'respondents', 'locale of the study', 'population and sample',
        'instrument used', 'statistical treatment', 'weighted mean',
        'likert scale', 'related literature', 'related studies',
        'norzagaray college', 'college of computing',
    ],
    weak: [
        'introduction', 'abstract', 'methodology', 'conclusion',
        'recommendation', 'acknowledgment', 'table of contents',
        'list of figures', 'list of tables', 'appendix', 'appendices',
        'adviser', 'panel of examiners', 'thesis title',
    ],
};

const _INVALID_SIGNALS = {
    definite: [
        'official receipt', 'payment receipt', 'total amount',
        'gcash ref', 'transaction id', 'txn-', 'invoice no',
        'amount due', 'balance due', 'grand total',
        'certificate of', 'this is to certify that',
        'barangay clearance', 'police clearance', 'nbi clearance',
        'birth certificate', 'marriage certificate',
        'philhealth', 'sss contribution', 'bir form',
        'purchase order', 'delivery receipt', 'sales invoice',
    ],
    likely: [
        'dear sir', 'dear ma\'am', 'to whom it may concern',
        'sincerely yours', 'respectfully yours', 'yours truly',
        'student id', 'employee id', 'id number',
        'reference number', 'ref #', 'or number',
        'paid', 'unpaid', 'balance', 'payment method',
        'cash', 'gcash', 'maya', 'bank transfer',
    ],
};

const _DOC_TYPE_LABELS = {
    thesis: { label: 'Thesis / Research Paper', icon: '📄', color: '#22c55e' },
    capstone: { label: 'Capstone / IT Project', icon: '💻', color: '#3b82f6' },
    receipt: { label: 'Payment Receipt', icon: '🧾', color: '#ef4444' },
    certificate: { label: 'Certificate / Clearance', icon: '📜', color: '#ef4444' },
    letter: { label: 'Letter / Correspondence', icon: '✉️', color: '#f59e0b' },
    unknown: { label: 'Unknown Document', icon: '❓', color: '#888' },
    unreadable: { label: 'Unreadable / Image-only PDF', icon: '🖼️', color: '#f59e0b' },
};

/* ══════════════════════════════════════════
   TEXT EXTRACTION
══════════════════════════════════════════ */

async function _extractPdfText(file) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensurePdfJs(async () => {
            if (!window.pdfjsLib) { reject(new Error('pdf.js unavailable')); return; }
            try {
                const arrayBuffer = await _resolveArrayBuffer(file);
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const maxPages = Math.min(pdf.numPages, 15);
                let text = '';
                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(s => s.str).join(' ') + '\n';
                }
                resolve({ text, pages: pdf.numPages });
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function _extractDocxText(file) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensureJSZip(async () => {
            if (!window.JSZip) { reject(new Error('JSZip unavailable')); return; }
            try {
                const arrayBuffer = await _resolveArrayBuffer(file);
                const zip = await JSZip.loadAsync(arrayBuffer);
                const xmlFile = zip.file('word/document.xml');
                if (!xmlFile) { reject(new Error('Not a valid DOCX')); return; }
                const xmlStr = await xmlFile.async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
                const textNodes = xmlDoc.getElementsByTagNameNS(_WORD_NS, 't');
                const text = Array.from(textNodes).map(n => n.textContent).join(' ');
                resolve({ text, pages: null });
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function _extractFileText(file) {
    // Resolve the file name from either a real File or a plain {name, url} object
    const name = (typeof file.name === 'string' ? file.name : '') || '';
    const ext = name.split('.').pop().toLowerCase();

    if (ext === 'pdf') return _extractPdfText(file);
    if (ext === 'docx') return _extractDocxText(file);
    if (ext === 'doc') return { text: '', pages: null, unsupported: true };
    return { text: '', pages: null, unsupported: true };
}

/* ══════════════════════════════════════════
   REAL FORMATTING ANALYSIS
   (spacing / margins / indentation / alignment)

   DOCX is parsed directly from word/document.xml — exact values.
   PDF has no structural markup, so spacing/margins/indentation are ESTIMATED
   from raw text-item positions. Anything derived this way is flagged
   `estimated: true` and surfaced as "estimated — verify manually".
══════════════════════════════════════════ */

const _TWIPS_PER_INCH = 1440;
const _POINTS_PER_INCH = 72;

const _RULE_TOLERANCE_DEFAULTS = {
    spacing: 0.1,       // +/- 0.1 line-height multiplier
    indentation: 0.06,  // +/- 0.06 inch
    margin: 0.08,       // +/- 0.08 inch per side
};

// Sensible thesis-format defaults, used when no template is selected.
const _DEFAULT_FORMAT_RULES = [
    { id: 'default-spacing', name: 'Line Spacing', type: 'spacing', value: 1.5, detail: 'Body text should use 1.5 line spacing.' },
    { id: 'default-margin', name: 'Page Margins', type: 'margin', value: { top: 1, bottom: 1, left: 1.5, right: 1 }, detail: 'Standard thesis margins (inches) — 1.5" on the binding side.' },
    { id: 'default-indent', name: 'First-line Indent', type: 'indentation', value: 0.5, detail: 'Paragraphs should start with a 0.5" first-line indent.' },
    { id: 'default-align', name: 'Paragraph Alignment', type: 'alignment', value: 'justified', detail: 'Body text should be justified.' },
];

const _TEMPLATE_STORAGE_KEY = 'aidea_format_templates';

// All templates the admin has marked Active — used to populate the picker dropdown.
function _getActiveFormatTemplates() {
    try {
        const all = JSON.parse(localStorage.getItem(_TEMPLATE_STORAGE_KEY) || '[]');
        return all.filter(t => t && t.active);
    } catch (e) {
        console.warn('[Validator] Could not read admin templates:', e);
        return [];
    }
}

// Resolves the rule set to actually check the file against.
// If `templateId` is given (student/admin picked a specific template in the
// picker step), that template's rules are used. Otherwise falls back to the
// first active template with rules, then to the built-in defaults.
function _getFormatRules(templateId) {
    try {
        const templates = JSON.parse(localStorage.getItem(_TEMPLATE_STORAGE_KEY) || '[]');

        if (templateId != null && templateId !== '') {
            const chosen = templates.find(t => t && String(t.id) === String(templateId));
            if (chosen) {
                const rules = (Array.isArray(chosen.rules) && chosen.rules.length) ? chosen.rules : _DEFAULT_FORMAT_RULES;
                return { rules, source: chosen.name || 'Selected Template', template: chosen };
            }
        }

        const active = templates.find(t => t && t.active && Array.isArray(t.rules) && t.rules.length);
        if (active) return { rules: active.rules, source: active.name || 'Admin Template', template: active };
    } catch (e) {
        console.warn('[Validator] Could not read admin templates, using defaults:', e);
    }
    return { rules: _DEFAULT_FORMAT_RULES, source: 'Default Thesis Format', template: null };
}

function _alignNormalize(val) {
    if (!val) return null;
    const v = String(val).toLowerCase();
    if (['justify', 'justified', 'both'].includes(v)) return 'justified';
    if (['left', 'start'].includes(v)) return 'left';
    if (['right', 'end'].includes(v)) return 'right';
    if (v === 'center' || v === 'centre') return 'center';
    return v;
}

/* ---------- DOCX: exact formatting from document.xml ---------- */
async function _extractDocxFormatting(file) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensureJSZip(async () => {
            if (!window.JSZip) { reject(new Error('JSZip unavailable')); return; }
            try {
                const arrayBuffer = await _resolveArrayBuffer(file);
                const zip = await JSZip.loadAsync(arrayBuffer);
                const xmlFile = zip.file('word/document.xml');
                if (!xmlFile) { reject(new Error('Not a valid DOCX')); return; }
                const xmlStr = await xmlFile.async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

                let margins = null;
                const sectPrs = xmlDoc.getElementsByTagNameNS(_WORD_NS, 'sectPr');
                if (sectPrs.length) {
                    const sectPr = sectPrs[sectPrs.length - 1];
                    const pgMarEls = sectPr.getElementsByTagNameNS(_WORD_NS, 'pgMar');
                    if (pgMarEls.length) {
                        const pgMar = pgMarEls[0];
                        const get = attr => {
                            const v = pgMar.getAttributeNS(_WORD_NS, attr);
                            return v ? parseFloat(v) / _TWIPS_PER_INCH : null;
                        };
                        margins = { top: get('top'), bottom: get('bottom'), left: get('left'), right: get('right') };
                    }
                }

                const paragraphs = [];
                const pEls = xmlDoc.getElementsByTagNameNS(_WORD_NS, 'p');
                for (let i = 0; i < pEls.length; i++) {
                    const p = pEls[i];
                    const tNodes = p.getElementsByTagNameNS(_WORD_NS, 't');
                    const text = Array.from(tNodes).map(n => n.textContent).join('').trim();
                    if (!text) continue;

                    const pPrList = p.getElementsByTagNameNS(_WORD_NS, 'pPr');
                    const pPr = pPrList.length ? pPrList[0] : null;

                    let lineSpacing = null, lineRule = null;
                    let firstLineIndent = null;
                    let alignment = null;

                    if (pPr) {
                        const spacingEls = pPr.getElementsByTagNameNS(_WORD_NS, 'spacing');
                        if (spacingEls.length) {
                            const sp = spacingEls[0];
                            const lineVal = sp.getAttributeNS(_WORD_NS, 'line');
                            lineRule = sp.getAttributeNS(_WORD_NS, 'lineRule') || 'auto';
                            if (lineVal) {
                                lineSpacing = lineRule === 'auto'
                                    ? +(parseFloat(lineVal) / 240).toFixed(2)
                                    : +(parseFloat(lineVal) / 20).toFixed(1); // atLeast/exact -> points
                            }
                        }
                        const indEls = pPr.getElementsByTagNameNS(_WORD_NS, 'ind');
                        if (indEls.length) {
                            const ind = indEls[0];
                            const firstLine = ind.getAttributeNS(_WORD_NS, 'firstLine');
                            const hanging = ind.getAttributeNS(_WORD_NS, 'hanging');
                            if (firstLine) firstLineIndent = +(parseFloat(firstLine) / _TWIPS_PER_INCH).toFixed(2);
                            else if (hanging) firstLineIndent = +(-parseFloat(hanging) / _TWIPS_PER_INCH).toFixed(2);
                        }
                        const jcEls = pPr.getElementsByTagNameNS(_WORD_NS, 'jc');
                        if (jcEls.length) {
                            alignment = _alignNormalize(jcEls[0].getAttributeNS(_WORD_NS, 'val'));
                        }
                    }

                    paragraphs.push({
                        index: i,
                        snippet: text.slice(0, 70) + (text.length > 70 ? '…' : ''),
                        lineSpacing, lineRule,
                        firstLineIndent, alignment,
                    });
                }

                resolve({ source: 'docx', estimated: false, margins, paragraphs });
            } catch (e) {
                reject(e);
            }
        });
    });
}

/* ---------- PDF: heuristic formatting from text-item positions ---------- */
async function _extractPdfFormatting(file) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensurePdfJs(async () => {
            if (!window.pdfjsLib) { reject(new Error('pdf.js unavailable')); return; }
            try {
                const arrayBuffer = await _resolveArrayBuffer(file);
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const maxPages = Math.min(pdf.numPages, 8);
                const paragraphs = [];
                const marginSamples = { left: [], right: [], top: [], bottom: [] };

                for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 1 });
                    const pageWidthIn = viewport.width / _POINTS_PER_INCH;
                    const pageHeightIn = viewport.height / _POINTS_PER_INCH;
                    const content = await page.getTextContent();

                    const items = content.items
                        .filter(it => it.str && it.str.trim())
                        .map(it => ({
                            str: it.str,
                            x: it.transform[4],
                            y: it.transform[5],
                            fontSize: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
                        }));
                    if (!items.length) continue;

                    items.sort((a, b) => b.y - a.y || a.x - b.x);
                    const lines = [];
                    let current = null;
                    const Y_TOL = 2;
                    items.forEach(it => {
                        if (current && Math.abs(current.y - it.y) <= Y_TOL) {
                            current.items.push(it);
                        } else {
                            current = { y: it.y, items: [it] };
                            lines.push(current);
                        }
                    });

                    const xs = items.map(it => it.x);
                    const ys = items.map(it => it.y);
                    marginSamples.left.push(Math.min(...xs) / _POINTS_PER_INCH);
                    marginSamples.right.push(pageWidthIn - Math.max(...xs) / _POINTS_PER_INCH);
                    marginSamples.top.push(pageHeightIn - Math.max(...ys) / _POINTS_PER_INCH);
                    marginSamples.bottom.push(Math.min(...ys) / _POINTS_PER_INCH);

                    for (let li = 1; li < lines.length; li++) {
                        const prev = lines[li - 1], cur = lines[li];
                        const fontSize = cur.items[0].fontSize || 10;
                        const deltaY = Math.abs(prev.y - cur.y);
                        const lineSpacing = fontSize ? +(deltaY / fontSize).toFixed(2) : null;
                        const lineStartX = cur.items[0].x;
                        const text = cur.items.map(it => it.str).join('').trim();
                        if (!text) continue;
                        paragraphs.push({
                            index: paragraphs.length,
                            page: pageNum,
                            y: cur.y,
                            height: fontSize,
                            snippet: text.slice(0, 70) + (text.length > 70 ? '…' : ''),
                            text,
                            lineSpacing,
                            lineStartX,
                        });
                    }
                }

                const avg = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
                const margins = {
                    left: avg(marginSamples.left), right: avg(marginSamples.right),
                    top: avg(marginSamples.top), bottom: avg(marginSamples.bottom),
                };

                const typicalLeftX = margins.left != null ? margins.left * _POINTS_PER_INCH : null;
                paragraphs.forEach(p => {
                    if (typicalLeftX != null && p.lineStartX != null) {
                        const deltaIn = (p.lineStartX - typicalLeftX) / _POINTS_PER_INCH;
                        p.firstLineIndent = deltaIn > 0.15 ? +deltaIn.toFixed(2) : 0;
                    }
                });

                resolve({ source: 'pdf', estimated: true, margins, paragraphs });
            } catch (e) {
                reject(e);
            }
        });
    });
}

async function _extractFormattingProfile(file) {
    const name = (typeof file.name === 'string' ? file.name : '') || '';
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'docx') return _extractDocxFormatting(file);
    if (ext === 'pdf') return _extractPdfFormatting(file);
    return null; // .doc or unsupported — no structural check possible
}

function _evaluateFormattingRule(rule, profile) {
    if (!profile) return null;

    const type = (rule.type || '').toLowerCase();
    const tolerance = typeof rule.tolerance === 'number' ? rule.tolerance : _RULE_TOLERANCE_DEFAULTS[type];

    if (type === 'spacing') {
        const target = parseFloat(rule.value);
        if (Number.isNaN(target)) return null;
        const checked = profile.paragraphs.filter(p => p.lineSpacing != null);
        if (!checked.length) return { status: 'manual', violations: [], checkedCount: 0 };
        const violations = checked
            .filter(p => Math.abs(p.lineSpacing - target) > tolerance)
            .map(p => ({ ...p, actual: p.lineSpacing }));
        return { status: violations.length ? 'fail' : 'pass', violations, checkedCount: checked.length, target, unit: 'x line height' };
    }

    if (type === 'indentation') {
        const target = parseFloat(rule.value);
        if (Number.isNaN(target)) return null;
        const checked = profile.paragraphs.filter(p => p.firstLineIndent != null);
        if (!checked.length) return { status: 'manual', violations: [], checkedCount: 0 };
        const violations = checked
            .filter(p => Math.abs(p.firstLineIndent - target) > tolerance)
            .map(p => ({ ...p, actual: p.firstLineIndent }));
        return { status: violations.length ? 'fail' : 'pass', violations, checkedCount: checked.length, target, unit: 'in' };
    }

    if (type === 'alignment') {
        const target = _alignNormalize(rule.value);
        if (!target) return null;
        const checked = profile.paragraphs.filter(p => p.alignment);
        if (!checked.length) return { status: 'manual', violations: [], checkedCount: 0 };
        const violations = checked
            .filter(p => p.alignment !== target)
            .map(p => ({ ...p, actual: p.alignment }));
        return { status: violations.length ? 'fail' : 'pass', violations, checkedCount: checked.length, target };
    }

    if (type === 'margin') {
        if (!profile.margins) return { status: 'manual', violations: [], checkedCount: 0 };
        const targets = (rule.value && typeof rule.value === 'object')
            ? rule.value
            : { top: rule.value, bottom: rule.value, left: rule.value, right: rule.value };
        const violations = [];
        ['top', 'bottom', 'left', 'right'].forEach(side => {
            const t = parseFloat(targets[side]);
            const actual = profile.margins[side];
            if (Number.isNaN(t) || actual == null) return;
            if (Math.abs(actual - t) > tolerance) {
                violations.push({ side, target: t, actual: +actual.toFixed(2) });
            }
        });
        return { status: violations.length ? 'fail' : 'pass', violations, checkedCount: 4, isMargin: true };
    }

    return null;
}

function _dvComputeFlatViolations(rules, formattingProfile) {
    const flat = [];
    if (!formattingProfile) return flat;
    rules.forEach(r => {
        const ev = _evaluateFormattingRule(r, formattingProfile);
        if (ev && ev.status === 'fail' && !ev.isMargin) {
            ev.violations.forEach(v => {
                flat.push({
                    ruleName: r.name, type: r.type, target: ev.target, unit: ev.unit,
                    actual: v.actual, index: v.index, page: v.page, snippet: v.snippet,
                    y: v.y, height: v.height,
                });
            });
        }
    });
    return flat;
}

/* ══════════════════════════════════════════
   REDLINE / AUTO-FIX FILE GENERATION
══════════════════════════════════════════ */

function _dvBaseName(name) {
    return (name || 'document').replace(/\.[^/.]+$/, '');
}

function _dvTriggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function _dvWrapText(text, font, size, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);
    return lines;
}

/* ---------- DOCX: redlined copy (highlight + inline red note) ---------- */
function _dvBuildNoteParagraph(xmlDoc, text) {
    const p = xmlDoc.createElementNS(_WORD_NS, 'w:p');
    const r = xmlDoc.createElementNS(_WORD_NS, 'w:r');
    const rPr = xmlDoc.createElementNS(_WORD_NS, 'w:rPr');
    const color = xmlDoc.createElementNS(_WORD_NS, 'w:color');
    color.setAttributeNS(_WORD_NS, 'w:val', 'FF0000');
    const bold = xmlDoc.createElementNS(_WORD_NS, 'w:b');
    const italic = xmlDoc.createElementNS(_WORD_NS, 'w:i');
    rPr.appendChild(color); rPr.appendChild(bold); rPr.appendChild(italic);
    r.appendChild(rPr);
    const t = xmlDoc.createElementNS(_WORD_NS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = text;
    r.appendChild(t);
    p.appendChild(r);
    return p;
}

function _dvApplyHighlight(xmlDoc, pEl) {
    let pPrList = pEl.getElementsByTagNameNS(_WORD_NS, 'pPr');
    let pPr;
    if (pPrList.length) {
        pPr = pPrList[0];
    } else {
        pPr = xmlDoc.createElementNS(_WORD_NS, 'w:pPr');
        pEl.insertBefore(pPr, pEl.firstChild);
    }
    Array.from(pPr.getElementsByTagNameNS(_WORD_NS, 'shd')).forEach(s => pPr.removeChild(s));
    const shd = xmlDoc.createElementNS(_WORD_NS, 'w:shd');
    shd.setAttributeNS(_WORD_NS, 'w:val', 'clear');
    shd.setAttributeNS(_WORD_NS, 'w:color', 'auto');
    shd.setAttributeNS(_WORD_NS, 'w:fill', 'FFF3B0');
    pPr.appendChild(shd);
}

async function _dvGenerateRedlinedDocx(file, violationsByParagraph) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensureJSZip(async () => {
            if (!window.JSZip) { reject(new Error('JSZip unavailable')); return; }
            try {
                const arrayBuffer = await _resolveArrayBuffer(file);
                const zip = await JSZip.loadAsync(arrayBuffer);
                const xmlFile = zip.file('word/document.xml');
                if (!xmlFile) { reject(new Error('Not a valid DOCX')); return; }
                const xmlStr = await xmlFile.async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
                const pEls = Array.from(xmlDoc.getElementsByTagNameNS(_WORD_NS, 'p'));

                violationsByParagraph.forEach((notes, idx) => {
                    const pEl = pEls[idx];
                    if (!pEl) return;
                    _dvApplyHighlight(xmlDoc, pEl);
                    notes.forEach(noteText => {
                        const noteP = _dvBuildNoteParagraph(xmlDoc, '⚠ ' + noteText);
                        pEl.parentNode.insertBefore(noteP, pEl.nextSibling);
                    });
                });

                const serializer = new XMLSerializer();
                const newXmlStr = serializer.serializeToString(xmlDoc);
                zip.file('word/document.xml', newXmlStr);
                const blob = await zip.generateAsync({ type: 'blob' });
                resolve(blob);
            } catch (e) { reject(e); }
        });
    });
}

/* ---------- DOCX: auto-fixed copy (rewrites pPr/sectPr to target values) ---------- */
async function _dvGenerateFixedDocx(file, rules, formattingProfile) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensureJSZip(async () => {
            if (!window.JSZip) { reject(new Error('JSZip unavailable')); return; }
            try {
                const arrayBuffer = await _resolveArrayBuffer(file);
                const zip = await JSZip.loadAsync(arrayBuffer);
                const xmlFile = zip.file('word/document.xml');
                if (!xmlFile) { reject(new Error('Not a valid DOCX')); return; }
                const xmlStr = await xmlFile.async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
                const pEls = Array.from(xmlDoc.getElementsByTagNameNS(_WORD_NS, 'p'));
                const profileByIndex = new Map((formattingProfile.paragraphs || []).map(p => [p.index, p]));

                const structuralRules = rules.filter(r => ['spacing', 'indentation', 'alignment'].includes((r.type || '').toLowerCase()));

                structuralRules.forEach(rule => {
                    const type = rule.type.toLowerCase();
                    profileByIndex.forEach((_pData, idx) => {
                        const pEl = pEls[idx];
                        if (!pEl) return;
                        let pPrList = pEl.getElementsByTagNameNS(_WORD_NS, 'pPr');
                        let pPr = pPrList.length ? pPrList[0] : null;
                        if (!pPr) {
                            pPr = xmlDoc.createElementNS(_WORD_NS, 'w:pPr');
                            pEl.insertBefore(pPr, pEl.firstChild);
                        }
                        if (type === 'spacing') {
                            const target = parseFloat(rule.value);
                            if (Number.isNaN(target)) return;
                            Array.from(pPr.getElementsByTagNameNS(_WORD_NS, 'spacing')).forEach(s => pPr.removeChild(s));
                            const sp = xmlDoc.createElementNS(_WORD_NS, 'w:spacing');
                            sp.setAttributeNS(_WORD_NS, 'w:line', String(Math.round(target * 240)));
                            sp.setAttributeNS(_WORD_NS, 'w:lineRule', 'auto');
                            pPr.appendChild(sp);
                        } else if (type === 'indentation') {
                            const target = parseFloat(rule.value);
                            if (Number.isNaN(target)) return;
                            Array.from(pPr.getElementsByTagNameNS(_WORD_NS, 'ind')).forEach(s => pPr.removeChild(s));
                            const ind = xmlDoc.createElementNS(_WORD_NS, 'w:ind');
                            ind.setAttributeNS(_WORD_NS, 'w:firstLine', String(Math.round(target * _TWIPS_PER_INCH)));
                            pPr.appendChild(ind);
                        } else if (type === 'alignment') {
                            const target = _alignNormalize(rule.value);
                            if (!target) return;
                            const jcVal = target === 'justified' ? 'both' : target;
                            Array.from(pPr.getElementsByTagNameNS(_WORD_NS, 'jc')).forEach(s => pPr.removeChild(s));
                            const jc = xmlDoc.createElementNS(_WORD_NS, 'w:jc');
                            jc.setAttributeNS(_WORD_NS, 'w:val', jcVal);
                            pPr.appendChild(jc);
                        }
                    });
                });

                const marginRule = rules.find(r => (r.type || '').toLowerCase() === 'margin');
                if (marginRule) {
                    const sectPrs = xmlDoc.getElementsByTagNameNS(_WORD_NS, 'sectPr');
                    if (sectPrs.length) {
                        const sectPr = sectPrs[sectPrs.length - 1];
                        let pgMarEls = sectPr.getElementsByTagNameNS(_WORD_NS, 'pgMar');
                        let pgMar = pgMarEls.length ? pgMarEls[0] : null;
                        if (!pgMar) {
                            pgMar = xmlDoc.createElementNS(_WORD_NS, 'w:pgMar');
                            sectPr.appendChild(pgMar);
                        }
                        const targets = (marginRule.value && typeof marginRule.value === 'object')
                            ? marginRule.value
                            : { top: marginRule.value, bottom: marginRule.value, left: marginRule.value, right: marginRule.value };
                        ['top', 'bottom', 'left', 'right'].forEach(side => {
                            const t = parseFloat(targets[side]);
                            if (Number.isNaN(t)) return;
                            pgMar.setAttributeNS(_WORD_NS, 'w:' + side, String(Math.round(t * _TWIPS_PER_INCH)));
                        });
                    }
                }

                const serializer = new XMLSerializer();
                const newXmlStr = serializer.serializeToString(xmlDoc);
                zip.file('word/document.xml', newXmlStr);
                const blob = await zip.generateAsync({ type: 'blob' });
                resolve(blob);
            } catch (e) { reject(e); }
        });
    });
}

/* ---------- PDF: redlined copy (highlight overlay + numbered legend page) ---------- */
async function _dvGenerateRedlinedPdf(file, violations) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensurePdfLib(async () => {
            if (!window.PDFLib) { reject(new Error('pdf-lib unavailable')); return; }
            try {
                const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
                const arrayBuffer = await _resolveArrayBuffer(file);
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
                const pages = pdfDoc.getPages();

                let counter = 0;
                const legend = [];
                violations.forEach(v => {
                    if (!v.page || v.y == null) return;
                    const page = pages[v.page - 1];
                    if (!page) return;
                    counter++;
                    const h = (v.height || 10) * 1.3;
                    page.drawRectangle({
                        x: 40, y: v.y - h * 0.25, width: page.getWidth() - 80, height: h,
                        color: rgb(1, 0.93, 0.55), opacity: 0.45,
                    });
                    page.drawText(String(counter), {
                        x: 12, y: v.y, size: 9, font: boldFont, color: rgb(0.85, 0.1, 0.1),
                    });
                    legend.push(`${counter}. p.${v.page} — ${v.ruleName}: expected ${v.target}${v.unit ? ' ' + v.unit : ''}, found ${v.actual}. "${v.snippet}"`);
                });

                if (legend.length) {
                    let summaryPage = pdfDoc.addPage();
                    const { width, height } = summaryPage.getSize();
                    let y = height - 50;
                    summaryPage.drawText('Formatting Issues — Summary', { x: 50, y, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
                    y -= 26;
                    legend.forEach(line => {
                        const wrapped = _dvWrapText(line, regularFont, 10, width - 100);
                        wrapped.forEach(w => {
                            if (y < 40) {
                                summaryPage = pdfDoc.addPage();
                                y = height - 50;
                            }
                            summaryPage.drawText(w, { x: 50, y, size: 10, font: regularFont, color: rgb(0.5, 0, 0) });
                            y -= 14;
                        });
                        y -= 4;
                    });
                }

                const bytes = await pdfDoc.save();
                resolve(new Blob([bytes], { type: 'application/pdf' }));
            } catch (e) { reject(e); }
        });
    });
}

/* ---------- PDF: auto-fixed copy (re-typeset from extracted text — see disclaimer) ---------- */
function _dvDrawLine(page, font, words, x0, y, size, usableWidth, indent, align, isLastLine, color) {
    const lineText = words.join(' ');
    const naturalWidth = font.widthOfTextAtSize(lineText, size);
    const avail = usableWidth - indent;

    if (align === 'center') {
        const offset = Math.max(0, (avail - naturalWidth) / 2);
        page.drawText(lineText, { x: x0 + indent + offset, y, size, font, color });
    } else if (align === 'right') {
        const offset = Math.max(0, avail - naturalWidth);
        page.drawText(lineText, { x: x0 + indent + offset, y, size, font, color });
    } else if (align === 'justified' && !isLastLine && words.length > 1) {
        const spaceWidth = font.widthOfTextAtSize(' ', size);
        const wordsWidth = words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, size), 0);
        const gaps = words.length - 1;
        const extra = Math.max(0, avail - wordsWidth - spaceWidth * gaps);
        const gapWidth = spaceWidth + extra / gaps;
        let x = x0 + indent;
        words.forEach(w => {
            page.drawText(w, { x, y, size, font, color });
            x += font.widthOfTextAtSize(w, size) + gapWidth;
        });
    } else {
        page.drawText(lineText, { x: x0 + indent, y, size, font, color });
    }
}

async function _dvGenerateFixedPdf(file, rules, formattingProfile) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensurePdfLib(async () => {
            if (!window.PDFLib) { reject(new Error('pdf-lib unavailable')); return; }
            try {
                const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

                const spacingRule = rules.find(r => (r.type || '').toLowerCase() === 'spacing');
                const indentRule = rules.find(r => (r.type || '').toLowerCase() === 'indentation');
                const alignRule = rules.find(r => (r.type || '').toLowerCase() === 'alignment');
                const marginRule = rules.find(r => (r.type || '').toLowerCase() === 'margin');

                const lineSpacingMult = spacingRule ? parseFloat(spacingRule.value) || 1.5 : 1.5;
                const firstLineIndentIn = indentRule ? parseFloat(indentRule.value) || 0.5 : 0.5;
                const alignment = alignRule ? (_alignNormalize(alignRule.value) || 'left') : 'left';
                const marginTargets = marginRule
                    ? ((marginRule.value && typeof marginRule.value === 'object') ? marginRule.value : { top: marginRule.value, bottom: marginRule.value, left: marginRule.value, right: marginRule.value })
                    : { top: 1, bottom: 1, left: 1, right: 1 };

                const fontSizePt = 12;
                const pageWidthPt = 8.5 * _POINTS_PER_INCH;
                const pageHeightPt = 11 * _POINTS_PER_INCH;
                const marginLeftPt = (parseFloat(marginTargets.left) || 1) * _POINTS_PER_INCH;
                const marginRightPt = (parseFloat(marginTargets.right) || 1) * _POINTS_PER_INCH;
                const marginTopPt = (parseFloat(marginTargets.top) || 1) * _POINTS_PER_INCH;
                const marginBottomPt = (parseFloat(marginTargets.bottom) || 1) * _POINTS_PER_INCH;
                const usableWidth = pageWidthPt - marginLeftPt - marginRightPt;
                const lineHeightPt = fontSizePt * lineSpacingMult;

                const pdfDoc = await PDFDocument.create();
                const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
                const black = rgb(0, 0, 0);
                const gray = rgb(0.5, 0.5, 0.5);

                let page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
                let y = pageHeightPt - marginTopPt;

                const disclaimerLines = _dvWrapText(
                    'Auto-generated, re-typeset copy for formatting reference only. Original layout, images, tables, and fonts are not preserved — use this to check spacing, margins, indentation, and alignment only.',
                    font, 8, usableWidth
                );
                disclaimerLines.forEach(l => {
                    page.drawText(l, { x: marginLeftPt, y, size: 8, font, color: gray });
                    y -= 10;
                });
                y -= 10;

                const sourceLines = (formattingProfile.paragraphs || []).map(p => p.text || p.snippet);

                sourceLines.forEach(paraText => {
                    const words = (paraText || '').split(/\s+/).filter(Boolean);
                    if (!words.length) return;

                    const rawLines = [];
                    let cur = [];
                    let firstLineFlag = true;
                    words.forEach(word => {
                        const indent = firstLineFlag ? firstLineIndentIn * _POINTS_PER_INCH : 0;
                        const testWords = [...cur, word];
                        const testWidth = font.widthOfTextAtSize(testWords.join(' '), fontSizePt);
                        if (testWidth > usableWidth - indent && cur.length) {
                            rawLines.push({ words: cur, indent, isFirst: firstLineFlag });
                            firstLineFlag = false;
                            cur = [word];
                        } else {
                            cur = testWords;
                        }
                    });
                    if (cur.length) rawLines.push({ words: cur, indent: firstLineFlag ? firstLineIndentIn * _POINTS_PER_INCH : 0, isFirst: firstLineFlag });

                    rawLines.forEach((ln, li) => {
                        if (y < marginBottomPt + lineHeightPt) {
                            page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
                            y = pageHeightPt - marginTopPt;
                        }
                        const isLastLine = li === rawLines.length - 1;
                        _dvDrawLine(page, font, ln.words, marginLeftPt, y, fontSizePt, usableWidth, ln.indent, alignment, isLastLine, black);
                        y -= lineHeightPt;
                    });
                    y -= lineHeightPt * 0.4;
                });

                const bytes = await pdfDoc.save();
                resolve(new Blob([bytes], { type: 'application/pdf' }));
            } catch (e) { reject(e); }
        });
    });
}

/* ══════════════════════════════════════════
   SCORING ENGINE
══════════════════════════════════════════ */

function _scoreDocument(text, pages) {
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    let thesisScore = 0;
    let invalidScore = 0;
    const thesisHits = [];
    const invalidHits = [];

    _THESIS_SIGNALS.structural.forEach(phrase => {
        if (lower.includes(phrase)) { thesisScore += 3; thesisHits.push({ phrase, weight: 3 }); }
    });
    _THESIS_SIGNALS.academic.forEach(phrase => {
        if (lower.includes(phrase)) { thesisScore += 2; thesisHits.push({ phrase, weight: 2 }); }
    });
    _THESIS_SIGNALS.weak.forEach(phrase => {
        if (lower.includes(phrase)) { thesisScore += 1; thesisHits.push({ phrase, weight: 1 }); }
    });

    _INVALID_SIGNALS.definite.forEach(phrase => {
        if (lower.includes(phrase)) { invalidScore += 5; invalidHits.push({ phrase, weight: 5 }); }
    });
    _INVALID_SIGNALS.likely.forEach(phrase => {
        if (lower.includes(phrase)) { invalidScore += 3; invalidHits.push({ phrase, weight: 3 }); }
    });

    const wordCountOk = wordCount >= 500;
    if (!wordCountOk) invalidScore += 10;
    if (pages === 1) invalidScore += 5;

    let docType = 'unknown';
    if (invalidScore >= 8 && invalidScore > thesisScore) {
        const lowerHits = invalidHits.map(h => h.phrase);
        if (lowerHits.some(p => ['official receipt', 'payment receipt', 'gcash ref', 'total amount', 'txn-', 'or number'].includes(p))) {
            docType = 'receipt';
        } else if (lowerHits.some(p => ['certificate of', 'this is to certify that', 'barangay clearance', 'birth certificate'].includes(p))) {
            docType = 'certificate';
        } else if (lowerHits.some(p => ['dear sir', "dear ma'am", 'to whom it may concern', 'sincerely yours', 'respectfully yours'].includes(p))) {
            docType = 'letter';
        } else {
            docType = 'unknown';
        }
    } else if (thesisScore >= 6) {
        const capstoneKeywords = ['source code', 'system design', 'user manual', 'entity relationship', 'use case', 'database design', 'proposed system'];
        docType = capstoneKeywords.some(k => lower.includes(k)) ? 'capstone' : 'thesis';
    } else if (thesisScore > 0 && thesisScore > invalidScore) {
        docType = 'thesis';
    }

    const total = thesisScore + invalidScore;
    const winningScore = Math.max(thesisScore, invalidScore);
    const confidence = total === 0 ? 0 : Math.round((winningScore / total) * 100);
    const valid = ['thesis', 'capstone'].includes(docType);

    return { valid, docType, confidence, thesisScore, invalidScore, wordCount, pages, thesisHits: thesisHits.slice(0, 8), invalidHits: invalidHits.slice(0, 8), wordCountOk };
}

/* ══════════════════════════════════════════
   MAIN VALIDATOR API
══════════════════════════════════════════ */

window.validateThesisFile = async function (file) {
    if (!file) {
        return { valid: false, docType: 'unknown', confidence: 0, error: 'No file provided.' };
    }

    const fileName = (typeof file.name === 'string' ? file.name : '') || '';
    const ext = fileName.split('.').pop().toLowerCase();

    if (!['pdf', 'doc', 'docx'].includes(ext)) {
        return { valid: false, docType: 'unknown', confidence: 100, error: `Unsupported file type: .${ext}` };
    }

    let extracted;
    try {
        extracted = await _extractFileText(file);
    } catch (e) {
        return { valid: false, docType: 'unreadable', confidence: 0, error: 'Could not read file: ' + e.message };
    }

    if (extracted.unsupported) {
        return {
            valid: null,
            docType: 'unknown',
            confidence: 0,
            wordCount: 0,
            pages: null,
            error: '.doc (legacy Word) cannot be validated client-side. Manual review recommended.',
            warning: true,
        };
    }

    const textLength = (extracted.text || '').trim().length;
    if (textLength < 50) {
        return {
            valid: false,
            docType: 'unreadable',
            confidence: 90,
            wordCount: 0,
            pages: extracted.pages,
            error: 'File appears to be an image-only or scanned PDF with no extractable text.',
            thesisScore: 0,
            invalidScore: 0,
            thesisHits: [],
            invalidHits: [],
        };
    }

    const result = _scoreDocument(extracted.text, extracted.pages);
    return { ...result, error: null };
};

/* ══════════════════════════════════════════
   PICKER STEP — choose file + which template/paper
   to check it against, before running anything.
══════════════════════════════════════════ */

// state used by the download buttons (after a check has run)
let _dvLastFile = null;
let _dvLastFormattingProfile = null;
let _dvLastRules = [];
let _dvLastFlatViolations = [];

// state used by the picker step (before a check has run)
let _dvPendingFile = null;
let _dvPendingActionLabel = null;
let _dvPendingCallback = null;
let _dvPendingMeta = null;
let _dvPendingAllowFileChange = true; // true on the student page, false on admin (file is fixed to the submission)
let _dvActiveTemplates = [];
let _dvSelectedTemplateId = null;

function _createValidationModal() {
    const modal = document.createElement('div');
    modal.id = 'docValidationModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:640px;">
            <div class="modal-header">
                <h2>🔎 Document Type & Format Check</h2>
                <button class="modal-close" onclick="window._dvCloseModal('docValidationModal')">✕</button>
            </div>
            <div class="modal-body" id="docValidationBody">
                <div class="fp-skeleton">
                    <div class="fp-skeleton-spinner"></div>
                    <div class="fp-skeleton-msg">Loading…</div>
                </div>
            </div>
            <div class="modal-footer" id="docValidationFooter">
                <button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) _dvCloseModal('docValidationModal'); });
    return modal;
}

// Renders the "pick a file (if allowed) + pick a template" step.
function _dvRenderPickerStep() {
    const body = document.getElementById('docValidationBody');
    const footer = document.getElementById('docValidationFooter');

    _dvActiveTemplates = _getActiveFormatTemplates();
    if ((_dvSelectedTemplateId == null || _dvSelectedTemplateId === '') && _dvActiveTemplates.length) {
        _dvSelectedTemplateId = _dvActiveTemplates[0].id;
    }

    const fileSectionHtml = _dvPendingAllowFileChange
        ? `
        <div class="fp-section-title">1. Upload your thesis file</div>
        <div class="dv-file-drop" id="dvFileDrop">
            <div class="file-drop-content">
                <span class="file-icon">📂</span>
                <p>Drag & drop your file here, or <label for="dvFileInput" class="file-link">browse</label></p>
                <p class="file-hint">Accepted: PDF, DOCX (Max 20MB)</p>
            </div>
            <input type="file" id="dvFileInput" accept=".pdf,.docx" hidden />
        </div>
        ${_dvPendingFile ? `
        <div class="file-preview" style="display:flex;">
            <span>📎</span>
            <span>${_escHtml(_dvPendingFile.name)} (${(_dvPendingFile.size / 1024 / 1024).toFixed(2)} MB)</span>
            <button onclick="window._dvClearPendingFile()" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:#888">✕</button>
        </div>` : ''}
        <div id="dvUploadError"></div>`
        : `
        <div class="fp-section-title">File</div>
        <div class="file-preview" style="display:flex;">
            <span>📎</span>
            <span>${_escHtml(_dvPendingFile?.name || '—')}</span>
        </div>`;

    const templatePickerHtml = _dvActiveTemplates.length
        ? `<select id="dvTemplateSelect" class="dv-select">
                ${_dvActiveTemplates.map(t =>
            `<option value="${_escHtml(String(t.id))}" ${String(t.id) === String(_dvSelectedTemplateId) ? 'selected' : ''}>${_escHtml(t.name)} — ${_escHtml(t.type)}</option>`
        ).join('')}
           </select>
           <div class="dv-template-desc" id="dvTemplateDesc"></div>`
        : `<div class="fp-notice warning">⚠️ No active format templates are available yet. Ask an admin to publish one in Format Templates — the default thesis format will be used for now.</div>`;

    body.innerHTML = `
        ${fileSectionHtml}
        <div class="dv-template-picker" style="margin-top:18px;">
            <div class="fp-section-title">2. Choose which paper / format template to check against</div>
            ${templatePickerHtml}
        </div>
    `;

    const canRun = !!_dvPendingFile;
    footer.innerHTML = `
        <button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Cancel</button>
        <button class="btn-modal-submit" id="dvRunBtn" ${canRun ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"'} onclick="window._dvRunPendingCheck()">
            Run ${_escHtml(_dvPendingActionLabel || 'Check')} →
        </button>`;

    if (_dvPendingAllowFileChange) _dvWireUploadEvents();

    const sel = document.getElementById('dvTemplateSelect');
    const descEl = document.getElementById('dvTemplateDesc');
    const updateDesc = () => {
        if (!sel || !descEl) return;
        const t = _dvActiveTemplates.find(t => String(t.id) === String(sel.value));
        descEl.textContent = t && t.description ? t.description : '';
    };
    if (sel) {
        sel.addEventListener('change', () => { _dvSelectedTemplateId = sel.value; updateDesc(); });
        updateDesc();
    }
}

function _dvWireUploadEvents() {
    const drop = document.getElementById('dvFileDrop');
    const input = document.getElementById('dvFileInput');
    if (!drop || !input) return;

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) window._dvHandleFileSelected(file);
    });
    input.addEventListener('change', () => {
        if (input.files[0]) window._dvHandleFileSelected(input.files[0]);
    });
}

window._dvHandleFileSelected = function (file) {
    const errEl = document.getElementById('dvUploadError');
    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();

    if (!['pdf', 'docx'].includes(ext)) {
        if (errEl) errEl.innerHTML = `<div class="fp-notice warning">❌ Only PDF or DOCX files are allowed.</div>`;
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        if (errEl) errEl.innerHTML = `<div class="fp-notice warning">❌ File exceeds 20MB limit.</div>`;
        return;
    }

    _dvPendingFile = file;
    _dvRenderPickerStep();
};

window._dvClearPendingFile = function () {
    _dvPendingFile = null;
    _dvRenderPickerStep();
};

// Called by the "Run …" button once a file + template are chosen.
window._dvRunPendingCheck = async function () {
    if (!_dvPendingFile) return;
    const file = _dvPendingFile;
    const actionLabel = _dvPendingActionLabel;
    const onValidCallback = _dvPendingCallback;
    const meta = _dvPendingMeta || {};
    const templateId = _dvSelectedTemplateId;
    await _dvRunFileCheck(file, actionLabel, onValidCallback, meta, templateId);
};

// Lets the user go back from the result screen to re-pick file/template.
window._dvBackToPicker = function () {
    _dvRenderPickerStep();
};

function _dvRenderRuleRow(rule, formattingProfile) {
    const evalResult = _evaluateFormattingRule(rule, formattingProfile);
    if (!evalResult) {
        return `
            <div class="dv-rule-row dv-rule-manual">
                <div class="dv-rule-top"><span>⚠️</span><span class="dv-rule-name">${_escHtml(rule.name)}</span><span class="badge badge-neutral dv-rule-type">${_escHtml(rule.type)}</span></div>
                ${rule.detail ? `<div class="dv-rule-detail">${_escHtml(rule.detail)}</div>` : ''}
                <div class="dv-rule-status">Not automatically checkable — please verify manually.</div>
            </div>`;
    }

    if (evalResult.status === 'manual') {
        return `
            <div class="dv-rule-row dv-rule-manual">
                <div class="dv-rule-top"><span>⚠️</span><span class="dv-rule-name">${_escHtml(rule.name)}</span><span class="badge badge-neutral dv-rule-type">${_escHtml(rule.type)}</span></div>
                ${rule.detail ? `<div class="dv-rule-detail">${_escHtml(rule.detail)}</div>` : ''}
                <div class="dv-rule-status">Could not be measured automatically from this file — please verify manually.</div>
            </div>`;
    }

    const icon = evalResult.status === 'pass' ? '✅' : '❌';
    const cls = evalResult.status === 'pass' ? 'dv-rule-found' : 'dv-rule-fail';
    const estimateNote = formattingProfile.estimated ? ` <span class="dv-rule-estimate">(estimated from PDF layout — verify manually)</span>` : '';

    let violationHtml = '';
    if (evalResult.status === 'fail') {
        if (evalResult.isMargin) {
            violationHtml = `<div class="dv-violations">${evalResult.violations.map(v =>
                `<div class="dv-violation-item">${_escHtml(v.side)} margin: expected ~${v.target}", found ~${v.actual}"</div>`
            ).join('')}</div>`;
        } else {
            const shown = evalResult.violations.slice(0, 5);
            const extra = evalResult.violations.length - shown.length;
            violationHtml = `<div class="dv-violations">${shown.map(v => {
                const loc = v.page ? `p.${v.page}` : `¶${v.index + 1}`;
                return `<div class="dv-violation-item"><span class="dv-violation-loc">${_escHtml(loc)}</span> "${_escHtml(v.snippet)}" — expected ${evalResult.target}${evalResult.unit ? ' ' + evalResult.unit : ''}, found ${v.actual}</div>`;
            }).join('')}${extra > 0 ? `<div class="dv-violation-item dv-violation-more">+${extra} more instance${extra === 1 ? '' : 's'}</div>` : ''}</div>`;
        }
    }

    return `
        <div class="dv-rule-row ${cls}">
            <div class="dv-rule-top"><span>${icon}</span><span class="dv-rule-name">${_escHtml(rule.name)}</span><span class="badge badge-neutral dv-rule-type">${_escHtml(rule.type)}</span></div>
            ${rule.detail ? `<div class="dv-rule-detail">${_escHtml(rule.detail)}</div>` : ''}
            <div class="dv-rule-status">
                ${evalResult.status === 'pass'
            ? `Checked ${evalResult.checkedCount} instance(s) — all within tolerance.`
            : `${evalResult.violations.length} of ${evalResult.checkedCount} checked instance(s) don't match.`}${estimateNote}
            </div>
            ${violationHtml}
        </div>`;
}

function _renderValidationResult(result, onProceed, actionLabel, formattingProfile, rules, rulesSource) {
    const body = document.getElementById('docValidationBody');
    const footer = document.getElementById('docValidationFooter');
    const typeMeta = _DOC_TYPE_LABELS[result.docType] || _DOC_TYPE_LABELS.unknown;

    const backBtn = `<button class="btn-modal-close" onclick="window._dvBackToPicker()">← Change File / Template</button>`;

    if (result.warning) {
        body.innerHTML = `
            <div class="dv-result-header" style="border-color:#f59e0b;">
                <span class="dv-type-icon">⚠️</span>
                <div>
                    <div class="dv-type-label" style="color:#fbbf24;">Legacy .doc Format</div>
                    <div class="dv-type-sub">Cannot auto-validate — manual review needed</div>
                </div>
            </div>
            <div class="fp-notice warning" style="margin-top:12px;">${_escHtml(result.error)}</div>`;
        footer.innerHTML = `
            ${backBtn}
            <button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Cancel</button>
            <button class="btn-modal-submit" style="background:#f59e0b;" onclick="window._dvCloseModal('docValidationModal');${onProceed}">
                ⚠️ Proceed Anyway
            </button>`;
        return;
    }

    if (result.error && !result.valid && result.docType === 'unreadable') {
        body.innerHTML = `
            <div class="dv-result-header" style="border-color:#ef4444;">
                <span class="dv-type-icon">${typeMeta.icon}</span>
                <div>
                    <div class="dv-type-label" style="color:#f87171;">${typeMeta.label}</div>
                    <div class="dv-type-sub">${_escHtml(result.error)}</div>
                </div>
            </div>
            <div class="fp-notice warning" style="margin-top:12px;">
                ❌ This file cannot be processed as a thesis submission.
                Please ask the student to re-submit the correct document.
            </div>`;
        footer.innerHTML = `${backBtn}<button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Close</button>`;
        return;
    }

    const total = Math.max(result.thesisScore + result.invalidScore, 1);
    const thesisPct = Math.round((result.thesisScore / total) * 100);
    const invalidPct = 100 - thesisPct;

    const thesisHitsList = result.thesisHits.length
        ? result.thesisHits.map(h => `<span class="dv-hit dv-hit-good">${_escHtml(h.phrase)}</span>`).join('')
        : '<span style="color:#666;font-size:12px;">None found</span>';
    const invalidHitsList = result.invalidHits.length
        ? result.invalidHits.map(h => `<span class="dv-hit dv-hit-bad">${_escHtml(h.phrase)}</span>`).join('')
        : '<span style="color:#666;font-size:12px;">None found</span>';

    const statusNotice = result.valid
        ? `<div class="fp-notice success">✅ Document confirmed as <strong>${typeMeta.label}</strong>. You may proceed with the ${_escHtml(actionLabel)}.</div>`
        : `<div class="fp-notice warning">
               ❌ <strong>This does not appear to be a thesis or research paper.</strong><br>
               Detected as: <strong>${typeMeta.label}</strong>. Please ask the student to submit the correct file.
           </div>`;

    // ── formatting checklist + download buttons ──
    let formattingSectionHtml;
    if (formattingProfile) {
        const ruleRowsHtml = rules.map(r => _dvRenderRuleRow(r, formattingProfile)).join('');
        let passCount = 0;
        rules.forEach(r => { const ev = _evaluateFormattingRule(r, formattingProfile); if (ev && ev.status === 'pass') passCount++; });
        const needsAttention = rules.length - passCount;
        formattingSectionHtml = `
            <div class="fp-section-title" style="margin-top:14px;">Formatting Checklist — checked against: ${_escHtml(rulesSource)}</div>
            <div class="dv-format-summary"><span style="color:#4ade80;">${passCount} passed</span> · <span style="color:#fbbf24;">${needsAttention} need attention</span>${formattingProfile.estimated ? ' · <span style="color:#fbbf24;">estimated from PDF layout</span>' : ''}</div>
            <div class="dv-rule-rows">${ruleRowsHtml}</div>
            <div class="dv-download-row">
                <button class="btn-modal-close" id="dvRedlineBtn" onclick="window._dvDownloadRedline()">📥 Download Redlined Copy (shows errors)</button>
                <button class="btn-modal-close" id="dvFixedBtn" onclick="window._dvDownloadFixed()">📥 Download Auto-Fixed Copy (aligned to template)</button>
            </div>`;
    } else {
        formattingSectionHtml = `
            <div class="fp-notice warning" style="margin-top:14px;">⚠️ Formatting could not be analyzed for this file type — spacing/margin/indentation/alignment need manual review.</div>`;
    }

    body.innerHTML = `
        <div class="dv-result-header" style="border-color:${typeMeta.color};">
            <span class="dv-type-icon">${typeMeta.icon}</span>
            <div style="flex:1;">
                <div class="dv-type-label" style="color:${typeMeta.color};">${typeMeta.label}</div>
                <div class="dv-type-sub">${result.confidence}% confidence · ${result.wordCount.toLocaleString()} words${result.pages ? ' · ' + result.pages + ' page(s)' : ''}</div>
            </div>
            <div class="dv-valid-badge" style="background:${result.valid ? '#0f2a1a' : '#2a0f0f'};color:${result.valid ? '#4ade80' : '#f87171'};">
                ${result.valid ? '✓ Valid' : '✗ Invalid'}
            </div>
        </div>

        <div class="dv-score-section">
            <div class="dv-score-row">
                <span class="dv-score-lbl">📄 Thesis signals</span>
                <div class="dv-bar-wrap"><div class="dv-bar" style="width:${thesisPct}%;background:#22c55e;"></div></div>
                <span class="dv-score-val">${result.thesisScore} pts</span>
            </div>
            <div class="dv-score-row">
                <span class="dv-score-lbl">🚫 Non-thesis signals</span>
                <div class="dv-bar-wrap"><div class="dv-bar" style="width:${invalidPct}%;background:#ef4444;"></div></div>
                <span class="dv-score-val">${result.invalidScore} pts</span>
            </div>
        </div>

        <div class="fp-section-title">Thesis Keywords Found</div>
        <div class="dv-hits-wrap">${thesisHitsList}</div>

        ${result.invalidHits.length > 0 ? `
        <div class="fp-section-title" style="margin-top:10px;">Non-Thesis Keywords Found</div>
        <div class="dv-hits-wrap">${invalidHitsList}</div>` : ''}

        ${!result.wordCountOk ? `
        <div class="fp-notice warning" style="margin-top:10px;">
            ⚠️ Word count too low (${result.wordCount} words). A thesis typically has at least 500 words.
        </div>` : ''}

        ${formattingSectionHtml}

        <div style="margin-top:12px;">${statusNotice}</div>
    `;

    if (result.valid) {
        footer.innerHTML = `
            ${backBtn}
            <button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Cancel</button>
            <button class="btn-modal-submit" onclick="window._dvCloseModal('docValidationModal');${onProceed}">
                Run ${_escHtml(actionLabel)} →
            </button>`;
    } else {
        footer.innerHTML = `
            ${backBtn}
            <button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Close</button>
            <button class="btn-modal-submit" style="background:#6b7280;border-color:#6b7280;"
                onclick="if(confirm('This file was flagged as non-thesis content. Proceed anyway?')){window._dvCloseModal('docValidationModal');${onProceed}}">
                Override & Proceed
            </button>`;
    }
}

/* ══════════════════════════════════════════
   Download button handlers
══════════════════════════════════════════ */

window._dvDownloadRedline = async function () {
    const btn = document.getElementById('dvRedlineBtn');
    if (!_dvLastFile || !_dvLastFormattingProfile) return;
    const ext = (_dvLastFile.name || '').split('.').pop().toLowerCase();
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
        let blob;
        if (ext === 'docx') {
            const byParagraph = new Map();
            _dvLastFlatViolations.forEach(v => {
                if (v.index == null) return;
                const note = `${v.ruleName}: expected ${v.target}${v.unit ? ' ' + v.unit : ''}, found ${v.actual}`;
                if (!byParagraph.has(v.index)) byParagraph.set(v.index, []);
                byParagraph.get(v.index).push(note);
            });
            if (!byParagraph.size) { alert('No specific formatting issues to mark — nothing to redline.'); return; }
            blob = await _dvGenerateRedlinedDocx(_dvLastFile, byParagraph);
        } else if (ext === 'pdf') {
            if (!_dvLastFlatViolations.length) { alert('No specific formatting issues to mark — nothing to redline.'); return; }
            blob = await _dvGenerateRedlinedPdf(_dvLastFile, _dvLastFlatViolations);
        } else {
            throw new Error('Unsupported file type for redlining.');
        }
        _dvTriggerDownload(blob, _dvBaseName(_dvLastFile.name) + '_redlined.' + ext);
    } catch (e) {
        console.error('[Validator] Redline generation failed:', e);
        alert('Could not generate the redlined copy: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📥 Download Redlined Copy (shows errors)'; }
    }
};

window._dvDownloadFixed = async function () {
    const btn = document.getElementById('dvFixedBtn');
    if (!_dvLastFile || !_dvLastFormattingProfile || !_dvLastRules) return;
    const ext = (_dvLastFile.name || '').split('.').pop().toLowerCase();
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
        let blob;
        if (ext === 'docx') {
            blob = await _dvGenerateFixedDocx(_dvLastFile, _dvLastRules, _dvLastFormattingProfile);
        } else if (ext === 'pdf') {
            blob = await _dvGenerateFixedPdf(_dvLastFile, _dvLastRules, _dvLastFormattingProfile);
        } else {
            throw new Error('Unsupported file type for auto-fix.');
        }
        _dvTriggerDownload(blob, _dvBaseName(_dvLastFile.name) + '_fixed.' + ext);
    } catch (e) {
        console.error('[Validator] Fixed-copy generation failed:', e);
        alert('Could not generate the auto-fixed copy: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📥 Download Auto-Fixed Copy (aligned to template)'; }
    }
};

/* ══════════════════════════════════════════
   PUBLIC: Show validation modal for a thesis
   (admin side — thesis looked up by id from window.theses)
   File is fixed to the submission; admin still picks WHICH
   template to check it against.
══════════════════════════════════════════ */

window.openDocValidationModal = async function (thesisId, actionLabel, onValidCallback) {
    const thesis = (window.theses ?? []).find(t => t.id === thesisId);
    if (!thesis) return;

    if (!thesis.file) {
        window._dvRunCallback(onValidCallback);
        return;
    }

    let modal = document.getElementById('docValidationModal');
    if (!modal) modal = _createValidationModal();

    _dvPendingFile = thesis.file;
    _dvPendingActionLabel = actionLabel;
    _dvPendingCallback = onValidCallback;
    _dvPendingMeta = { student: thesis.student || '—' };
    _dvPendingAllowFileChange = false;
    _dvSelectedTemplateId = null;

    _dvRenderPickerStep();
    _dvOpenModal('docValidationModal');
};

/* ══════════════════════════════════════════
   PUBLIC: Show validation modal for a raw File
   (student/user side — no thesis record needed)

   Call with `file = null` (the common case — e.g. the "Check
   Formatting" button on Submit Thesis) to let the student upload
   inside the modal. Either way, the student must also pick which
   template/paper to check against before the "Run" button works.
   Produces the exact same two downloads as the admin side:
   redlined copy + auto-fixed copy.
══════════════════════════════════════════ */

window.openDocValidationModalForFile = async function (file, actionLabel, onValidCallback) {
    let modal = document.getElementById('docValidationModal');
    if (!modal) modal = _createValidationModal();

    _dvPendingFile = file || null;
    _dvPendingActionLabel = actionLabel;
    _dvPendingCallback = onValidCallback;
    _dvPendingMeta = {};
    _dvPendingAllowFileChange = true;
    _dvSelectedTemplateId = null;

    _dvRenderPickerStep();
    _dvOpenModal('docValidationModal');
};

/* ══════════════════════════════════════════
   SHARED: run validation + formatting analysis
   on a resolved file against a chosen template,
   then render the result. Used by both the admin
   and student picker steps above.
══════════════════════════════════════════ */

async function _dvRunFileCheck(fileObj, actionLabel, onValidCallback, meta, templateId) {
    const fName = fileObj.name || '';
    const ext = fName.split('.').pop().toLowerCase();
    const validExts = ['pdf', 'doc', 'docx'];

    let modal = document.getElementById('docValidationModal');
    if (!modal) modal = _createValidationModal();

    if (!validExts.includes(ext)) {
        document.getElementById('docValidationBody').innerHTML = `
            <div class="fp-notice warning">
                ❌ Unsupported file type (.${_escHtml(ext)}). Only PDF, DOC, and DOCX are accepted.
            </div>`;
        document.getElementById('docValidationFooter').innerHTML = `
            <button class="btn-modal-close" onclick="window._dvBackToPicker()">← Change File / Template</button>
            <button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Close</button>`;
        _dvOpenModal('docValidationModal');
        return;
    }

    const chosenTemplate = _dvActiveTemplates.find(t => String(t.id) === String(templateId));

    const metaRows = [`<div><span class="fp-label">File</span><span>${_escHtml(fName || '—')}</span></div>`];
    if (meta && meta.student) {
        metaRows.push(`<div><span class="fp-label">Student</span><span>${_escHtml(meta.student)}</span></div>`);
    }
    metaRows.push(`<div><span class="fp-label">Template</span><span>${_escHtml(chosenTemplate ? chosenTemplate.name : 'Default Thesis Format')}</span></div>`);

    document.getElementById('docValidationBody').innerHTML = `
        <div class="fp-meta">${metaRows.join('')}</div>
        <div class="fp-skeleton">
            <div class="fp-skeleton-spinner"></div>
            <div class="fp-skeleton-msg">Fetching and analysing document…</div>
        </div>`;
    document.getElementById('docValidationFooter').innerHTML =
        `<button class="btn-modal-close" onclick="window._dvCloseModal('docValidationModal')">Cancel</button>`;

    _dvOpenModal('docValidationModal');

    // Runs for real File/Blob instances (student picker) AND plain {name,url}
    // API objects (admin side) — _resolveArrayBuffer handles fetching the latter.
    const [result, formattingProfile] = await Promise.all([
        window.validateThesisFile(fileObj),
        _extractFormattingProfile(fileObj).catch(e => { console.warn('[Validator] Formatting analysis failed:', e); return null; }),
    ]);

    const { rules, source: rulesSource } = _getFormatRules(templateId);
    _dvLastFile = fileObj;
    _dvLastFormattingProfile = formattingProfile;
    _dvLastRules = rules;
    _dvLastFlatViolations = _dvComputeFlatViolations(rules, formattingProfile);

    _renderValidationResult(result, onValidCallback, actionLabel, formattingProfile, rules, rulesSource);
}

window._dvRunCallback = function (callbackStr) {
    try { eval(callbackStr); } catch (e) { console.error('[Validator] Callback error:', e); }
};

/* ══════════════════════════════════════════
   PATCH openFormatModal & openPlagiarismModal
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const _origFormat = window.openFormatModal;
        const _origPlag = window.openPlagiarismModal;

        if (typeof _origFormat === 'function') {
            window.openFormatModal = function (id) {
                window.openDocValidationModal(
                    id,
                    'Format Check',
                    `window._dvRunCallback.__origFormat(${id})`
                );
            };
            window._dvRunCallback.__origFormat = _origFormat;
        }

        if (typeof _origPlag === 'function') {
            window.openPlagiarismModal = function (id) {
                window.openDocValidationModal(
                    id,
                    'Plagiarism Check',
                    `window._dvRunCallback.__origPlag(${id})`
                );
            };
            window._dvRunCallback.__origPlag = _origPlag;
        }

        console.log('[AIDEA Validator] Document type validation + template picker + real formatting checks + redline/auto-fix generation patched into Format & Plagiarism checks.');
    }, 300);
});

/* ══════════════════════════════════════════
   STYLES
══════════════════════════════════════════ */
(function injectDVStyles() {
    if (document.getElementById('dv-styles')) return;
    const style = document.createElement('style');
    style.id = 'dv-styles';
    style.textContent = `
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 10000; }
        .modal-box { background: #12152a; border-radius: 16px; width: 90%; max-height: 85vh; overflow-y: auto; color: #eee; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #23263a; }
        .modal-header h2 { font-size: 16px; }
        .modal-close { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; }
        .modal-body { padding: 20px 22px; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #23263a; flex-wrap: wrap; }
        .btn-modal-close { background: #1e2235; border: 1px solid #333; color: #ccc; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .btn-modal-submit { background: #22c55e; border: none; color: #06110a; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; }

        .fp-section-title { font-size: 12px; color: #888; margin-bottom: 6px; font-weight: 700; }
        .fp-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 8px; }
        .fp-notice.success { background: #0f2a1a; color: #4ade80; }
        .fp-notice.warning { background: #2a1f0f; color: #fbbf24; }
        .fp-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; font-size: 13px; }
        .fp-label { color: #888; margin-right: 8px; }
        .fp-skeleton { display: flex; align-items: center; gap: 12px; padding: 20px 0; }
        .fp-skeleton-spinner { width: 22px; height: 22px; border: 3px solid #333; border-top-color: #22c55e; border-radius: 50%; animation: dv-spin 0.8s linear infinite; }
        @keyframes dv-spin { to { transform: rotate(360deg); } }
        .fp-skeleton-msg { font-size: 13px; color: #aaa; }

        /* picker step */
        .dv-file-drop {
            border: 2px dashed #333; border-radius: 12px; padding: 26px;
            text-align: center; cursor: pointer; transition: border-color .15s, background .15s;
        }
        .dv-file-drop:hover, .dv-file-drop.dragover { border-color: #f5c518; background: rgba(245,197,24,0.06); }
        .dv-file-drop .file-icon { font-size: 28px; display: block; margin-bottom: 8px; }
        .dv-file-drop p { font-size: 13px; color: #aaa; }
        .dv-file-drop .file-link { color: #f5c518; font-weight: 700; cursor: pointer; text-decoration: underline; }
        .dv-file-drop .file-hint { font-size: 11px; color: #666; margin-top: 4px; }
        .file-preview {
            background: #1a1d2e; border: 1px solid #333; border-radius: 9px;
            padding: 10px 14px; font-size: 13px; display: flex; align-items: center; gap: 10px; margin-top: 10px;
        }
        .dv-template-picker { margin-bottom: 4px; }
        .dv-select { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #333; background: #1a1d2e; color: #eee; font-size: 13px; }
        .dv-template-desc { font-size: 12px; color: #aaa; margin-top: 8px; }

        /* result step */
        .dv-result-header {
            display: flex; align-items: center; gap: 14px;
            padding: 14px 16px; border: 2px solid #333;
            border-radius: 12px; background: #12152a; margin-bottom: 16px;
        }
        .dv-type-icon  { font-size: 32px; flex-shrink: 0; }
        .dv-type-label { font-size: 17px; font-weight: 700; }
        .dv-type-sub   { font-size: 12px; color: #888; margin-top: 2px; }
        .dv-valid-badge {
            padding: 4px 12px; border-radius: 20px;
            font-size: 12px; font-weight: 700; white-space: nowrap; flex-shrink: 0;
        }
        .dv-score-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .dv-score-row  { display: flex; align-items: center; gap: 10px; }
        .dv-score-lbl  { font-size: 12px; color: #aaa; min-width: 150px; flex-shrink: 0; }
        .dv-bar-wrap   { flex: 1; height: 8px; background: #1e2235; border-radius: 4px; overflow: hidden; }
        .dv-bar        { height: 100%; border-radius: 4px; transition: width 0.5s ease; min-width: 2px; }
        .dv-score-val  { font-size: 12px; color: #888; min-width: 44px; text-align: right; }
        .dv-hits-wrap  { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
        .dv-hit        { padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 500; }
        .dv-hit-good   { background: #0f2a1a; color: #4ade80; border: 1px solid #22c55e33; }
        .dv-hit-bad    { background: #2a0f0f; color: #f87171; border: 1px solid #ef444433; }

        .dv-format-summary { font-size: 12px; margin-bottom: 10px; }
        .dv-rule-rows { display: flex; flex-direction: column; gap: 6px; }
        .dv-rule-row { border: 1px solid #23263a; border-radius: 8px; padding: 8px 12px; }
        .dv-rule-found { border-color: #22c55e44; background: rgba(34,197,94,0.08); }
        .dv-rule-fail { border-color: #ef444444; background: rgba(239,68,68,0.08); }
        .dv-rule-manual { border-color: #f59e0b44; background: rgba(245,158,11,0.08); }
        .dv-rule-top { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; }
        .dv-rule-name { flex: 1; }
        .dv-rule-type { font-size: 10px; padding: 1px 6px; }
        .dv-rule-detail { font-size: 12px; color: #aaa; margin-top: 4px; }
        .dv-rule-status { font-size: 11px; color: #888; margin-top: 3px; font-style: italic; }
        .dv-rule-estimate { color: #fbbf24; font-style: normal; }

        .dv-violations { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .dv-violation-item { font-size: 11.5px; color: #f8b4b4; background: rgba(239,68,68,0.08); border-radius: 6px; padding: 5px 9px; }
        .dv-violation-loc { font-weight: 700; color: #fca5a5; margin-right: 6px; }
        .dv-violation-more { color: #999; font-style: italic; }

        .dv-download-row { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
        .dv-download-row .btn-modal-close { background: #1a2e1e; border-color: #22c55e55; color: #86efac; }
        .dv-download-row .btn-modal-close:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
})();