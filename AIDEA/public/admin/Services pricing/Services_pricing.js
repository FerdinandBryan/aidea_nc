// Services_pricing.js — AIDEA Admin | Laravel API + Universal Code Detection + Icon Picker

const API_BASE = 'http://127.0.0.1:8000/api';
const LOGIN_URL = '../../user/login/login.html';

let services = [];
let priceHistory = [];
let editingId = null;
let isAddMode = false;
let pendingQRB64 = null;
let selectedIcon = '🛠️';
let iconPickerOpen = false;

// ── Persist price history to localStorage ──
function savePriceHistory() {
    localStorage.setItem('aidea_price_history', JSON.stringify(priceHistory));
}

function loadPriceHistory() {
    try {
        priceHistory = JSON.parse(localStorage.getItem('aidea_price_history') || '[]');
    } catch {
        priceHistory = [];
    }
}

// ══════════════════════════════════════════
//  ICON PICKER CONFIG
// ══════════════════════════════════════════

const ICON_OPTIONS = [
    '🛠️', '📊', '📈', '📉', '📝', '💡', '🔬', '📐', '🧮', '📋',
    '🖊️', '📖', '🔍', '📌', '🗂️', '💼', '🎓', '🏫', '📚', '✏️',
    '🧑‍💻', '💻', '🖥️', '📡', '🤖', '⚙️', '🔧', '🔩', '🧩', '🗃️',
    '📦', '🧾', '💳', '💰', '🏆', '🥇', '✅', '🚀', '🌐', '🧠',
];

function buildIconPicker() {
    const grid = document.getElementById('iconPickerGrid');
    if (!grid) return;
    grid.innerHTML = ICON_OPTIONS.map(icon => `
        <button type="button" class="icon-opt ${icon === selectedIcon ? 'selected' : ''}"
            data-icon="${icon}" title="${icon}" onclick="selectIcon('${icon}')">
            ${icon}
        </button>
    `).join('');
}

function toggleIconPicker() {
    iconPickerOpen = !iconPickerOpen;
    const grid = document.getElementById('iconPickerGrid');
    const toggleBtn = document.getElementById('iconPickerToggleBtn');
    if (grid) grid.style.display = iconPickerOpen ? 'grid' : 'none';
    if (toggleBtn) toggleBtn.textContent = iconPickerOpen ? 'Hide icons' : 'Pick icon';
}

function selectIcon(icon) {
    selectedIcon = icon;
    document.getElementById('iconDisplay').textContent = icon;
    document.querySelectorAll('.icon-opt').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.icon === icon);
    });
}

// ══════════════════════════════════════════
//  LOAD ZXing (multi-format scanner)
//  Supports: QR, Aztec, DataMatrix, PDF417,
//  Code128, Code39, EAN, UPC, ITF, Codabar…
// ══════════════════════════════════════════

let _zxingReady = false;
let _zxingPromise = null;

function loadZXing() {
    if (_zxingPromise) return _zxingPromise;

    _zxingPromise = new Promise((resolve, reject) => {
        if (window.ZXing && _zxingReady) return resolve();

        const script = document.createElement('script');
        // ZXing-js browser bundle — supports all common code formats
        script.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
        script.onload = () => {
            _zxingReady = true;
            setTimeout(resolve, 150); // small delay for module init
        };
        script.onerror = () => reject(new Error('Failed to load ZXing library'));
        document.head.appendChild(script);
    });

    return _zxingPromise;
}

// ══════════════════════════════════════════
//  SCREENSHOT DETECTION
//  Rejects phone/desktop screenshots by
//  checking dimensions & aspect ratios.
// ══════════════════════════════════════════

function isLikelyScreenshot(width, height) {
    const phoneResolutions = [
        [1080, 2400], [1080, 2340], [1080, 2280], [1080, 2220],
        [1080, 1920], [720, 1600], [720, 1280], [828, 1792],
        [1170, 2532], [1284, 2778], [1290, 2796], [1125, 2436],
        [1242, 2688], [1440, 3200], [1440, 3120], [1440, 2960],
        [1440, 2880], [412, 915], [393, 852],
    ];
    const desktopResolutions = [
        [1920, 1080], [2560, 1440], [1366, 768], [1280, 720],
        [1440, 900], [1680, 1050], [2048, 1152], [3840, 2160],
        [2560, 1600], [1280, 800], [1024, 768], [1280, 1024],
        [1600, 900], [2304, 1440], [2880, 1800], [2560, 1664],
        [1512, 982], [2560, 1080], [3440, 1440],
    ];

    for (const [w, h] of [...phoneResolutions, ...desktopResolutions]) {
        if ((width === w && height === h) || (width === h && height === w)) return true;
    }

    const ratio = Math.max(width, height) / Math.min(width, height);
    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);
    const phoneWidths = [360, 375, 390, 393, 412, 414, 428, 720, 828, 1080, 1125, 1170, 1242, 1284, 1290, 1440];

    if (ratio >= 1.7 && ratio <= 2.5 && phoneWidths.includes(shortSide)) return true;
    if (width * height > 1_200 * 900) return true;

    const is169 = Math.abs(ratio - 16 / 9) < 0.05;
    const is1610 = Math.abs(ratio - 16 / 10) < 0.05;
    const is43 = Math.abs(ratio - 4 / 3) < 0.05;
    if ((is169 || is1610 || is43) && longSide >= 1024) return true;

    return false;
}

// ══════════════════════════════════════════
//  UNIVERSAL CODE DETECTION
//  Returns: { isCode, isScreenshot, format }
//  format = e.g. "QR_CODE", "CODE_128", etc.
// ══════════════════════════════════════════

async function detectAnyCode(base64Image) {
    // ── Load ZXing ─────────────────────────
    try {
        await loadZXing();
    } catch {
        console.warn('ZXing failed to load — skipping code detection');
        return { isCode: false, isScreenshot: false, format: null };
    }

    return new Promise((resolve) => {
        const img = new Image();

        img.onload = async () => {
            try {
                const rawW = img.naturalWidth || img.width;
                const rawH = img.naturalHeight || img.height;

                // ── Screenshot check first ─────────────────
                if (isLikelyScreenshot(rawW, rawH)) {
                    return resolve({ isCode: false, isScreenshot: true, format: null });
                }

                // ── Draw to canvas (scale down large images) ─
                const MAX = 1024;
                let w = rawW, h = rawH;
                if (w > MAX || h > MAX) {
                    const ratio = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // ── ZXing multi-format decode ──────────────
                // ZXing works on HTMLImageElement or HTMLCanvasElement directly.
                const hints = new Map();

                // Enable all possible formats
                const { DecodeHintType, BarcodeFormat, MultiFormatReader, HTMLCanvasElementLuminanceSource, HybridBinarizer, BinaryBitmap } = window.ZXing;

                if (DecodeHintType && BarcodeFormat) {
                    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                        BarcodeFormat.QR_CODE,
                        BarcodeFormat.AZTEC,
                        BarcodeFormat.DATA_MATRIX,
                        BarcodeFormat.PDF_417,
                        BarcodeFormat.CODE_128,
                        BarcodeFormat.CODE_93,
                        BarcodeFormat.CODE_39,
                        BarcodeFormat.EAN_13,
                        BarcodeFormat.EAN_8,
                        BarcodeFormat.UPC_A,
                        BarcodeFormat.UPC_E,
                        BarcodeFormat.ITF,
                        BarcodeFormat.CODABAR,
                        BarcodeFormat.RSS_14,
                        BarcodeFormat.RSS_EXPANDED,
                        BarcodeFormat.MAXICODE,
                    ]);
                    hints.set(DecodeHintType.TRY_HARDER, true);
                }

                const reader = new MultiFormatReader();
                reader.setHints(hints);

                // Attempt 1: normal orientation
                try {
                    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
                    const binarizer = new HybridBinarizer(luminanceSource);
                    const bitmap = new BinaryBitmap(binarizer);
                    const result = reader.decode(bitmap);

                    if (result) {
                        return resolve({
                            isCode: true,
                            isScreenshot: false,
                            format: result.getBarcodeFormat?.() ?? 'UNKNOWN',
                        });
                    }
                } catch (_) { /* no code found on first pass */ }

                // Attempt 2: invert colours (some dark-background codes)
                try {
                    const invertedCanvas = document.createElement('canvas');
                    invertedCanvas.width = w;
                    invertedCanvas.height = h;
                    const ictx = invertedCanvas.getContext('2d');
                    ictx.filter = 'invert(1)';
                    ictx.drawImage(canvas, 0, 0);

                    const luminanceSource2 = new HTMLCanvasElementLuminanceSource(invertedCanvas);
                    const binarizer2 = new HybridBinarizer(luminanceSource2);
                    const bitmap2 = new BinaryBitmap(binarizer2);
                    const result2 = reader.decode(bitmap2);

                    if (result2) {
                        return resolve({
                            isCode: true,
                            isScreenshot: false,
                            format: result2.getBarcodeFormat?.() ?? 'UNKNOWN',
                        });
                    }
                } catch (_) { /* no code found on second pass */ }

                // Nothing detected
                resolve({ isCode: false, isScreenshot: false, format: null });

            } catch (e) {
                console.error('Code detection error:', e);
                resolve({ isCode: false, isScreenshot: false, format: null });
            }
        };

        img.onerror = () => resolve({ isCode: false, isScreenshot: false, format: null });
        img.src = base64Image;

        // Hard timeout — never block UI indefinitely
        setTimeout(() => resolve({ isCode: false, isScreenshot: false, format: null }), 10_000);
    });
}

// Human-readable format labels
const FORMAT_LABELS = {
    QR_CODE: 'QR Code',
    AZTEC: 'Aztec Code',
    DATA_MATRIX: 'DataMatrix',
    PDF_417: 'PDF417 Barcode',
    CODE_128: 'Code 128 Barcode',
    CODE_93: 'Code 93 Barcode',
    CODE_39: 'Code 39 Barcode',
    EAN_13: 'EAN-13 Barcode',
    EAN_8: 'EAN-8 Barcode',
    UPC_A: 'UPC-A Barcode',
    UPC_E: 'UPC-E Barcode',
    ITF: 'ITF Barcode',
    CODABAR: 'Codabar Barcode',
    RSS_14: 'RSS-14 Barcode',
    RSS_EXPANDED: 'RSS Expanded Barcode',
    MAXICODE: 'MaxiCode',
    UNKNOWN: 'Scannable Code',
};

function getFormatLabel(format) {
    if (!format) return 'Scannable Code';
    const key = typeof format === 'string' ? format : String(format);
    // ZXing may return enum numbers; convert if needed
    return FORMAT_LABELS[key] || 'Scannable Code';
}

// ══════════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════════

async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
        },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw err;
    }
    return res.json();
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════
//  FETCH SERVICES FROM DB
// ══════════════════════════════════════════

async function loadServices() {
    const grid = document.getElementById('servicesGrid');
    try {
        services = await apiFetch('/services');
        renderServices();
    } catch (err) {
        console.error('Failed to load services:', err);
        showToast('Failed to load services.', 'error');
        if (grid) {
            grid.setAttribute('aria-busy', 'false');
            grid.innerHTML = `
                <div class="services-empty">
                    <strong>Couldn't connect to the server</strong>
                    <div>Make sure the API is running, then refresh.</div>
                </div>`;
        }
    }
}

// ══════════════════════════════════════════
//  RENDER SERVICES GRID
// ══════════════════════════════════════════

function renderServices() {
    const grid = document.getElementById('servicesGrid');
    grid.setAttribute('aria-busy', 'false');

    if (!services.length) {
        grid.innerHTML = `
            <div class="services-empty">
                <strong>No services yet</strong>
                <div>Click "Add service" to get started.</div>
            </div>`;
        return;
    }

    grid.innerHTML = services.map((s, i) => {
        const items = parseResearchItems(s.research_requirement_text);
        return `
        <div class="service-card ${s.active ? '' : 'disabled'}" style="animation-delay:${i * 0.06}s">
            <span class="svc-icon">${s.icon && s.icon !== 'undefined' ? s.icon : '🛠️'}</span>
            <div class="svc-name">${escHtml(s.name)}</div>
            <div class="svc-desc">${escHtml(s.description || '')}</div>
            <div class="svc-price">₱ ${parseFloat(s.price).toLocaleString()}</div>

            ${s.requires_research_info ? `
                <div class="research-badge">Requires research info form</div>
                ${items.length ? `<ul class="research-items-preview">${items.map(item => `<li>${escHtml(item.text)} <span style="opacity:.75;">(${ITEM_TYPE_META[item.type].label})</span></li>`).join('')}</ul>` : ''}
            ` : ''}

            <!-- GCash Info Badge -->
            <div class="gcash-badge">
                <span class="gcash-tag">GCash</span>
                <span class="gcash-num">${escHtml(s.gcash_number || '—')}</span>
                ${s.gcash_qr
                ? `<img src="${s.gcash_qr}" alt="Code" class="gcash-qr-thumb"
                           onclick="previewQR(${s.id})" title="Click to preview"/>
                       ${s.is_qr_valid
                    ? `<span class="qr-status-ok">${s.code_format ? getFormatLabel(s.code_format) : 'Code valid'}</span>`
                    : `<span class="qr-status-warn">Not a scannable code</span>`
                }`
                : `<span class="qr-missing">No code on file</span>`
            }
            </div>

            <div class="svc-actions">
                <button class="btn-edit" type="button" onclick="openEdit(${s.id})">Edit</button>
                <button class="btn-toggle" type="button" onclick="toggleService(${s.id})">
                    ${s.active ? 'Disable' : 'Enable'}
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// ══════════════════════════════════════════
//  RENDER HISTORY TABLE
// ══════════════════════════════════════════

function renderHistory() {
    document.getElementById('historyBody').innerHTML = priceHistory.length
        ? priceHistory.map(h => {
            const up = h.newPrice > h.oldPrice;
            return `
                <tr>
                    <td><strong>${escHtml(h.service)}</strong></td>
                    <td>₱ ${parseFloat(h.oldPrice).toLocaleString()}</td>
                    <td class="${up ? 'price-up' : 'price-down'}">
                        ₱ ${parseFloat(h.newPrice).toLocaleString()} ${up ? '▲' : '▼'}
                    </td>
                    <td>${escHtml(h.by)}</td>
                    <td>${new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                </tr>
            `;
        }).join('')
        : `<tr><td colspan="5" class="table-empty">No price history yet.</td></tr>`;
}

// ══════════════════════════════════════════
//  OPEN EDIT MODAL
// ══════════════════════════════════════════

function openEdit(id) {
    editingId = id;
    isAddMode = false;
    pendingQRB64 = null;
    iconPickerOpen = false;

    const s = services.find(s => s.id === id);
    selectedIcon = s.icon && s.icon !== 'undefined' ? s.icon : '🛠️';

    document.getElementById('modalTitle').textContent = 'Edit Service';
    document.getElementById('editName').value = s.name;
    document.getElementById('editPrice').value = s.price;
    document.getElementById('editDesc').value = s.description || '';
    document.getElementById('editGcashNumber').value = s.gcash_number || '';
    document.getElementById('editRequiresResearch').checked = !!s.requires_research_info;
    researchItems = parseResearchItems(s.research_requirement_text);
    // If the requirement is on but no items were saved yet, seed with the defaults
    // so the admin has something to edit right away instead of a blank list.
    if (s.requires_research_info && researchItems.length === 0) {
        researchItems = cloneDefaultResearchItems();
    }
    renderResearchItems();
    document.getElementById('researchTextWrap').style.display = s.requires_research_info ? 'block' : 'none';
    document.getElementById('iconDisplay').textContent = selectedIcon;
    document.getElementById('editReason').value = '';
    document.getElementById('reasonGroup').style.display = 'none';

    buildIconPicker();
    collapseIconPicker();
    setQRPreview(s.gcash_qr || null, s.is_qr_valid, s.code_format || null);
    document.getElementById('modalOverlay').classList.add('open');

    // ✅ Remove old listeners by replacing element
    const priceInput = document.getElementById('editPrice');
    const freshPrice = priceInput.cloneNode(true);
    priceInput.parentNode.replaceChild(freshPrice, priceInput);

    // ✅ Add single clean listener
    freshPrice.addEventListener('input', () => {
        const existing = services.find(sv => sv.id === editingId);
        if (!existing) return;
        const oldVal = parseFloat(existing.price);
        const newVal = parseFloat(freshPrice.value);
        const reasonGroup = document.getElementById('reasonGroup');
        reasonGroup.style.display = (!isNaN(newVal) && newVal !== oldVal) ? 'block' : 'none';
    });
}

// ══════════════════════════════════════════
//  OPEN ADD MODAL
// ══════════════════════════════════════════

function openAdd() {
    editingId = null;
    isAddMode = true;
    pendingQRB64 = null;
    selectedIcon = '🛠️';
    iconPickerOpen = false;

    document.getElementById('modalTitle').textContent = 'Add New Service';
    document.getElementById('editName').value = '';
    document.getElementById('editPrice').value = '';
    document.getElementById('editDesc').value = '';
    document.getElementById('editGcashNumber').value = '';
    document.getElementById('editRequiresResearch').checked = false;
    researchItems = cloneDefaultResearchItems();
    renderResearchItems();
    document.getElementById('researchTextWrap').style.display = 'none';
    document.getElementById('iconDisplay').textContent = selectedIcon;
    buildIconPicker();
    collapseIconPicker();
    setQRPreview(null, false, null);
    document.getElementById('modalOverlay').classList.add('open');
}

function collapseIconPicker() {
    iconPickerOpen = false;
    const grid = document.getElementById('iconPickerGrid');
    const toggleBtn = document.getElementById('iconPickerToggleBtn');
    if (grid) grid.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = 'Pick icon';
}

// ══════════════════════════════════════════
//  QR PREVIEW HELPERS
// ══════════════════════════════════════════

function setQRPreview(src, isValid = false, format = null) {
    const preview = document.getElementById('qrPreview');
    const placeholder = document.getElementById('qrPlaceholder');
    const statusEl = document.getElementById('qrValidStatus');

    if (src) {
        preview.src = src;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        if (statusEl) {
            if (isValid) {
                const label = getFormatLabel(format);
                statusEl.textContent = `${label} detected`;
                statusEl.className = 'qr-status-ok';
            } else {
                statusEl.textContent = 'No scannable code found in image';
                statusEl.className = 'qr-status-warn';
            }
        }
    } else {
        preview.style.display = 'none';
        placeholder.style.display = 'flex';
        if (statusEl) { statusEl.textContent = ''; statusEl.className = ''; }
    }
}

// ══════════════════════════════════════════
//  QR / CODE UPLOAD HANDLER
// ══════════════════════════════════════════

async function handleQRUpload(input) {
    const file = input.files[0];
    if (!file) return;

    // ── Basic file validation ──────────────
    if (!file.type.startsWith('image/')) {
        showToast('Please upload a valid image file (PNG, JPG, etc.).', 'error');
        input.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be under 2 MB.', 'error');
        input.value = '';
        return;
    }

    const statusEl = document.getElementById('qrValidStatus');
    if (statusEl) {
        statusEl.textContent = 'Scanning for scannable code…';
        statusEl.className = '';
    }

    // ── Read file as base64 ────────────────
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
    });

    // ── Show preview while scanning ────────
    const preview = document.getElementById('qrPreview');
    const placeholder = document.getElementById('qrPlaceholder');
    preview.src = base64;
    preview.style.display = 'block';
    placeholder.style.display = 'none';

    // ── Run detection ──────────────────────
    const result = await detectAnyCode(base64);

    if (result.isScreenshot) {
        // ❌ Screenshot rejected
        pendingQRB64 = null;
        input.value = '';
        setQRPreview(null, false, null);
        if (statusEl) {
            statusEl.textContent = 'Screenshots are not allowed. Please upload a real GCash QR or barcode image.';
            statusEl.className = 'qr-status-warn';
        }
        showToast('Screenshots are not accepted. Upload a direct code photo.', 'error');

    } else if (!result.isCode) {
        // ❌ No scannable code found
        pendingQRB64 = null;
        input.value = '';
        setQRPreview(null, false, null);
        if (statusEl) {
            statusEl.textContent = 'No scannable code detected. Please upload an image containing a QR code, barcode, or similar.';
            statusEl.className = 'qr-status-warn';
        }
        showToast('No scannable code found. Only QR codes, barcodes, and similar codes are accepted.', 'error');

    } else {
        // ✅ Code accepted
        pendingQRB64 = base64;
        // Store detected format so we can send it to the server
        pendingCodeFormat = result.format;
        setQRPreview(pendingQRB64, true, result.format);
        showToast(`${getFormatLabel(result.format)} detected.`);
    }
}

function removeQR() {
    pendingQRB64 = '__REMOVE__';
    pendingCodeFormat = null;
    setQRPreview(null, false, null);
    document.getElementById('qrFileInput').value = '';
}

function previewQR(id) {
    const s = services.find(s => s.id == id);
    if (!s?.gcash_qr) return;
    const ov = document.getElementById('qrLargeOverlay');
    document.getElementById('qrLargeImg').src = s.gcash_qr;
    document.getElementById('qrLargeLabel').textContent = `${s.name} — GCash Code`;
    ov.style.display = 'flex';
}

// ══════════════════════════════════════════
//  CLOSE MODAL
// ══════════════════════════════════════════

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('reasonGroup').style.display = 'none';
    document.getElementById('editReason').value = '';
    editingId = null;
    isAddMode = false;
    pendingQRB64 = null;
    pendingCodeFormat = null;
}

// ══════════════════════════════════════════
//  SAVE (ADD or EDIT) → DB
// ══════════════════════════════════════════

let pendingCodeFormat = null; // tracks detected format for current upload

async function saveEdit() {
    const name = document.getElementById('editName').value.trim();
    const newPrice = parseFloat(document.getElementById('editPrice').value);
    const desc = document.getElementById('editDesc').value.trim();
    const gcashNum = document.getElementById('editGcashNumber').value.trim();
    const requiresResearch = document.getElementById('editRequiresResearch').checked;
    syncResearchTextarea();
    const researchText = document.getElementById('editResearchRequirementText').value.trim();

    if (!name) return alert('Service name is required.');
    if (isNaN(newPrice)) return alert('Please enter a valid price.');
    if (!desc) return alert('Description is required.');

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    let gcashQR = undefined;
    let isQrValid = undefined;
    let codeFormat = undefined;

    if (pendingQRB64 === '__REMOVE__') {
        gcashQR = null;
        isQrValid = false;
        codeFormat = null;
    } else if (pendingQRB64) {
        const result = await detectAnyCode(pendingQRB64);
        gcashQR = pendingQRB64;
        isQrValid = result.isCode && !result.isScreenshot;
        codeFormat = result.format ?? pendingCodeFormat;
    }

    try {
        const payload = {
            name,
            description: desc,
            price: newPrice,
            icon: selectedIcon,
            gcash_number: gcashNum || null,
            requires_research_info: requiresResearch,
            research_requirement_text: requiresResearch ? (researchText || null) : null,
            ...(gcashQR !== undefined && { gcash_qr: gcashQR }),
            ...(isQrValid !== undefined && { is_qr_valid: isQrValid }),
            ...(codeFormat !== undefined && { code_format: codeFormat }),
        };

        if (isAddMode) {
            payload.cls = 'analysis';
            payload.active = true;
            await apiFetch('/services', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            showToast('Service added.');

        } else {
            const existing = services.find(s => s.id === editingId);
            const oldPrice = parseFloat(existing?.price ?? 0);

            // ✅ Fixed: compare as floats
            if (existing && newPrice !== oldPrice) {
                const reason = document.getElementById('editReason').value.trim() || 'Manual price update';

                await saveAuditEntry({
                    service: existing.name,
                    oldPrice,
                    newPrice,
                    by: 'Admin',
                    reason,
                    datetime: formatNow(),
                });

                priceHistory.unshift({
                    service: existing.name,
                    oldPrice,
                    newPrice,
                    by: 'ROMAILYN FLORES',
                    date: new Date().toISOString().split('T')[0],
                });
                savePriceHistory();
                renderHistory();
            }

            await apiFetch(`/services/${editingId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            showToast('Service updated.');
        }

        closeModal();
        await loadServices();

    } catch (err) {
        console.error(err);
        alert('Failed to save. Please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

// ── Audit log helpers ──────────────────────────────────────
function formatNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function saveAuditEntry(entry) {
    try {
        const result = await apiFetch('/price-audit-logs', {
            method: 'POST',
            body: JSON.stringify(entry),
        });
        console.log('Audit entry saved:', result);
    } catch (err) {
        console.error('Failed to save audit log entry:', err);
    }
}

// ══════════════════════════════════════════
//  TOGGLE ACTIVE → DB
// ══════════════════════════════════════════

async function toggleService(id) {
    try {
        await apiFetch(`/services/${id}/toggle`, { method: 'PATCH' });
        await loadServices();
    } catch (err) {
        console.error(err);
        showToast('Failed to toggle service.', 'error');
    }
}

// ══════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════

function showToast(msg, type = 'success') {
    let t = document.getElementById('adminToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'adminToast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `toast toast-${type} toast-show`;
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('toast-show'), 3500);
}

// ══════════════════════════════════════════
//  RESEARCH REQUIREMENT ITEM LIST EDITOR
// ══════════════════════════════════════════

const DEFAULT_RESEARCH_ITEMS = [
    { text: 'Research title', type: 'text' },
    { text: 'Researcher/s', type: 'text' },
    { text: 'Program', type: 'text' },
    { text: 'Adviser', type: 'text' },
    { text: 'Type of research', type: 'text' },
    { text: 'Facebook contact', type: 'text' },
    { text: 'Preferred statistician', type: 'text' },
    { text: 'Upload research paper (PDF, DOC, or DOCX — max 20 MB)', type: 'file' },
];

// What each item's answer type means and how it's shown to students.
const ITEM_TYPE_META = {
    text: { label: 'Text' },   // student types an answer
    file: { label: 'File' },   // student uploads a document (PDF/DOC/etc.)
    image: { label: 'Image' }, // student uploads a photo/image
};

function cloneDefaultResearchItems() {
    return DEFAULT_RESEARCH_ITEMS.map(item => ({ ...item }));
}

let researchItems = [];

// Accepts both the new { text, type } format and legacy plain-string /
// newline-separated data, and always returns { text, type } objects.
function parseResearchItems(raw) {
    if (!raw) return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // legacy: newline-separated plain text
        return raw.split('\n').map(s => s.trim()).filter(Boolean)
            .map(text => ({ text, type: 'text' }));
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map(item => {
            if (typeof item === 'string') return { text: item, type: 'text' }; // legacy string item
            if (item && typeof item === 'object') {
                return {
                    text: item.text || '',
                    type: ITEM_TYPE_META[item.type] ? item.type : 'text',
                };
            }
            return null;
        })
        .filter(item => item && item.text);
}

function renderResearchItems() {
    const list = document.getElementById('researchItemsList');
    if (!list) return;
    list.innerHTML = researchItems.map((item, i) => `
        <div class="research-item-row">
            <select class="research-item-type" data-idx="${i}" title="What should the student provide for this item?">
                <option value="text" ${item.type === 'text' ? 'selected' : ''}>Text</option>
                <option value="file" ${item.type === 'file' ? 'selected' : ''}>File</option>
                <option value="image" ${item.type === 'image' ? 'selected' : ''}>Image</option>
            </select>
            <input type="text" class="form-control research-item-input" data-idx="${i}"
                value="${(item.text || '').replace(/"/g, '&quot;')}" placeholder="Item label…" />
            <button type="button" class="research-item-remove" data-idx="${i}">✕</button>
        </div>
    `).join('') || `<div class="research-items-empty">No items yet — click "Add item" below.</div>`;

    list.querySelectorAll('.research-item-input').forEach(input => {
        input.addEventListener('input', function () {
            researchItems[parseInt(this.dataset.idx, 10)].text = this.value;
            syncResearchTextarea();
        });
    });
    list.querySelectorAll('.research-item-type').forEach(select => {
        select.addEventListener('change', function () {
            researchItems[parseInt(this.dataset.idx, 10)].type = this.value;
            syncResearchTextarea();
        });
    });
    list.querySelectorAll('.research-item-remove').forEach(btn => {
        btn.addEventListener('click', function () {
            researchItems.splice(parseInt(this.dataset.idx, 10), 1);
            renderResearchItems();
            syncResearchTextarea();
        });
    });
}

function addResearchItem(value = '', type = 'text') {
    researchItems.push({ text: value, type: ITEM_TYPE_META[type] ? type : 'text' });
    renderResearchItems();
    syncResearchTextarea();
    const list = document.getElementById('researchItemsList');
    const inputs = list?.querySelectorAll('.research-item-input');
    if (inputs && inputs.length) inputs[inputs.length - 1].focus();
}

function syncResearchTextarea() {
    const ta = document.getElementById('editResearchRequirementText');
    if (ta) ta.value = JSON.stringify(researchItems.filter(i => i.text && i.text.trim()));
}

/* ══════════════════════════════════════════════════
   Shared chrome: theme, mobile drawer, profile menu,
   sign-out modal — mirrors dashboard.js so every admin
   page behaves identically.
══════════════════════════════════════════════════ */

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
        try { localStorage.setItem('aidea_theme', theme); } catch { }
    }
    const btn = document.getElementById('themeBtn');
    if (btn) {
        const next = theme === 'dark' ? 'light' : 'dark';
        btn.setAttribute('aria-label', `Switch to ${next} mode`);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
}

function initTheme() {
    applyTheme(currentTheme(), false);

    document.getElementById('themeBtn')?.addEventListener('click', () => {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => {
        let saved = null;
        try { saved = localStorage.getItem('aidea_theme'); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
}

function initDrawer() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('scrim');
    const btn = document.getElementById('menuBtn');
    if (!sidebar || !scrim || !btn) return;

    const open = () => {
        sidebar.classList.add('open');
        scrim.hidden = false;
        document.body.classList.add('no-scroll');
        btn.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        sidebar.classList.remove('open');
        scrim.hidden = true;
        document.body.classList.remove('no-scroll');
        btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) close(); });
}

function initProfileMenu() {
    const btn = document.getElementById('profileBtn');
    const menu = document.getElementById('profileMenu');
    if (!btn || !menu) return;

    const setOpen = open => {
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    };

    btn.addEventListener('click', e => {
        e.stopPropagation();
        setOpen(menu.hidden);
    });

    document.addEventListener('click', e => {
        if (!menu.hidden && !menu.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.hidden) {
            setOpen(false);
            btn.focus();
        }
    });
}

function performSignOut() {
    const token = localStorage.getItem('auth_token');
    if (token) {
        fetch(`${API_BASE}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        }).catch(() => { });
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
    window.location.href = LOGIN_URL;
}

function initSignOutModal() {
    const modal = document.getElementById('signOutModal');
    const trigger = document.getElementById('signOutBtn');
    const cancel = document.getElementById('signOutCancel');
    const confirmBtn = document.getElementById('signOutConfirm');
    const profileBtn = document.getElementById('profileBtn');
    const profileMenu = document.getElementById('profileMenu');
    if (!modal || !trigger || !cancel || !confirmBtn) return;

    const open = () => {
        if (profileMenu) profileMenu.hidden = true;
        profileBtn?.setAttribute('aria-expanded', 'false');

        modal.hidden = false;
        document.body.classList.add('no-scroll');
        cancel.focus();
    };

    const close = () => {
        modal.hidden = true;
        if (!document.getElementById('sidebar')?.classList.contains('open')) {
            document.body.classList.remove('no-scroll');
        }
        profileBtn?.focus();
    };

    trigger.addEventListener('click', open);
    cancel.addEventListener('click', close);
    confirmBtn.addEventListener('click', performSignOut);

    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.addEventListener('keydown', e => {
        if (modal.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'Tab') {
            const first = cancel, last = confirmBtn;
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
}

// ══════════════════════════════════════════
//  DOM READY
// ══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    loadZXing().catch(() => console.warn('ZXing pre-load failed'));
    loadPriceHistory(); // ← load saved history first
    await loadServices();
    renderHistory();

    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', saveEdit);
    document.getElementById('addServiceBtn').addEventListener('click', openAdd);

    document.getElementById('homeBtn').addEventListener('click', () =>
        location.href = '../dashboard/dashboard.html'
    );

    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById('qrLargeOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });
    document.getElementById('qrFileInput')?.addEventListener('change', function () {
        handleQRUpload(this);
    });
    document.getElementById('removeQRBtn')?.addEventListener('click', removeQR);
    document.getElementById('iconPickerToggleBtn')?.addEventListener('click', toggleIconPicker);
    document.getElementById('addResearchItemBtn')?.addEventListener('click', () => addResearchItem(''));
    document.getElementById('editRequiresResearch')?.addEventListener('change', function () {
        const wrap = document.getElementById('researchTextWrap');
        wrap.style.display = this.checked ? 'block' : 'none';
        // Seed with the default items on first-time enable so there's
        // something editable right away instead of an empty list.
        if (this.checked && researchItems.length === 0) {
            researchItems = cloneDefaultResearchItems();
            renderResearchItems();
            syncResearchTextarea();
        }
    });
});