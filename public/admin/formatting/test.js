// thesis_validator.js (admin/formatting/test.js)
// AIDEA – Norzagaray College
// 1) Modal now has its OWN file upload (drag & drop / browse) — independent of the
//    main Submit Thesis form's file input.
// 2) Validates the uploaded file is actually a thesis / research paper / capstone.
// 3) Template dropdown is populated from the ADMIN's Format Template Manager
//    (formatting.js, localStorage key 'aidea_format_templates'). Only templates
//    marked Active there show up here. Each template's custom rules are shown
//    as a checklist the student can review against their document.
// ─────────────────────────────────────────────────────────────────────────────

const _WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const _DV_MAX_SIZE = 20 * 1024 * 1024;
const _DV_ALLOWED_EXTS = ['pdf', 'docx'];
const _ADMIN_TEMPLATE_STORAGE_KEY = 'aidea_format_templates';

/* ══════════════════════════════════════════
   SELF-CONTAINED MODAL SHOW/HIDE
══════════════════════════════════════════ */
function _dvOpenModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}
function _dvCloseModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}
window.closeDocValidationModal = () => _dvCloseModal('docValidationModal');

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
};

/* ══════════════════════════════════════════
   HELPER: Resolve an ArrayBuffer from either
   a real File object OR a plain {name, url} object
══════════════════════════════════════════ */
async function _resolveArrayBuffer(file) {
    if (typeof file.arrayBuffer === 'function') {
        return file.arrayBuffer();
    }
    if (file.url) {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`Failed to fetch file (HTTP ${res.status})`);
        return res.arrayBuffer();
    }
    throw new Error('file.arrayBuffer is not a function and no URL available');
}

/* ══════════════════════════════════════════
   ADMIN TEMPLATES — read from formatting.js's storage
══════════════════════════════════════════ */
function _getAllAdminTemplates() {
    try {
        return JSON.parse(localStorage.getItem(_ADMIN_TEMPLATE_STORAGE_KEY) || '[]');
    } catch (e) {
        console.warn('[Validator] Could not parse admin templates:', e);
        return [];
    }
}

function _getActiveAdminTemplates() {
    return _getAllAdminTemplates().filter(t => t && t.active);
}

/* ══════════════════════════════════════════
   INDICATOR DICTIONARIES (document type check)
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
    const name = (typeof file.name === 'string' ? file.name : '') || '';
    const ext = name.split('.').pop().toLowerCase();

    if (ext === 'pdf') return _extractPdfText(file);
    if (ext === 'docx') return _extractDocxText(file);
    if (ext === 'doc') return { text: '', pages: null, unsupported: true };
    return { text: '', pages: null, unsupported: true };
}

/* ══════════════════════════════════════════
   DOCUMENT TYPE SCORING
══════════════════════════════════════════ */

function _scoreDocument(text, pages) {
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    let thesisScore = 0, invalidScore = 0;
    const thesisHits = [], invalidHits = [];

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
            valid: null, docType: 'unknown', confidence: 0, wordCount: 0, pages: null,
            error: '.doc (legacy Word) cannot be validated client-side. Manual review recommended.',
            warning: true,
        };
    }

    const textLength = (extracted.text || '').trim().length;
    if (textLength < 50) {
        return {
            valid: false, docType: 'unreadable', confidence: 90, wordCount: 0, pages: extracted.pages,
            error: 'File appears to be an image-only or scanned PDF with no extractable text.',
            thesisScore: 0, invalidScore: 0, thesisHits: [], invalidHits: [],
        };
    }

    const result = _scoreDocument(extracted.text, extracted.pages);
    return { ...result, error: null };
};

/* ══════════════════════════════════════════
   MODAL — creation
══════════════════════════════════════════ */

function _createValidationModal() {
    const modal = document.createElement('div');
    modal.id = 'docValidationModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:640px;">
            <div class="modal-header">
                <h2>📐 Formatting Check</h2>
                <button class="modal-close" onclick="closeDocValidationModal()">✕</button>
            </div>
            <div class="modal-body" id="docValidationBody"></div>
            <div class="modal-footer" id="docValidationFooter">
                <button class="btn-modal-close" onclick="closeDocValidationModal()">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) _dvCloseModal('docValidationModal'); });
    return modal;
}

/* ══════════════════════════════════════════
   STATE for the in-modal upload flow
══════════════════════════════════════════ */
let _dvPendingFile = null;
let _dvPendingActionLabel = null;
let _dvPendingCallback = null;
let _dvActiveTemplates = []; // admin-created templates currently offered in the dropdown

/* ══════════════════════════════════════════
   STEP 1: Render the upload + template picker UI
   inside the modal
══════════════════════════════════════════ */
function _dvRenderUploadStep(actionLabel) {
    const body = document.getElementById('docValidationBody');
    const footer = document.getElementById('docValidationFooter');

    _dvActiveTemplates = _getActiveAdminTemplates();

    const previewHtml = _dvPendingFile ? `
        <div class="file-preview" style="display:flex;">
            <span>📎</span>
            <span>${_dvPendingFile.name} (${(_dvPendingFile.size / 1024 / 1024).toFixed(2)} MB)</span>
            <button onclick="window._dvClearPendingFile()" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:#888">✕</button>
        </div>` : `<div id="dvFilePreview" style="display:none;"></div>`;

    const templatePickerHtml = _dvActiveTemplates.length
        ? `<select id="dvTemplateSelect" class="dv-select">
                ${_dvActiveTemplates.map(t =>
            `<option value="${t.id}">${t.name} — ${t.type}</option>`).join('')}
           </select>`
        : `<div class="fp-notice warning">⚠️ No active format templates are available yet. Ask an admin to publish one in Format Templates.</div>`;

    body.innerHTML = `
        <div class="fp-section-title">Upload your thesis file</div>
        <div class="dv-file-drop" id="dvFileDrop">
            <div class="file-drop-content">
                <span class="file-icon">📂</span>
                <p>Drag & drop your file here, or <label for="dvFileInput" class="file-link">browse</label></p>
                <p class="file-hint">Accepted: PDF, DOCX (Max 20MB)</p>
            </div>
            <input type="file" id="dvFileInput" accept=".pdf,.docx" hidden />
        </div>
        ${previewHtml}

        <div class="dv-template-picker" style="margin-top:16px;">
            <div class="fp-section-title">Choose a format template to check against</div>
            ${templatePickerHtml}
        </div>
        <div id="dvUploadError"></div>
    `;

    const canRun = !!_dvPendingFile && _dvActiveTemplates.length > 0;
    footer.innerHTML = `
        <button class="btn-modal-close" onclick="closeDocValidationModal()">Cancel</button>
        <button class="btn-modal-submit" id="dvRunBtn" ${canRun ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"'} onclick="window._dvRunFormatCheck()">
            Run ${actionLabel} →
        </button>`;

    _dvWireUploadEvents();
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

    if (!_DV_ALLOWED_EXTS.includes(ext)) {
        if (errEl) errEl.innerHTML = `<div class="fp-notice warning">❌ Only PDF or DOCX files are allowed.</div>`;
        return;
    }
    if (file.size > _DV_MAX_SIZE) {
        if (errEl) errEl.innerHTML = `<div class="fp-notice warning">❌ File exceeds 20MB limit.</div>`;
        return;
    }
    if (errEl) errEl.innerHTML = '';

    _dvPendingFile = file;
    _dvRenderUploadStep(_dvPendingActionLabel);
};

window._dvClearPendingFile = function () {
    _dvPendingFile = null;
    _dvRenderUploadStep(_dvPendingActionLabel);
};

/* ══════════════════════════════════════════
   PUBLIC ENTRY: opens modal with its own upload UI.
   `file` param is optional — pass a file only when
   reusing this for an existing thesis record (see
   openDocValidationModal below); otherwise leave it
   null and let the student upload inside the modal.
══════════════════════════════════════════ */
window.openDocValidationModalForFile = async function (file, actionLabel, onValidCallback) {
    let modal = document.getElementById('docValidationModal');
    if (!modal) modal = _createValidationModal();

    _dvPendingFile = file || null;
    _dvPendingActionLabel = actionLabel;
    _dvPendingCallback = onValidCallback;

    _dvRenderUploadStep(actionLabel);
    _dvOpenModal('docValidationModal');
};

window._dvRunFormatCheck = async function () {
    const file = _dvPendingFile;
    const actionLabel = _dvPendingActionLabel;
    const onValidCallback = _dvPendingCallback;
    if (!file) return;

    const selectedId = document.getElementById('dvTemplateSelect')?.value;
    const template = _dvActiveTemplates.find(t => String(t.id) === String(selectedId)) || _dvActiveTemplates[0];
    if (!template) return; // guarded by disabled Run button, but just in case

    document.getElementById('docValidationBody').innerHTML = `
        <div class="fp-meta">
            <div><span class="fp-label">File</span><span>${file.name}</span></div>
            <div><span class="fp-label">Template</span><span>${template.name}</span></div>
        </div>
        <div class="fp-skeleton">
            <div class="fp-skeleton-spinner"></div>
            <div class="fp-skeleton-msg">Reading document and checking against template rules…</div>
        </div>`;
    document.getElementById('docValidationFooter').innerHTML =
        `<button class="btn-modal-close" onclick="closeDocValidationModal()">Cancel</button>`;

    const [typeResult, extracted] = await Promise.all([
        window.validateThesisFile(file),
        _extractFileText(file).catch(() => ({ text: '' })),
    ]);

    _renderFullValidationResult(typeResult, extracted.text || '', template, onValidCallback, actionLabel);
};

function _renderFullValidationResult(typeResult, rawText, template, onProceed, actionLabel) {
    const body = document.getElementById('docValidationBody');
    const footer = document.getElementById('docValidationFooter');
    const typeMeta = _DOC_TYPE_LABELS[typeResult.docType] || _DOC_TYPE_LABELS.unknown;

    if (typeResult.error && !typeResult.valid && !typeResult.warning && typeResult.docType === 'unreadable') {
        body.innerHTML = `
            <div class="dv-result-header" style="border-color:#ef4444;">
                <span class="dv-type-icon">${typeMeta.icon}</span>
                <div>
                    <div class="dv-type-label" style="color:#f87171;">${typeMeta.label}</div>
                    <div class="dv-type-sub">${typeResult.error}</div>
                </div>
            </div>
            <div class="fp-notice warning" style="margin-top:12px;">
                ❌ This file cannot be processed. Please check the file and try again.
            </div>`;
        footer.innerHTML = `
            <button class="btn-modal-close" onclick="closeDocValidationModal()">Close</button>
            <button class="btn-modal-submit" onclick="window._dvBackToUpload()">← Try Another File</button>`;
        return;
    }

    // ── Template rules checklist (from the admin-created template) ──
    const lowerText = (rawText || '').toLowerCase();
    const rules = template.rules || [];
    const ruleRowsHtml = rules.length
        ? rules.map(r => {
            const nameLower = (r.name || '').toLowerCase();
            const autoFound = nameLower && lowerText.includes(nameLower);
            const icon = autoFound ? '✅' : '⚠️';
            const statusText = autoFound ? 'Mentioned in document' : 'Not detected — please verify manually';
            return `
                <div class="dv-rule-row ${autoFound ? 'dv-rule-found' : 'dv-rule-manual'}">
                    <div class="dv-rule-top">
                        <span>${icon}</span>
                        <span class="dv-rule-name">${r.name}</span>
                        <span class="badge badge-neutral dv-rule-type">${r.type}</span>
                    </div>
                    ${r.detail ? `<div class="dv-rule-detail">${r.detail}</div>` : ''}
                    <div class="dv-rule-status">${statusText}</div>
                </div>`;
        }).join('')
        : `<div class="fp-notice warning">This template has no rules defined yet.</div>`;

    const foundCount = rules.filter(r => (r.name || '').toLowerCase() && lowerText.includes((r.name || '').toLowerCase())).length;

    body.innerHTML = `
        <div class="dv-result-header" style="border-color:${typeMeta.color};">
            <span class="dv-type-icon">${typeMeta.icon}</span>
            <div style="flex:1;">
                <div class="dv-type-label" style="color:${typeMeta.color};">${typeMeta.label}</div>
                <div class="dv-type-sub">${typeResult.confidence || 0}% confidence · ${(typeResult.wordCount || 0).toLocaleString()} words</div>
            </div>
        </div>

        <div class="fp-section-title">Template — ${template.name} (${template.type})</div>
        ${template.description ? `<div class="dv-template-desc">${template.description}</div>` : ''}
        <div class="dv-format-summary"><span style="color:#4ade80;">${foundCount} auto-detected</span> · <span style="color:#fbbf24;">${rules.length - foundCount} need manual review</span></div>
        <div class="dv-rule-rows">${ruleRowsHtml}</div>
        <div class="fp-notice warning" style="margin-top:10px;">⚠️ Rule detection here is a keyword hint, not a guarantee — please double-check each item yourself before submitting.</div>
    `;

    const canProceed = typeResult.valid !== false;
    if (canProceed) {
        footer.innerHTML = `
            <button class="btn-modal-close" onclick="window._dvBackToUpload()">← Try Another File</button>
            <button class="btn-modal-submit" onclick="closeDocValidationModal();${onProceed}">
                Continue to ${actionLabel} →
            </button>`;
    } else {
        footer.innerHTML = `
            <button class="btn-modal-close" onclick="window._dvBackToUpload()">← Try Another File</button>
            <button class="btn-modal-submit" style="background:#6b7280;border-color:#6b7280;"
                onclick="if(confirm('This file was flagged as non-thesis content. Proceed anyway?')){closeDocValidationModal();${onProceed}}">
                Override & Proceed
            </button>`;
    }
}

window._dvBackToUpload = function () {
    _dvRenderUploadStep(_dvPendingActionLabel);
};

/* ══════════════════════════════════════════
   PUBLIC: by-thesis-id modal (admin/My Submissions)
   — unchanged behavior, reuses the same flow
══════════════════════════════════════════ */

window._dvRunCallback = function (callbackStr) {
    try { eval(callbackStr); } catch (e) { console.error('[Validator] Callback error:', e); }
};

window.openDocValidationModal = async function (thesisId, actionLabel, onValidCallback) {
    const thesis = (window.theses ?? []).find(t => t.id === thesisId);
    if (!thesis) return;

    if (!thesis.file) {
        window._dvRunCallback(onValidCallback);
        return;
    }

    if (!(thesis.file instanceof File) && !(thesis.file instanceof Blob)) {
        const ext = (thesis.file.name || '').split('.').pop().toLowerCase();
        const validExts = ['pdf', 'doc', 'docx'];
        if (!validExts.includes(ext)) {
            let modal = document.getElementById('docValidationModal');
            if (!modal) modal = _createValidationModal();
            document.getElementById('docValidationBody').innerHTML = `
            <div class="fp-notice warning">
                ❌ Unsupported file type (.${ext}). Only PDF, DOC, and DOCX are accepted.
            </div>`;
            document.getElementById('docValidationFooter').innerHTML =
                `<button class="btn-modal-close" onclick="closeDocValidationModal()">Close</button>`;
            _dvOpenModal('docValidationModal');
            return;
        }
        window._dvRunCallback(onValidCallback);
        return;
    }

    window.openDocValidationModalForFile(thesis.file, actionLabel, onValidCallback);
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
                window.openDocValidationModal(id, 'Format Check', `window._dvRunCallback.__origFormat(${id})`);
            };
            window._dvRunCallback.__origFormat = _origFormat;
        }
        if (typeof _origPlag === 'function') {
            window.openPlagiarismModal = function (id) {
                window.openDocValidationModal(id, 'Plagiarism Check', `window._dvRunCallback.__origPlag(${id})`);
            };
            window._dvRunCallback.__origPlag = _origPlag;
        }
        console.log('[AIDEA Validator] Document type check + admin-template rule checklist patched.');
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
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 22px; border-top: 1px solid #23263a; }
        .btn-modal-close { background: #1e2235; border: 1px solid #333; color: #ccc; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .btn-modal-submit { background: #22c55e; border: none; color: #06110a; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; }
        .fp-meta { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; font-size: 13px; }
        .fp-label { color: #888; margin-right: 8px; }
        .fp-skeleton { display: flex; align-items: center; gap: 12px; padding: 20px 0; }
        .fp-skeleton-spinner { width: 22px; height: 22px; border: 3px solid #333; border-top-color: #22c55e; border-radius: 50%; animation: dv-spin 0.8s linear infinite; }
        @keyframes dv-spin { to { transform: rotate(360deg); } }
        .fp-skeleton-msg { font-size: 13px; color: #aaa; }
        .fp-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 8px; }
        .fp-notice.success { background: #0f2a1a; color: #4ade80; }
        .fp-notice.warning { background: #2a1f0f; color: #fbbf24; }
        .fp-section-title { font-size: 12px; color: #888; margin-bottom: 6px; font-weight: 700; }

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
        .dv-select { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #333; background: #1a1d2e; color: #eee; font-size: 13px; margin-top: 6px; }
        .dv-template-desc { font-size: 12px; color: #aaa; margin-bottom: 10px; }

        .dv-result-header { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 2px solid #333; border-radius: 12px; background: #12152a; margin-bottom: 16px; }
        .dv-type-icon { font-size: 32px; flex-shrink: 0; }
        .dv-type-label { font-size: 17px; font-weight: 700; }
        .dv-type-sub { font-size: 12px; color: #888; margin-top: 2px; }

        .dv-format-summary { font-size: 12px; margin-bottom: 10px; }

        .dv-rule-rows { display: flex; flex-direction: column; gap: 6px; }
        .dv-rule-row { border: 1px solid #23263a; border-radius: 8px; padding: 8px 12px; }
        .dv-rule-found { border-color: #22c55e44; background: rgba(34,197,94,0.08); }
        .dv-rule-manual { border-color: #f59e0b44; background: rgba(245,158,11,0.08); }
        .dv-rule-top { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; }
        .dv-rule-name { flex: 1; }
        .dv-rule-type { font-size: 10px; padding: 1px 6px; }
        .dv-rule-detail { font-size: 12px; color: #aaa; margin-top: 4px; }
        .dv-rule-status { font-size: 11px; color: #888; margin-top: 3px; font-style: italic; }
    `;
    document.head.appendChild(style);
})();