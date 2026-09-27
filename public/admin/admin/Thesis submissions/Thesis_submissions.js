// Thesis_submissions.js

const API_BASE = 'http://127.0.0.1:8000/api';

// ✅ Always read token fresh to avoid capturing an empty value at load time
function getToken() {
    return localStorage.getItem('auth_token') || '';
}

window.theses = []; 
let filtered = [];
let activeReviewId = null;
let selectedStatus = null;
let repoSearchQuery = '';

/* ── FETCH THESES FROM API ── */
async function loadTheses() {
    try {
        const res = await fetch(`${API_BASE}/thesis/list`, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
            }
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const data = await res.json();

        // Normalize the API response to match the shape the UI expects.
        theses = (data.data ?? data).map(t => ({
            id: t.id,
            student: t.user?.name ?? t.student_name ?? `User #${t.user_id}`,
            title: t.title,
            course: t.course,
            year: t.academic_year,
            authors: t.authors ?? '—',
            abstract: t.abstract,
            adviser: t.adviser_name,
            service: t.submission_type,
            date: t.created_at,
            // ✅ Capitalize first letter to match badge/filter logic
            status: t.status
                ? t.status.charAt(0).toUpperCase() + t.status.slice(1).toLowerCase()
                : 'Pending',
            file: t.file_path ? {
                name: t.original_filename ?? t.file_path.split('/').pop(),
                size: t.file_size ?? 0,
                type: t.file_type ?? '',
                url: t.file_url,
            } : null,
        }));

        filtered = [...theses];
        render();
        updateStats();
        updateRepoBadge();

    } catch (err) {
        console.error('Failed to load theses:', err);
        showToast('Failed to load submissions. Check your connection.', 'error');
    }
}

/* ── POLL FOR NEW SUBMISSIONS (real-time feel) ── */
function startPolling(intervalMs = 15000) {
    setInterval(loadTheses, intervalMs);
}

/* ── MODAL CONTROLS ── */
function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
    if (id === 'reviewModal') {
        selectedStatus = null;
        document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('selected'));
        document.getElementById('reviewRemarks').value = '';
    }
    if (id === 'repoModal') {
        repoSearchQuery = '';
        const inp = document.getElementById('repoSearchInput');
        if (inp) inp.value = '';
    }
}
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeModal('viewModal');
        closeModal('reviewModal');
        closeModal('repoModal');
    }
});

/* ── HELPERS ── */
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function fileIcon(name) {
    if (!name) return '📁';
    const ext = name.split('.').pop().toLowerCase();
    const icons = { pdf: '📄', doc: '📝', docx: '📝', zip: '🗜️', rar: '🗜️', txt: '📃', pptx: '📊', xlsx: '📊' };
    return icons[ext] || '📁';
}
function highlight(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="repo-highlight">$1</mark>');
}
function formatDate(raw) {
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── STATS ROW ── */
function updateStats() {
    const stats = document.querySelectorAll('.mini-stat strong');
    if (stats[0]) stats[0].textContent = theses.length;
    if (stats[1]) stats[1].textContent = theses.filter(t => t.status === 'Approved').length;
    if (stats[2]) stats[2].textContent = theses.filter(t => t.status === 'Pending').length;
    if (stats[3]) stats[3].textContent = theses.filter(t => t.status === 'Rejected').length;
}

/* ── VIEW MODAL ── */
function viewThesis(id) {
    const t = theses.find(x => x.id === id);
    if (!t) return;

    document.getElementById('viewModalTitle').textContent = t.title;
    document.getElementById('viewStudent').textContent = t.student;
    document.getElementById('viewCourse').textContent = t.course;
    document.getElementById('viewService').textContent = t.service;
    document.getElementById('viewDate').textContent = formatDate(t.date);
    document.getElementById('viewAbstract').textContent = t.abstract;

    const colors = { Approved: '#22c55e', Pending: '#f59e0b', Rejected: '#ef4444' };
    document.getElementById('viewStatus').innerHTML =
        `<span style="color:${colors[t.status]};font-weight:600;">${t.status}</span>`;

    const fileSection = document.getElementById('viewFileSection');
    if (t.file) {
        fileSection.innerHTML = `
            <div class="submitted-file-card">
                <div class="file-card-icon">${fileIcon(t.file.name)}</div>
                <div class="file-card-info">
                    <div class="file-card-name" title="${t.file.name}">${t.file.name}</div>
                    <div class="file-card-meta">${formatSize(t.file.size)} &bull; ${t.file.name.split('.').pop().toUpperCase()}</div>
                </div>
                <div class="file-card-btns">
                    <button class="btn-file-check" onclick="checkSubmittedFile(${t.id})">👁 Check</button>
                    <button class="btn-file-dl"    onclick="downloadSubmittedFile(${t.id})">⬇ Download</button>
                </div>
            </div>`;
    } else {
        fileSection.innerHTML = `<div class="no-file-notice">⚠️ No file submitted by student.</div>`;
    }

    openModal('viewModal');
}

/* ── CHECK / DOWNLOAD FILE ── */
/* ── CHECK (view in new tab) ── */
function checkSubmittedFile(id) {
    const t = theses.find(x => x.id === id);
    if (!t?.file?.url) {
        showToast('No file available.', 'warning');
        return;
    }
    window.open(t.file.url, '_blank');  // ✅ works now — public URL, no auth needed
}

/* ── DOWNLOAD ── */
function downloadSubmittedFile(id) {
    const t = theses.find(x => x.id === id);
    if (!t?.file?.url) {
        showToast('No file available.', 'warning');
        return;
    }

    const a = document.createElement('a');
    a.href = t.file.url;
    a.download = t.file.name;   // hints the browser to download, not navigate
    a.target = '_blank';        // fallback: opens in new tab if download is blocked
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading "${t.file.name}"…`, 'info');
}

/* ── REVIEW MODAL ── */
function reviewThesis(id) {
    const t = theses.find(x => x.id === id);
    if (!t) return;
    activeReviewId = id;
    selectedStatus = t.status;

    document.getElementById('reviewTitle').textContent = t.title;
    document.getElementById('reviewStudent').textContent = t.student;

    const colors = { Approved: '#22c55e', Pending: '#f59e0b', Rejected: '#ef4444' };
    document.getElementById('reviewCurrentStatus').innerHTML =
        `<span style="color:${colors[t.status]};font-weight:600;">${t.status}</span>`;

    document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.btn-status.${t.status.toLowerCase()}`)?.classList.add('selected');

    openModal('reviewModal');
}
function setStatus(status) {
    selectedStatus = status;
    document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.btn-status.${status.toLowerCase()}`)?.classList.add('selected');
}

/* ── SUBMIT REVIEW TO API ── */
async function submitReview() {
    if (!selectedStatus) { showToast('Please select a status.', 'warning'); return; }

    const thesis = theses.find(t => t.id === activeReviewId);
    if (!thesis) return;

    const remarks = document.getElementById('reviewRemarks').value.trim();

    try {
        const res = await fetch(`${API_BASE}/thesis/${activeReviewId}/review`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
            },
            body: JSON.stringify({ status: selectedStatus, remarks }),
        });

        if (!res.ok) {
            const err = await res.json();
            showToast(err.message || 'Review failed.', 'error');
            return;
        }

        // Update local copy immediately so the table refreshes without waiting for next poll
        thesis.status = selectedStatus;
        closeModal('reviewModal');
        applyFilter();
        updateStats();
        showToast(`"${thesis.title}" marked as ${selectedStatus}.`, 'success');

    } catch (err) {
        console.error('Review error:', err);
        showToast('Network error. Please try again.', 'error');
    }
}

/* ── REPOSITORY (localStorage, same as before) ── */
function getRepository() { return JSON.parse(localStorage.getItem('aidea_repository') || '[]'); }
function saveRepository(repo) { localStorage.setItem('aidea_repository', JSON.stringify(repo)); }
function isInRepository(id) { return getRepository().some(p => p.id === id); }

function addToRepository(id) {
    const thesis = theses.find(t => t.id === id);
    if (!thesis) return;
    const repo = getRepository();
    if (repo.some(p => p.id === id)) { showToast('Already in repository.', 'warning'); return; }
    repo.push({
        id: thesis.id, title: thesis.title, authors: thesis.authors,
        course: thesis.course, year: thesis.year, abstract: thesis.abstract,
        addedAt: new Date().toISOString()
    });
    saveRepository(repo);
    render();
    updateRepoBadge();
    showToast(`"${thesis.title}" added to repository.`, 'success');
}
function removeFromRepository(id) {
    saveRepository(getRepository().filter(p => p.id !== id));
    render();
    updateRepoBadge();
    if (document.getElementById('repoModal').classList.contains('open')) renderRepoModal();
    showToast('Removed from repository.', 'info');
}

/* ── REPOSITORY MODAL ── */
function openRepoModal() {
    repoSearchQuery = '';
    renderRepoModal();
    openModal('repoModal');
    setTimeout(() => document.getElementById('repoSearchInput')?.focus(), 100);
}
function searchRepo() { repoSearchQuery = document.getElementById('repoSearchInput').value; renderRepoModal(); }
function clearRepoSearch() { repoSearchQuery = ''; document.getElementById('repoSearchInput').value = ''; renderRepoModal(); }

function renderRepoModal() {
    const repo = getRepository();
    const q = repoSearchQuery.toLowerCase().trim();
    const filtered = q
        ? repo.filter(p =>
            p.title.toLowerCase().includes(q) ||
            p.authors.toLowerCase().includes(q) ||
            p.course.toLowerCase().includes(q) ||
            p.abstract.toLowerCase().includes(q))
        : repo;

    const countEl = document.getElementById('repoModalCount');
    const listEl = document.getElementById('repoModalList');

    countEl.innerHTML = q
        ? `<strong>${filtered.length}</strong> result${filtered.length !== 1 ? 's' : ''} found out of <strong>${repo.length}</strong> in repository`
        : `<strong>${repo.length}</strong> thesis${repo.length !== 1 ? 'es' : ''} in the repository`;

    if (repo.length === 0) {
        listEl.innerHTML = `<div class="repo-empty"><span>📭</span>No theses in the repository yet.<br>Approve and add theses from the table below.</div>`;
        return;
    }
    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="repo-empty"><span>🔍</span>No results for "<strong>${repoSearchQuery}</strong>".<br>Try a different keyword.</div>`;
        return;
    }

    listEl.innerHTML = `<div class="repo-list">` +
        filtered.map((p, i) => `
            <div class="repo-item">
                <div class="repo-item-num">#${i + 1}</div>
                <div class="repo-item-body">
                    <div class="repo-item-title">${highlight(p.title, repoSearchQuery)}</div>
                    <div class="repo-item-meta">
                        <span>👤 ${highlight(p.authors, repoSearchQuery)}</span>
                        <span>📘 ${highlight(p.course, repoSearchQuery)}</span>
                        <span>📅 ${p.year}</span>
                        <span>🕓 Added ${formatDate(p.addedAt)}</span>
                    </div>
                    <div class="repo-item-abstract">${highlight(p.abstract, repoSearchQuery)}</div>
                </div>
                <div class="repo-item-actions">
                    <button class="btn-repo-remove-sm" onclick="removeFromRepository(${p.id})">🗑 Remove</button>
                </div>
            </div>
        `).join('') +
        `</div>`;
}

/* ── REPO BADGE ── */
function updateRepoBadge() {
    const count = getRepository().length;
    const badge = document.getElementById('repoBadgeCount');
    if (badge) badge.textContent = count > 0 ? `(${count})` : '';
}

/* ── STATUS BADGE ── */
function statusBadge(s) {
    const m = { Approved: 'badge-success', Pending: 'badge-warning', Rejected: 'badge-danger' };
    return `<span class="badge ${m[s] || ''}">${s}</span>`;
}
function repoBtnHtml(thesis) {
    if (thesis.status !== 'Approved')
        return `<button class="btn-repo" disabled title="Only approved theses can be added">+ Repo</button>`;
    if (isInRepository(thesis.id))
        return `<button class="btn-repo btn-repo-remove" onclick="removeFromRepository(${thesis.id})">✕ Remove</button>`;
    return `<button class="btn-repo btn-repo-add" onclick="addToRepository(${thesis.id})">+ Repo</button>`;
}

/* ── RENDER TABLE ── */
function render() {
    const tbody = document.getElementById('thesisBody');

    if (theses.length === 0 && filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#888;">No submissions yet.</td></tr>`;
        return;
    }
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#888;">No submissions match your filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>${t.id}</td>
            <td><strong>${t.student}</strong></td>
            <td><div class="thesis-title" title="${t.title}">${t.title}</div></td>
            <td>${t.service}</td>
            <td>${formatDate(t.date)}</td>
            <td>${statusBadge(t.status)}</td>
            <td class="action-cell">
                <button class="btn-action" onclick="viewThesis(${t.id})">View${t.file ? ' 📎' : ''}</button>
                <button class="btn-action" onclick="reviewThesis(${t.id})">Review</button>
                ${repoBtnHtml(t)}
            </td>
        </tr>
    `).join('');
}

/* ── FILTER ── */
function applyFilter() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const st = document.getElementById('filterStatus').value;
    filtered = theses.filter(t =>
        (t.student.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) &&
        (!st || t.status === st)
    );
    render();
}

/* ── TOAST ── */
function showToast(msg, type = 'info') {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'toastWrap';
        wrap.style.cssText = 'position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:9999;';
        document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    const colors = { success: '#22c55e', warning: '#f59e0b', info: '#3b82f6', error: '#ef4444' };
    t.style.cssText = `background:#1a1d2e;color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:500;border-left:4px solid ${colors[type] || colors.info};min-width:260px;box-shadow:0 4px 16px rgba(0,0,0,0.15);`;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
    loadTheses();       // initial load
    startPolling();     // refresh every 15 s so new student submissions appear automatically

    document.getElementById('searchInput').addEventListener('input', applyFilter);
    document.getElementById('filterStatus').addEventListener('change', applyFilter);
    document.getElementById('viewRepoBtn').addEventListener('click', openRepoModal);
    document.getElementById('homeBtn').addEventListener('click', () => location.href = '../dashboard/dashboard.html');
    document.getElementById('signOutBtn').addEventListener('click', () => {
        if (confirm('Sign out?')) window.location.href = '../../login/login.html';
    });
});