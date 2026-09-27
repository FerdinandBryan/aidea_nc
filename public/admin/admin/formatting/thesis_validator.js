// Thesis_document_validator.js
// AIDEA – Norzagaray College
// Validates that an uploaded file is actually a thesis / research paper / capstone
// before allowing Format Check or Plagiarism Check to proceed.
//
// How it works:
//   1. Reads the submitted file client-side (PDF via pdf.js, DOCX via JSZip + DOMParser)
//   2. Scores the extracted text against thesis indicators vs. non-thesis indicators
//   3. Returns a structured result: { valid, docType, confidence, reasons, warnings }
//
// Integration points (auto-patches on DOMContentLoaded):
//   • openFormatModal(id)     — blocked if file fails validation
//   • openPlagiarismModal(id) — blocked if file fails validation
//
// Dependencies loaded from cdnjs (injected automatically):
//   • pdf.js  2.16.105  (for PDF text extraction)
//   • JSZip   3.10.1   (for DOCX extraction)
// ─────────────────────────────────────────────────────────────────────────────

/* ══════════════════════════════════════════
   LAZY-LOAD DEPENDENCIES
══════════════════════════════════════════ */
const _validatorDeps = {
    pdfjsLoaded: false,
    jszipLoaded: false,

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
};

/* ══════════════════════════════════════════
   INDICATOR DICTIONARIES
══════════════════════════════════════════ */
const _THESIS_SIGNALS = {
    // Strong structural markers (each hit = +3)
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
    // Common thesis phrases (each hit = +2)
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
    // Weak signals (each hit = +1)
    weak: [
        'introduction', 'abstract', 'methodology', 'conclusion',
        'recommendation', 'acknowledgment', 'table of contents',
        'list of figures', 'list of tables', 'appendix', 'appendices',
        'adviser', 'panel of examiners', 'thesis title',
    ],
};

const _INVALID_SIGNALS = {
    // Definite non-thesis documents (each hit = +5)
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
    // Likely non-thesis (each hit = +3)
    likely: [
        'dear sir', 'dear ma\'am', 'to whom it may concern',
        'sincerely yours', 'respectfully yours', 'yours truly',
        'student id', 'employee id', 'id number',
        'reference number', 'ref #', 'or number',
        'paid', 'unpaid', 'balance', 'payment method',
        'cash', 'gcash', 'maya', 'bank transfer',
    ],
};

// Doc type labels for display
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

/** Extract text from a PDF File object using pdf.js */
async function _extractPdfText(file) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensurePdfJs(async () => {
            if (!window.pdfjsLib) { reject(new Error('pdf.js unavailable')); return; }
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const maxPages = Math.min(pdf.numPages, 15); // read up to 15 pages
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

/** Extract text from a DOCX File object using JSZip + DOMParser */
async function _extractDocxText(file) {
    return new Promise((resolve, reject) => {
        _validatorDeps.ensureJSZip(async () => {
            if (!window.JSZip) { reject(new Error('JSZip unavailable')); return; }
            try {
                const arrayBuffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                const xmlFile = zip.file('word/document.xml');
                if (!xmlFile) { reject(new Error('Not a valid DOCX')); return; }
                const xmlStr = await xmlFile.async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
                const textNodes = xmlDoc.getElementsByTagNameNS(
                    'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't'
                );
                let text = Array.from(textNodes).map(n => n.textContent).join(' ');
                resolve({ text, pages: null });
            } catch (e) {
                reject(e);
            }
        });
    });
}

/** Route to correct extractor based on file extension */
async function _extractFileText(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return _extractPdfText(file);
    if (ext === 'docx') return _extractDocxText(file);
    if (ext === 'doc') {
        // .doc is binary — we can't parse it client-side without LibreOffice
        return { text: '', pages: null, unsupported: true };
    }
    return { text: '', pages: null, unsupported: true };
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

    // Score thesis signals
    _THESIS_SIGNALS.structural.forEach(phrase => {
        if (lower.includes(phrase)) { thesisScore += 3; thesisHits.push({ phrase, weight: 3 }); }
    });
    _THESIS_SIGNALS.academic.forEach(phrase => {
        if (lower.includes(phrase)) { thesisScore += 2; thesisHits.push({ phrase, weight: 2 }); }
    });
    _THESIS_SIGNALS.weak.forEach(phrase => {
        if (lower.includes(phrase)) { thesisScore += 1; thesisHits.push({ phrase, weight: 1 }); }
    });

    // Score invalid signals
    _INVALID_SIGNALS.definite.forEach(phrase => {
        if (lower.includes(phrase)) { invalidScore += 5; invalidHits.push({ phrase, weight: 5 }); }
    });
    _INVALID_SIGNALS.likely.forEach(phrase => {
        if (lower.includes(phrase)) { invalidScore += 3; invalidHits.push({ phrase, weight: 3 }); }
    });

    // Word count penalty — a real thesis is never < 500 words
    const wordCountOk = wordCount >= 500;
    if (!wordCountOk) invalidScore += 10;

    // Single-page penalty
    if (pages === 1) invalidScore += 5;

    // Determine document type
    let docType = 'unknown';
    if (invalidScore >= 8 && invalidScore > thesisScore) {
        const lowerHits = invalidHits.map(h => h.phrase);
        if (lowerHits.some(p => ['official receipt', 'payment receipt', 'gcash ref', 'total amount', 'txn-', 'or number'].includes(p))) {
            docType = 'receipt';
        } else if (lowerHits.some(p => ['certificate of', 'this is to certify that', 'barangay clearance', 'birth certificate'].includes(p))) {
            docType = 'certificate';
        } else if (lowerHits.some(p => ['dear sir', 'dear ma\'am', 'to whom it may concern', 'sincerely yours', 'respectfully yours'].includes(p))) {
            docType = 'letter';
        } else {
            docType = 'unknown';
        }
    } else if (thesisScore >= 6) {
        // Check if it's a capstone / IT project specifically
        const capstoneKeywords = ['source code', 'system design', 'user manual', 'entity relationship', 'use case', 'database design', 'proposed system'];
        const isCapstone = capstoneKeywords.some(k => lower.includes(k));
        docType = isCapstone ? 'capstone' : 'thesis';
    } else if (thesisScore > 0 && thesisScore > invalidScore) {
        docType = 'thesis'; // some signals present, likely partial/short
    }

    // Confidence: how decisive is the winning side
    const total = thesisScore + invalidScore;
    const winningScore = Math.max(thesisScore, invalidScore);
    const confidence = total === 0 ? 0 : Math.round((winningScore / total) * 100);

    const valid = ['thesis', 'capstone'].includes(docType);

    return {
        valid,
        docType,
        confidence,
        thesisScore,
        invalidScore,
        wordCount,
        pages,
        thesisHits: thesisHits.slice(0, 8),   // top hits for display
        invalidHits: invalidHits.slice(0, 8),
        wordCountOk,
    };
}

/* ══════════════════════════════════════════
   MAIN VALIDATOR API
══════════════════════════════════════════ */

/**
 * validateThesisFile(file)
 * Returns a Promise resolving to:
 * {
 *   valid: bool,
 *   docType: 'thesis'|'capstone'|'receipt'|'certificate'|'letter'|'unknown'|'unreadable',
 *   confidence: 0-100,
 *   wordCount: number,
 *   pages: number|null,
 *   thesisScore: number,
 *   invalidScore: number,
 *   thesisHits: [...],
 *   invalidHits: [...],
 *   error: string|null,
 * }
 */
window.validateThesisFile = async function (file) {
    if (!file) {
        return { valid: false, docType: 'unknown', confidence: 0, error: 'No file provided.' };
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
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
            valid: null, // null = indeterminate, allow with warning
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
   VALIDATION MODAL UI
══════════════════════════════════════════ */

function _createValidationModal() {
    const modal = document.createElement('div');
    modal.id = 'docValidationModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:620px;">
            <div class="modal-header">
                <h2>🔎 Document Type Check</h2>
                <button class="modal-close" onclick="closeModal('docValidationModal')">✕</button>
            </div>
            <div class="modal-body" id="docValidationBody">
                <div class="fp-skeleton">
                    <div class="fp-skeleton-spinner"></div>
                    <div class="fp-skeleton-msg">Reading file contents…</div>
                </div>
            </div>
            <div class="modal-footer" id="docValidationFooter">
                <button class="btn-modal-close" onclick="closeModal('docValidationModal')">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('docValidationModal'); });
    return modal;
}

function _renderValidationResult(result, onProceed, actionLabel) {
    const body = document.getElementById('docValidationBody');
    const footer = document.getElementById('docValidationFooter');
    const typeMeta = _DOC_TYPE_LABELS[result.docType] || _DOC_TYPE_LABELS.unknown;

    // If indeterminate (.doc legacy), show warning and allow proceeding
    if (result.warning) {
        body.innerHTML = `
            <div class="dv-result-header" style="border-color:#f59e0b;">
                <span class="dv-type-icon">⚠️</span>
                <div>
                    <div class="dv-type-label" style="color:#fbbf24;">Legacy .doc Format</div>
                    <div class="dv-type-sub">Cannot auto-validate — manual review needed</div>
                </div>
            </div>
            <div class="fp-notice warning" style="margin-top:12px;">${result.error}</div>`;
        footer.innerHTML = `
            <button class="btn-modal-close" onclick="closeModal('docValidationModal')">Cancel</button>
            <button class="btn-modal-submit" style="background:#f59e0b;" onclick="closeModal('docValidationModal');${onProceed}">
                ⚠️ Proceed Anyway
            </button>`;
        return;
    }

    // Error state
    if (result.error && !result.valid) {
        body.innerHTML = `
            <div class="dv-result-header" style="border-color:#ef4444;">
                <span class="dv-type-icon">${typeMeta.icon}</span>
                <div>
                    <div class="dv-type-label" style="color:#f87171;">${typeMeta.label}</div>
                    <div class="dv-type-sub">${result.error}</div>
                </div>
            </div>
            <div class="fp-notice warning" style="margin-top:12px;">
                ❌ This file cannot be processed as a thesis submission.
                Please ask the student to re-submit the correct document.
            </div>`;
        footer.innerHTML = `<button class="btn-modal-close" onclick="closeModal('docValidationModal')">Close</button>`;
        return;
    }

    // Score bar values
    const total = Math.max(result.thesisScore + result.invalidScore, 1);
    const thesisPct = Math.round((result.thesisScore / total) * 100);
    const invalidPct = 100 - thesisPct;

    // Build hits list
    const thesisHitsList = result.thesisHits.length
        ? result.thesisHits.map(h => `<span class="dv-hit dv-hit-good">${h.phrase}</span>`).join('')
        : '<span style="color:#666;font-size:12px;">None found</span>';
    const invalidHitsList = result.invalidHits.length
        ? result.invalidHits.map(h => `<span class="dv-hit dv-hit-bad">${h.phrase}</span>`).join('')
        : '<span style="color:#666;font-size:12px;">None found</span>';

    const statusNotice = result.valid
        ? `<div class="fp-notice success">✅ Document confirmed as <strong>${typeMeta.label}</strong>. You may proceed with the ${actionLabel}.</div>`
        : `<div class="fp-notice warning">
               ❌ <strong>This does not appear to be a thesis or research paper.</strong><br>
               Detected as: <strong>${typeMeta.label}</strong>. Please ask the student to submit the correct file.
           </div>`;

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

        <!-- Score bars -->
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

        <!-- Detected keywords -->
        <div class="fp-section-title">Thesis Keywords Found</div>
        <div class="dv-hits-wrap">${thesisHitsList}</div>

        ${result.invalidHits.length > 0 ? `
        <div class="fp-section-title" style="margin-top:10px;">Non-Thesis Keywords Found</div>
        <div class="dv-hits-wrap">${invalidHitsList}</div>` : ''}

        ${!result.wordCountOk ? `
        <div class="fp-notice warning" style="margin-top:10px;">
            ⚠️ Word count too low (${result.wordCount} words). A thesis typically has at least 500 words.
        </div>` : ''}

        <div style="margin-top:12px;">${statusNotice}</div>
    `;

    // Footer buttons
    if (result.valid) {
        footer.innerHTML = `
            <button class="btn-modal-close" onclick="closeModal('docValidationModal')">Cancel</button>
            <button class="btn-modal-submit" onclick="closeModal('docValidationModal');${onProceed}">
                Run ${actionLabel} →
            </button>`;
    } else {
        // Invalid: still allow admin override with a warning
        footer.innerHTML = `
            <button class="btn-modal-close" onclick="closeModal('docValidationModal')">Close</button>
            <button class="btn-modal-submit" style="background:#6b7280;border-color:#6b7280;"
                onclick="if(confirm('This file was flagged as non-thesis content. Proceed anyway?')){closeModal('docValidationModal');${onProceed}}">
                Override & Proceed
            </button>`;
    }
}

/* ══════════════════════════════════════════
   PUBLIC: Show validation modal for a thesis
══════════════════════════════════════════ */

/**
 * openDocValidationModal(thesisId, actionLabel, onValidCallback)
 * Shows the document type check modal for the file attached to the thesis.
 * actionLabel: 'Format Check' | 'Plagiarism Check'
 * onValidCallback: JS string to eval after modal closes (e.g. '_originalOpenFormat(id)')
 */
window.openDocValidationModal = async function (thesisId, actionLabel, onValidCallback) {
    const thesis = (window.theses ?? []).find(t => t.id === thesisId);
    if (!thesis) return;

    // If no file attached, skip validation and proceed directly
    if (!thesis.file) {
        window._dvRunCallback(onValidCallback);
        return;
    }

    // Show modal with skeleton
    let modal = document.getElementById('docValidationModal');
    if (!modal) modal = _createValidationModal();

    document.getElementById('docValidationBody').innerHTML = `
        <div class="fp-meta">
            <div><span class="fp-label">File</span><span>${thesis.file.name || '—'}</span></div>
            <div><span class="fp-label">Student</span><span>${thesis.student || '—'}</span></div>
        </div>
        <div class="fp-skeleton">
            <div class="fp-skeleton-spinner"></div>
            <div class="fp-skeleton-msg">Extracting and analysing document…</div>
        </div>`;
    document.getElementById('docValidationFooter').innerHTML =
        `<button class="btn-modal-close" onclick="closeModal('docValidationModal')">Cancel</button>`;

    openModal('docValidationModal');

    // Run validation
    const result = await window.validateThesisFile(thesis.file);
    _renderValidationResult(result, onValidCallback, actionLabel);
};

// Helper to safely execute a stored callback string
window._dvRunCallback = function (callbackStr) {
    try { eval(callbackStr); } catch (e) { console.error('[Validator] Callback error:', e); }
};

/* ══════════════════════════════════════════
   PATCH openFormatModal & openPlagiarismModal
   Insert validation step before both checks
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    // Wait a tick so Thesis_format_plagiarism.js also loads
    setTimeout(() => {
        // Preserve originals
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

        console.log('[AIDEA Validator] Document type validation patched into Format & Plagiarism checks.');
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
        /* ── Result header ── */
        .dv-result-header {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            border: 2px solid #333;
            border-radius: 12px;
            background: #12152a;
            margin-bottom: 16px;
        }
        .dv-type-icon { font-size: 32px; flex-shrink: 0; }
        .dv-type-label { font-size: 17px; font-weight: 700; }
        .dv-type-sub { font-size: 12px; color: #888; margin-top: 2px; }
        .dv-valid-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
            flex-shrink: 0;
        }

        /* ── Score bars ── */
        .dv-score-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .dv-score-row { display: flex; align-items: center; gap: 10px; }
        .dv-score-lbl { font-size: 12px; color: #aaa; min-width: 150px; flex-shrink: 0; }
        .dv-bar-wrap {
            flex: 1;
            height: 8px;
            background: #1e2235;
            border-radius: 4px;
            overflow: hidden;
        }
        .dv-bar {
            height: 100%;
            border-radius: 4px;
            transition: width 0.5s ease;
            min-width: 2px;
        }
        .dv-score-val { font-size: 12px; color: #888; min-width: 44px; text-align: right; }

        /* ── Keyword hits ── */
        .dv-hits-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
        .dv-hit {
            padding: 3px 9px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
        }
        .dv-hit-good { background: #0f2a1a; color: #4ade80; border: 1px solid #22c55e33; }
        .dv-hit-bad  { background: #2a0f0f; color: #f87171; border: 1px solid #ef444433; }
    `;
    document.head.appendChild(style);
})();