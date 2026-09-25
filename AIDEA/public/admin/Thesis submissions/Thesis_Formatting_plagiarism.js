// Thesis_format_plagiarism.js
// Format check: fetches the actual submitted file, extracts text, and checks
//   - Required sections (from template rules + built-in)
//   - Font & spacing (manual review — not extractable from text)
//   - Metadata checks (title, abstract, adviser, etc.)
// Plagiarism check: in-browser similarity engine + external tool links

/* ══════════════════════════════════════════
   HELPERS: Safe file name / extension
══════════════════════════════════════════ */
function getFileName(file) {
    if (!file) return '';
    if (typeof file === 'string') return file;
    if (typeof file === 'object' && file.name) return file.name;
    return '';
}
function getFileExt(file) {
    const name = getFileName(file);
    if (!name) return '';
    return name.split('.').pop().toLowerCase();
}

/* ══════════════════════════════════════════
   HELPER: Is this a real File/Blob (uploadable),
   or a plain API metadata object {name, url, size}?
══════════════════════════════════════════ */
function isRealFileBlob(file) {
    return file instanceof File || file instanceof Blob;
}

/* ══════════════════════════════════════════
   FILE TEXT EXTRACTOR
   Fetches via API route (with auth token) then
   extracts text using pdf.js or JSZip
══════════════════════════════════════════ */
const _fmtDeps = {
    loadScript(src, onload) {
        if (document.querySelector(`script[src="${src}"]`)) { onload(); return; }
        const s = document.createElement('script');
        s.src = src; s.onload = onload;
        s.onerror = () => console.warn('[FormatCheck] Failed to load:', src);
        document.head.appendChild(s);
    },
    ensurePdfJs(cb) {
        if (window.pdfjsLib) { cb(); return; }
        this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js', () => {
            if (window.pdfjsLib) {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            }
            cb();
        });
    },
    ensureJSZip(cb) {
        if (window.JSZip) { cb(); return; }
        this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', cb);
    },
};

async function _fetchFileBuffer(fileObj) {
    // Real File/Blob — has .arrayBuffer() natively
    if (typeof fileObj.arrayBuffer === 'function') return fileObj.arrayBuffer();

    // API metadata object — fetch with auth token
    if (fileObj.url) {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch(fileObj.url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
    }
    throw new Error('No URL available to fetch file');
}

async function _extractTextFromFile(fileObj) {
    const ext = getFileExt(fileObj);

    if (ext === 'pdf') {
        return new Promise((resolve, reject) => {
            _fmtDeps.ensurePdfJs(async () => {
                if (!window.pdfjsLib) { reject(new Error('pdf.js unavailable')); return; }
                try {
                    const buf = await _fetchFileBuffer(fileObj);
                    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
                    const maxPages = Math.min(pdf.numPages, 20);
                    let text = '';
                    for (let i = 1; i <= maxPages; i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map(s => s.str).join(' ') + '\n';
                    }
                    resolve({ text, pages: pdf.numPages, ext: 'pdf' });
                } catch (e) { reject(e); }
            });
        });
    }

    if (ext === 'docx') {
        return new Promise((resolve, reject) => {
            _fmtDeps.ensureJSZip(async () => {
                if (!window.JSZip) { reject(new Error('JSZip unavailable')); return; }
                try {
                    const buf = await _fetchFileBuffer(fileObj);
                    const zip = await JSZip.loadAsync(buf);
                    const xmlFile = zip.file('word/document.xml');
                    if (!xmlFile) { reject(new Error('Not a valid DOCX')); return; }
                    const xmlStr = await xmlFile.async('string');
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
                    const nodes = xmlDoc.getElementsByTagNameNS(
                        'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't'
                    );
                    const text = Array.from(nodes).map(n => n.textContent).join(' ');
                    resolve({ text, pages: null, ext: 'docx' });
                } catch (e) { reject(e); }
            });
        });
    }

    // .doc — binary, cannot parse client-side
    return { text: null, pages: null, ext: 'doc', unsupported: true };
}

/* ══════════════════════════════════════════
   SECTION DETECTOR
   Checks extracted text for required section keywords
══════════════════════════════════════════ */

// Built-in section groups — any alias match = section found
const _BUILTIN_SECTIONS = [
    { label: 'Title Page', aliases: ['title page', 'thesis title', 'submitted by', 'submitted to', 'norzagaray college'], required: true },
    { label: 'Abstract', aliases: ['abstract', 'executive summary'], required: true },
    { label: 'Table of Contents', aliases: ['table of contents', 'contents'], required: true },
    { label: 'Chapter 1 — Introduction', aliases: ['chapter 1', 'chapter i', 'introduction', 'background of the study'], required: true },
    { label: 'Statement of the Problem', aliases: ['statement of the problem', 'problem statement', 'research problem'], required: true },
    { label: 'Scope and Delimitation', aliases: ['scope and delimitation', 'scope and limitation', 'scope of the study'], required: true },
    { label: 'Review of Related Literature', aliases: ['review of related literature', 'review of related studies', 'related literature'], required: true },
    { label: 'Research Methodology', aliases: ['research methodology', 'methodology', 'chapter 3', 'chapter iii', 'research design'], required: true },
    { label: 'References / Bibliography', aliases: ['references', 'bibliography', 'works cited'], required: true },
];

// Style checks — CANNOT be auto-detected from extracted text → always manual
const _STYLE_CHECKS = [
    { label: 'Font: Times New Roman 12pt', detail: 'Open the file and verify font is Times New Roman, size 12.' },
    { label: 'Line Spacing: Double-spaced', detail: 'Check that body text uses double (2.0) line spacing.' },
    { label: 'Margins: 1-inch all sides', detail: 'Verify margins are set to 1 inch on all sides (or per template).' },
    { label: 'Page Numbering', detail: 'Check that pages are numbered correctly (bottom center or top right).' },
    { label: 'APA Citation Style', detail: 'Spot-check in-text citations and reference list for APA 7th edition format.' },
];

function _detectSections(text, templateRules) {
    const lower = text.toLowerCase();
    const results = [];

    // Built-in sections
    _BUILTIN_SECTIONS.forEach(sec => {
        const found = sec.aliases.some(alias => lower.includes(alias));
        results.push({
            label: sec.label,
            found,
            type: 'section',
            required: sec.required,
            detail: found ? 'Detected in document.' : `Could not find "${sec.aliases[0]}" — verify section exists.`,
        });
    });

    // Template rule sections (Required / Length types only — Style/File go to manual)
    if (templateRules && templateRules.length > 0) {
        templateRules
            .filter(r => !['Style', 'File'].includes(r.type))
            .forEach(rule => {
                const keywords = rule.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                const found = keywords.length > 0 && keywords.some(kw => lower.includes(kw));
                results.push({
                    label: `[Template] ${rule.name}`,
                    found,
                    type: 'template-section',
                    required: rule.type === 'Required',
                    detail: found ? (rule.detail || 'Detected in document.') : (rule.detail || `Could not find "${rule.name}" — verify manually.`),
                    ruleType: rule.type,
                });
            });
    }

    return results;
}

/* ══════════════════════════════════════════
   FORMAT CHECK MODAL
══════════════════════════════════════════ */
function openFormatModal(id) {
    const thesis = (window.theses ?? []).find(t => t.id === id);
    if (!thesis) return;

    let modal = document.getElementById('formatModal');
    if (!modal) modal = createFormatModal();

    document.getElementById('formatModalTitle').textContent = thesis.title;
    document.getElementById('formatModalStudent').textContent = thesis.student;

    populateTemplateSelector(thesis);

    document.getElementById('formatSelectStep').style.display = 'block';
    document.getElementById('formatResultBody').innerHTML = '';
    document.getElementById('formatResultBody').style.display = 'none';
    document.getElementById('formatRunBtn').style.display = 'inline-flex';
    document.getElementById('formatBackBtn').style.display = 'none';

    openModal('formatModal');
}

function createFormatModal() {
    const modal = document.createElement('div');
    modal.id = 'formatModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:720px;">
            <div class="modal-header">
                <h2>📋 Format Check</h2>
                <button class="modal-close" onclick="closeModal('formatModal')">✕</button>
            </div>
            <div class="modal-body">
                <div class="fp-meta">
                    <div><span class="fp-label">Title</span><span id="formatModalTitle">—</span></div>
                    <div><span class="fp-label">Student</span><span id="formatModalStudent">—</span></div>
                </div>
                <div id="formatSelectStep">
                    <div class="fp-section-title">Select Format Template</div>
                    <p style="font-size:13px;color:var(--color-text-secondary);margin:0 0 12px;">
                        Choose the formatting standard to check this submission against.
                    </p>
                    <div id="templateSelectorCards" class="tpl-selector-cards"></div>
                    <div id="builtinCard" class="tpl-card" data-tplid="__builtin__" onclick="selectTemplateCard(this)">
                        <div class="tpl-card-header">
                            <span class="tpl-card-icon">🔧</span>
                            <div><div class="tpl-card-name">Built-in Checks Only</div><div class="tpl-card-type">General</div></div>
                            <span class="tpl-card-badge tpl-badge-neutral">Default</span>
                        </div>
                        <div class="tpl-card-desc">Metadata checks + required section detection (Chapter 1–5, Abstract, References…) + style review checklist. No custom template rules.</div>
                    </div>
                </div>
                <div id="formatResultBody" style="display:none;"></div>
            </div>
            <div class="modal-footer">
                <button class="btn-modal-close" onclick="closeModal('formatModal')">Cancel</button>
                <button id="formatBackBtn" class="btn-modal-close" onclick="showFormatSelectStep()" style="display:none;">← Back</button>
                <button id="formatRunBtn" class="btn-modal-submit" onclick="runSelectedFormatCheck()">Run Format Check →</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('formatModal'); });
    return modal;
}

function populateTemplateSelector(thesis) {
    const container = document.getElementById('templateSelectorCards');
    container.innerHTML = '';
    let templates = [];
    try { templates = JSON.parse(localStorage.getItem('aidea_format_templates') || '[]'); } catch { templates = []; }
    const activeTemplates = templates.filter(t => t.active);

    if (activeTemplates.length === 0) {
        container.innerHTML = `<div style="font-size:13px;color:var(--color-text-secondary);padding:8px 0;">
            No active templates found. <a href="../Format templates/formatting.html" style="color:var(--color-text-info);">Create one →</a>
        </div>`;
        setTimeout(() => { const b = document.getElementById('builtinCard'); if (b) selectTemplateCard(b); }, 0);
        return;
    }

    activeTemplates.forEach(t => {
        const isMatch = t.type === thesis.service || t.type === 'General';
        const card = document.createElement('div');
        card.className = 'tpl-card' + (isMatch ? ' tpl-card-suggested' : '');
        card.dataset.tplid = t.id;
        card.onclick = function () { selectTemplateCard(this); };
        const typeColors = { 'Proposal': 'tpl-badge-blue', 'Final Defense': 'tpl-badge-green', 'Revised Final': 'tpl-badge-amber', 'General': 'tpl-badge-neutral' };
        card.innerHTML = `
            <div class="tpl-card-header">
                <span class="tpl-card-icon">📐</span>
                <div><div class="tpl-card-name">${t.name}</div><div class="tpl-card-type">${t.type}</div></div>
                <span class="tpl-card-badge ${typeColors[t.type] || 'tpl-badge-neutral'}">${t.type}</span>
                ${isMatch ? '<span class="tpl-card-match">✓ Matches submission type</span>' : ''}
            </div>
            <div class="tpl-card-desc">${t.description || 'No description.'}</div>
            <div class="tpl-card-rules"><span>📋 ${t.rules?.length || 0} rules</span>${t.file ? '<span>📎 Reference file attached</span>' : ''}</div>`;
        container.appendChild(card);
    });

    setTimeout(() => {
        const target = container.querySelector('.tpl-card-suggested') || container.querySelector('.tpl-card') || document.getElementById('builtinCard');
        if (target) selectTemplateCard(target);
    }, 0);
}

function selectTemplateCard(el) {
    document.querySelectorAll('.tpl-card').forEach(c => c.classList.remove('tpl-card-selected'));
    el.classList.add('tpl-card-selected');
}

function showFormatSelectStep() {
    document.getElementById('formatSelectStep').style.display = 'block';
    document.getElementById('formatResultBody').style.display = 'none';
    document.getElementById('formatResultBody').innerHTML = '';
    document.getElementById('formatRunBtn').style.display = 'inline-flex';
    document.getElementById('formatBackBtn').style.display = 'none';
}

function runSelectedFormatCheck() {
    const selectedCard = document.querySelector('.tpl-card.tpl-card-selected');
    if (!selectedCard) { alert('Please select a template first.'); return; }

    const tplId = selectedCard.dataset.tplid;
    const title = document.getElementById('formatModalTitle').textContent;
    const thesis = (window.theses ?? []).find(t => t.title === title);
    if (!thesis) return;

    document.getElementById('formatSelectStep').style.display = 'none';
    const resultBody = document.getElementById('formatResultBody');
    resultBody.style.display = 'block';
    resultBody.innerHTML = renderFormatSkeleton('Reading submitted file…');
    document.getElementById('formatRunBtn').style.display = 'none';
    document.getElementById('formatBackBtn').style.display = 'inline-flex';

    setTimeout(() => runFormatCheck(thesis, tplId), 80);
}

/* ══════════════════════════════════════════
   MAIN FORMAT CHECK ENGINE
══════════════════════════════════════════ */
async function runFormatCheck(thesis, selectedTplId) {
    const resultBody = document.getElementById('formatResultBody');

    // ── 1. Metadata checks ──
    const metaRules = [
        { label: 'Title', check: t => t.title?.trim().length > 0, pass: 'Present', fail: 'Missing title' },
        { label: 'Abstract', check: t => (t.abstract?.trim().length ?? 0) >= 150, pass: 'Sufficient length (≥150 chars)', fail: `Too short (${thesis.abstract?.trim().length || 0} chars, min 150)` },
        { label: 'Adviser', check: t => t.adviser?.trim().length > 0, pass: 'Named', fail: 'Adviser not specified' },
        { label: 'Authors', check: t => t.authors && t.authors !== '—', pass: 'Provided', fail: 'No authors listed' },
        { label: 'Course', check: t => t.course?.trim().length > 0, pass: 'Specified', fail: 'Course missing' },
        { label: 'Academic Year', check: t => /\d{4}/.test(t.year ?? ''), pass: 'Valid format', fail: 'Invalid or missing year' },
        { label: 'Submission Type', check: t => t.service?.trim().length > 0, pass: 'Specified', fail: 'Submission type missing' },
        { label: 'File Attached', check: t => getFileName(t.file).length > 0, pass: 'File present', fail: 'No file submitted' },
        { label: 'File Type', check: t => ['pdf', 'doc', 'docx'].includes(getFileExt(t.file)), pass: 'Accepted format (PDF/DOC/DOCX)', fail: 'Unsupported file type' },
    ];
    const metaResults = metaRules.map(r => ({
        label: r.label,
        passed: r.check(thesis),
        message: r.check(thesis) ? r.pass : r.fail,
    }));

    // ── 2. Load template ──
    let templateInfo = null;
    if (selectedTplId && selectedTplId !== '__builtin__') {
        try {
            const templates = JSON.parse(localStorage.getItem('aidea_format_templates') || '[]');
            templateInfo = templates.find(t => String(t.id) === String(selectedTplId));
        } catch { templateInfo = null; }
    }
    const templateRules = templateInfo?.rules || [];

    // ── 3. Extract text from submitted file ──
    //
    // FIX: If thesis.file is a plain API object (not a real File/Blob), we cannot
    // fetch it client-side (CORS, missing auth token, or local server URL).
    // In this case, skip section extraction gracefully instead of throwing an error.
    //
    let extractedText = null;
    let extractedPages = null;
    let extractError = null;
    let isUnsupported = false;
    let isRemoteFile = false;

    if (thesis.file && getFileName(thesis.file)) {
        // Check if this is a real File/Blob or just API metadata {name, url, size}
        if (!isRealFileBlob(thesis.file)) {
            // Plain API object — we cannot read its bytes client-side
            isRemoteFile = true;
        } else {
            resultBody.innerHTML = renderFormatSkeleton('Extracting text from submitted file…');
            try {
                const extracted = await _extractTextFromFile(thesis.file);
                if (extracted.unsupported) {
                    isUnsupported = true;
                } else {
                    extractedText = extracted.text || '';
                    extractedPages = extracted.pages;
                }
            } catch (e) {
                extractError = e.message;
                console.warn('[FormatCheck] File extraction failed:', e);
            }
        }
    }

    // ── 4. Section detection ──
    let sectionResults = [];
    if (extractedText && extractedText.trim().length > 50) {
        sectionResults = _detectSections(extractedText, templateRules);
    }

    // ── 5. Word count ──
    let wordCount = 0;
    let wordCountOk = true;
    if (extractedText) {
        wordCount = extractedText.split(/\s+/).filter(Boolean).length;
        wordCountOk = wordCount >= 500;
    }

    // ── 6. Style checks — always manual ──
    const templateStyleRules = templateRules
        .filter(r => ['Style', 'File'].includes(r.type))
        .map(r => ({ label: `[Template] ${r.name}`, detail: r.detail || 'Verify manually against template.' }));
    const allStyleChecks = [..._STYLE_CHECKS, ...templateStyleRules];

    // ── 7. Score ──
    const metaPassed = metaResults.filter(r => r.passed).length;
    const metaTotal = metaResults.length;
    const sectionPassed = sectionResults.filter(r => r.found).length;
    const sectionTotal = sectionResults.length;

    let score;
    if (sectionTotal > 0) {
        score = Math.round(((metaPassed / metaTotal) * 40) + ((sectionPassed / sectionTotal) * 60));
    } else {
        score = Math.round((metaPassed / metaTotal) * 100);
    }

    const grade = score === 100 ? 'Excellent' : score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Needs Attention';
    const gradeColor = score === 100 ? '#22c55e' : score >= 80 ? '#3b82f6' : score >= 60 ? '#f59e0b' : '#ef4444';

    // ── 8. Render ──
    const templateBadge = templateInfo
        ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">
               Template: <strong style="color:#fff;">${templateInfo.name}</strong>
               <span style="margin-left:6px;font-size:10px;background:#1e2235;padding:2px 6px;border-radius:4px;color:#a0a4b8;">${templateInfo.type}</span>
           </div>`
        : `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">Built-in checks only</div>`;

    // Build the file banner based on which skip reason applies
    let fileBanner = '';
    if (isRemoteFile) {
        // ── FIX: clear, helpful message instead of "Failed to fetch" ──
        fileBanner = `<div class="fp-notice warning" style="margin-bottom:12px;">
            ℹ️ <strong>File is stored on the server.</strong>
            Section content checks require the file to be read client-side, which is not possible
            for server-uploaded files due to browser security restrictions.
            <br><br>
            <strong>To view the file:</strong> use the
            <em>View 📎</em> or <em>⬇ Download</em> button on the submission, then verify sections manually.
            Metadata checks below still ran successfully.
        </div>`;
    } else if (isUnsupported) {
        fileBanner = `<div class="fp-notice warning" style="margin-bottom:12px;">
            ⚠️ <strong>.doc (legacy Word)</strong> format cannot be read client-side.
            Section checks are skipped — please review the file manually.
        </div>`;
    } else if (extractError) {
        fileBanner = `<div class="fp-notice warning" style="margin-bottom:12px;">
            ⚠️ Could not read file: <em>${extractError}</em>. Section checks skipped. Metadata checks still ran.
        </div>`;
    } else if (extractedText) {
        fileBanner = `<div style="font-size:12px;color:#4ade80;margin-bottom:10px;">
            ✅ File read successfully — <strong>${wordCount.toLocaleString()} words</strong>
            ${extractedPages ? ` · <strong>${extractedPages} pages</strong>` : ''}
        </div>`;
    }

    // Determine section skip reason for the "skipped" notice
    const sectionSkipReason = isRemoteFile
        ? 'file is stored on the server and cannot be read client-side.'
        : isUnsupported
            ? '.doc files cannot be read client-side.'
            : extractError
                ? 'file could not be read.'
                : 'no file submitted.';

    resultBody.innerHTML = `
        ${templateBadge}

        <div class="fp-score-wrap">
            <div class="fp-score-circle" style="--score-color:${gradeColor};">
                <span class="fp-score-num">${score}%</span>
                <span class="fp-score-grade">${grade}</span>
            </div>
            <div class="fp-score-sub">
                ${metaPassed}/${metaTotal} metadata
                ${sectionTotal > 0 ? ` · ${sectionPassed}/${sectionTotal} sections found` : ''}
            </div>
        </div>

        ${fileBanner}

        <!-- Metadata checks -->
        <div class="fp-section-title">📋 Metadata Checks</div>
        <div class="fp-checklist">
            ${metaResults.map(r => `
                <div class="fp-check-row ${r.passed ? 'fp-pass' : 'fp-fail'}">
                    <span class="fp-check-icon">${r.passed ? '✅' : '❌'}</span>
                    <span class="fp-check-label">${r.label}</span>
                    <span class="fp-check-msg">${r.message}</span>
                </div>`).join('')}
        </div>

        <!-- Section checks -->
        ${sectionResults.length > 0 ? `
        <div class="fp-section-title" style="margin-top:16px;">📑 Required Sections
            <span style="font-size:10px;font-weight:400;margin-left:6px;color:#666;">— detected from file content</span>
        </div>
        <div class="fp-checklist">
            ${sectionResults.map(r => `
                <div class="fp-check-row ${r.found ? 'fp-pass' : (r.required ? 'fp-fail' : 'fp-info')}">
                    <span class="fp-check-icon">${r.found ? '✅' : (r.required ? '❌' : '⚠️')}</span>
                    <span class="fp-check-label" style="min-width:210px;">${r.label}
                        ${r.ruleType ? `<span style="font-size:10px;opacity:.6;margin-left:4px;">[${r.ruleType}]</span>` : ''}
                    </span>
                    <span class="fp-check-msg">${r.detail}</span>
                </div>`).join('')}
        </div>` : `
        <div class="fp-section-title" style="margin-top:16px;">📑 Required Sections</div>
        <div class="fp-notice warning">
            ⚠️ Section detection skipped — ${sectionSkipReason}
            ${isRemoteFile ? `<br><span style="font-size:12px;opacity:.8;">Open the file using the View/Download button and verify sections manually.</span>` : ''}
        </div>`}

        ${!wordCountOk && wordCount > 0 ? `
        <div class="fp-notice warning" style="margin-top:8px;">
            ⚠️ Low word count (${wordCount.toLocaleString()} words). A thesis should have at least 500+ words. Ensure the full document was submitted.
        </div>` : ''}

        <!-- Style checks — always manual -->
        <div class="fp-section-title" style="margin-top:16px;">
            🎨 Style & Formatting
            <span style="font-size:10px;font-weight:400;color:var(--color-text-secondary);margin-left:8px;">— open the file to verify these manually</span>
        </div>
        <div class="fp-checklist">
            ${allStyleChecks.map(r => `
                <div class="fp-check-row fp-manual">
                    <span class="fp-check-icon">🔍</span>
                    <span class="fp-check-label" style="min-width:210px;">${r.label}</span>
                    <span class="fp-check-msg">${r.detail}</span>
                </div>`).join('')}
        </div>
        <div class="fp-notice warning" style="margin-top:10px;">
            🔍 <strong>${allStyleChecks.length} style rule${allStyleChecks.length !== 1 ? 's' : ''}</strong> require manual review —
            open the student's file to verify font, spacing, and margins.
        </div>

        ${score < 60
            ? `<div class="fp-notice warning" style="margin-top:10px;">⚠️ Score is low. Ask the student to revise before approval.</div>`
            : `<div class="fp-notice success" style="margin-top:10px;">✅ Automated checks complete. Review style rules manually before final approval.</div>`
        }
    `;
}

/* ══════════════════════════════════════════
   PLAGIARISM CHECK MODAL
══════════════════════════════════════════ */
function openPlagiarismModal(id) {
    const thesis = (window.theses ?? []).find(t => t.id === id);
    if (!thesis) return;

    let modal = document.getElementById('plagiarismModal');
    if (!modal) modal = createPlagiarismModal();

    document.getElementById('plagModalTitle').textContent = thesis.title;
    document.getElementById('plagModalStudent').textContent = thesis.student;
    document.getElementById('plagResultBody').innerHTML = renderFormatSkeleton('Analysing text…');

    openModal('plagiarismModal');
    setTimeout(() => runPlagiarismCheck(thesis), 80);
}

function createPlagiarismModal() {
    const modal = document.createElement('div');
    modal.id = 'plagiarismModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:720px;">
            <div class="modal-header">
                <h2>🔍 Plagiarism Check</h2>
                <button class="modal-close" onclick="closeModal('plagiarismModal')">✕</button>
            </div>
            <div class="modal-body">
                <div class="fp-meta">
                    <div><span class="fp-label">Title</span><span id="plagModalTitle">—</span></div>
                    <div><span class="fp-label">Student</span><span id="plagModalStudent">—</span></div>
                </div>
                <div id="plagResultBody"></div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('plagiarismModal'); });
    return modal;
}

function analyseTextLocally(text) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    if (totalWords < 20) return { risk: 'insufficient', score: null, flags: [] };

    const flags = [];
    const uniqueWords = new Set(words).size;
    const ttr = uniqueWords / totalWords;
    if (ttr < 0.35) flags.push({ type: 'warning', msg: `Low vocabulary diversity (${Math.round(ttr * 100)}% unique words). May indicate copied text.` });

    const ngramMap = {};
    for (let i = 0; i <= words.length - 5; i++) {
        const gram = words.slice(i, i + 5).join(' ');
        ngramMap[gram] = (ngramMap[gram] || 0) + 1;
    }
    const repeatedGrams = Object.entries(ngramMap).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (repeatedGrams.length >= 3) flags.push({ type: 'warning', msg: `${repeatedGrams.length} repeated phrase patterns found — possible copy-paste.` });

    const boilerplate = ['this study aims to', 'the purpose of this research', 'the results showed that', 'based on the findings', 'it can be concluded that', 'the researchers found that', 'according to the literature', 'as mentioned by', 'in light of the above', 'the present study', 'a review of related literature', 'the data gathered', 'analysis of the data', 'research has shown that'];
    const hits = boilerplate.filter(p => text.toLowerCase().includes(p));
    if (hits.length >= 4) flags.push({ type: 'info', msg: `${hits.length} common academic boilerplate phrases detected. Normal but may mask paraphrased content.` });

    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    const sentLengths = sentences.map(s => s.split(/\s+/).length);
    if (sentLengths.length > 3) {
        const avg = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
        const variance = sentLengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / sentLengths.length;
        if (variance < 4) flags.push({ type: 'info', msg: 'Unusually uniform sentence lengths — possible AI-generated or heavily templated text.' });
    }

    const rawScore = flags.reduce((acc, f) => acc + (f.type === 'warning' ? 20 : 8), 0);
    const score = Math.min(rawScore, 85);
    return { risk: score === 0 ? 'low' : score < 30 ? 'moderate' : 'high', score, flags, totalWords, uniqueWords, ttr };
}

function runPlagiarismCheck(thesis) {
    const resultBody = document.getElementById('plagResultBody');
    const textToCheck = `${thesis.title ?? ''}\n\n${thesis.abstract ?? ''}`.trim();

    if (textToCheck.length < 80) {
        resultBody.innerHTML = `<div class="fp-notice warning">⚠️ Not enough text to analyse (abstract too short).</div>${renderExternalTools(textToCheck)}`;
        return;
    }

    const result = analyseTextLocally(textToCheck);
    const riskMeta = {
        insufficient: { color: '#888', label: 'Insufficient Text', sub: 'Need more text to analyse' },
        low: { color: '#22c55e', label: 'Low Risk', sub: 'No major issues detected locally' },
        moderate: { color: '#f59e0b', label: 'Moderate Risk', sub: 'Some patterns worth reviewing' },
        high: { color: '#ef4444', label: 'High Risk', sub: 'Multiple suspicious patterns found' },
    };
    const meta = riskMeta[result.risk];
    const scoreDisplay = result.score !== null ? `${result.score}%` : '—';

    resultBody.innerHTML = `
        <div class="fp-score-wrap">
            <div class="fp-score-circle" style="--score-color:${meta.color};">
                <span class="fp-score-num" style="font-size:22px;">${scoreDisplay}</span>
                <span class="fp-score-grade">${meta.label}</span>
            </div>
            <div class="fp-score-sub">${meta.sub}</div>
        </div>
        ${result.totalWords ? `
        <div class="fp-stats-row">
            <div class="fp-stat"><span class="fp-stat-num">${result.totalWords}</span><span class="fp-stat-lbl">Total Words</span></div>
            <div class="fp-stat"><span class="fp-stat-num">${result.uniqueWords}</span><span class="fp-stat-lbl">Unique Words</span></div>
            <div class="fp-stat"><span class="fp-stat-num">${Math.round(result.ttr * 100)}%</span><span class="fp-stat-lbl">Diversity</span></div>
        </div>` : ''}
        <div class="fp-section-title">Local Analysis Findings</div>
        ${result.flags.length === 0
            ? `<div class="fp-notice success">✅ No suspicious patterns detected.</div>`
            : `<div class="fp-checklist">${result.flags.map(f => `
                <div class="fp-check-row ${f.type === 'warning' ? 'fp-fail' : 'fp-info'}">
                    <span class="fp-check-icon">${f.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                    <span class="fp-check-msg" style="color:var(--color-text-secondary);">${f.msg}</span>
                </div>`).join('')}</div>`}
        <div class="fp-notice warning" style="margin-top:14px;">
            ℹ️ <strong>Local analysis only.</strong> Use the tools below for a full web-based scan.
        </div>
        ${renderExternalTools(textToCheck)}`;
}

function renderExternalTools(text) {
    window._plagTextCache = text;
    return `
        <div class="fp-section-title" style="margin-top:18px;">Full Plagiarism Scan — External Tools</div>
        <p style="font-size:12px;color:var(--color-text-secondary);margin:0 0 10px;">Copy the abstract text, then open one of these free checkers:</p>
        <button class="btn-fp-copy" onclick="copyPlagText()">📋 Copy Abstract Text</button>
        <div id="copyConfirm" style="font-size:11px;color:#4ade80;margin:4px 0 10px;display:none;">✔ Copied!</div>
        <div class="fp-manual-btns">
            <a class="btn-fp-manual" href="https://www.scribbr.com/plagiarism-checker/" target="_blank" rel="noopener">📝 Scribbr <span class="fp-tool-badge">Recommended</span></a>
            <a class="btn-fp-manual" href="https://copyleaks.com/plagiarism-checker" target="_blank" rel="noopener">🔎 Copyleaks</a>
            <a class="btn-fp-manual" href="https://www.duplichecker.com/" target="_blank" rel="noopener">📄 DupliChecker</a>
            <a class="btn-fp-manual" href="https://www.quetext.com/" target="_blank" rel="noopener">🧪 Quetext</a>
            <a class="btn-fp-manual" href="https://www.turnitin.com" target="_blank" rel="noopener">🏫 Turnitin</a>
        </div>`;
}

function copyPlagText() {
    const text = window._plagTextCache ?? '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const el = document.getElementById('copyConfirm');
        if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2500); }
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        const el = document.getElementById('copyConfirm');
        if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2500); }
    });
}

/* ══════════════════════════════════════════
   SKELETON LOADER
══════════════════════════════════════════ */
function renderFormatSkeleton(msg = 'Running checks…') {
    return `<div class="fp-skeleton"><div class="fp-skeleton-spinner"></div><div class="fp-skeleton-msg">${msg}</div></div>`;
}

/* ══════════════════════════════════════════
   STYLES
══════════════════════════════════════════ */
(function injectFPStyles() {
    if (document.getElementById('fp-styles')) return;
    const style = document.createElement('style');
    style.id = 'fp-styles';
    style.textContent = `
        .fp-meta { display:flex; flex-direction:column; gap:6px; margin-bottom:18px; padding:12px 16px; background:#1a1d2e; border-radius:10px; }
        .fp-meta > div { display:flex; gap:10px; align-items:baseline; font-size:13px; color:#fff; }
        .fp-label { color:#888; min-width:90px; font-size:12px; text-transform:uppercase; letter-spacing:.5px; }

        .tpl-selector-cards { display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
        .tpl-card { border:1.5px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 14px; cursor:pointer; background:#12152a; transition:border-color .15s,background .15s; }
        .tpl-card:hover { border-color:rgba(99,102,241,0.4); background:#181b30; }
        .tpl-card-selected { border-color:#6366f1 !important; background:#1e2040 !important; }
        .tpl-card-suggested { border-color:rgba(34,197,94,0.25); }
        .tpl-card-header { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
        .tpl-card-icon { font-size:18px; flex-shrink:0; }
        .tpl-card-name { font-size:13px; font-weight:600; color:#ddd; }
        .tpl-card-type { font-size:11px; color:#888; }
        .tpl-card-badge { margin-left:auto; font-size:10px; padding:2px 8px; border-radius:10px; font-weight:600; }
        .tpl-card-match { font-size:10px; color:#4ade80; white-space:nowrap; }
        .tpl-badge-blue   { background:#0f2a50; color:#60a5fa; border:1px solid #1e4080; }
        .tpl-badge-green  { background:#0f2a1a; color:#4ade80; border:1px solid #1e5030; }
        .tpl-badge-amber  { background:#2a1f0f; color:#fbbf24; border:1px solid #604010; }
        .tpl-badge-neutral{ background:#1e2235; color:#a0a4b8; border:1px solid #2e3250; }
        .tpl-card-desc { font-size:12px; color:#888; line-height:1.5; margin-bottom:6px; }
        .tpl-card-rules { display:flex; gap:14px; font-size:11px; color:#666; }

        .fp-score-wrap { display:flex; flex-direction:column; align-items:center; padding:20px 0 14px; }
        .fp-score-circle { width:110px; height:110px; border-radius:50%; border:6px solid var(--score-color,#888); display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom:8px; }
        .fp-score-num { font-size:28px; font-weight:700; color:#fff; line-height:1; }
        .fp-score-grade { font-size:11px; color:#aaa; margin-top:2px; }
        .fp-score-sub { font-size:12px; color:#888; }

        .fp-stats-row { display:flex; justify-content:center; gap:24px; margin:10px 0 16px; }
        .fp-stat { display:flex; flex-direction:column; align-items:center; }
        .fp-stat-num { font-size:20px; font-weight:700; color:#fff; }
        .fp-stat-lbl { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:.4px; }

        .fp-checklist { display:flex; flex-direction:column; gap:6px; margin:10px 0; }
        .fp-check-row { display:flex; align-items:flex-start; gap:10px; padding:9px 14px; border-radius:8px; font-size:13px; }
        .fp-pass   { background:#0f2a1a; }
        .fp-fail   { background:#2a0f0f; }
        .fp-info   { background:#1a1a2e; }
        .fp-manual { background:#1a1a2e; border-left:3px solid #6366f1; }
        .fp-check-icon  { font-size:15px; flex-shrink:0; margin-top:1px; }
        .fp-check-label { font-weight:600; min-width:130px; color:#ddd; }
        .fp-check-msg   { color:#aaa; font-size:12px; line-height:1.5; }

        .fp-section-title { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#888; margin:14px 0 8px; }

        .fp-notice { padding:12px 16px; border-radius:8px; font-size:13px; margin-top:10px; line-height:1.5; }
        .fp-notice.success { background:#0f2a1a; color:#4ade80; border-left:4px solid #22c55e; }
        .fp-notice.warning { background:#2a1f0f; color:#fbbf24; border-left:4px solid #f59e0b; }

        .btn-fp-copy { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; background:#3b3f6e; color:#c0c4d6; border:1px solid #4e54a0; cursor:pointer; transition:background .2s; margin-bottom:4px; }
        .btn-fp-copy:hover { background:#4e54a0; color:#fff; }
        .fp-manual-btns { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
        .btn-fp-manual { padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600; background:#1e2235; color:#c0c4d6; text-decoration:none; border:1px solid #2e3250; transition:background .2s; display:inline-flex; align-items:center; gap:6px; }
        .btn-fp-manual:hover { background:#2a2f4a; color:#fff; }
        .fp-tool-badge { font-size:9px; background:#22c55e22; color:#4ade80; padding:1px 5px; border-radius:4px; border:1px solid #22c55e44; }

        .fp-skeleton { display:flex; flex-direction:column; align-items:center; padding:40px 0; gap:14px; }
        .fp-skeleton-spinner { width:36px; height:36px; border:4px solid #2e3250; border-top-color:#6366f1; border-radius:50%; animation:fp-spin .7s linear infinite; }
        @keyframes fp-spin { to { transform:rotate(360deg); } }
        .fp-skeleton-msg { font-size:13px; color:#888; }
    `;
    document.head.appendChild(style);
})();

/* ══════════════════════════════════════════
   PATCH render() — inject Format & Plagiarism buttons
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    const _originalRender = window.render;
    if (typeof _originalRender === 'function') {
        window.render = function () { _originalRender(); injectFPButtons(); };
    } else {
        const observer = new MutationObserver(() => injectFPButtons());
        const tbody = document.getElementById('thesisBody');
        if (tbody) observer.observe(tbody, { childList: true });
    }
});

function injectFPButtons() {
    const rows = document.querySelectorAll('#thesisBody tr');
    rows.forEach(row => {
        if (row.querySelector('.btn-fp') || row.cells.length < 7) return;
        const id = parseInt(row.cells[0]?.textContent?.trim());
        if (isNaN(id)) return;
        const actionCell = row.querySelector('.action-cell');
        if (!actionCell) return;
        actionCell.insertAdjacentHTML('beforeend', `
            <button class="btn-action btn-fp" onclick="openFormatModal(${id})" title="Check formatting">📋 Format</button>
            <button class="btn-action btn-fp" onclick="openPlagiarismModal(${id})" title="Check plagiarism">🔍 Plagiarism</button>
        `);
    });
}