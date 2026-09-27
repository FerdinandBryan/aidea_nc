document.addEventListener('DOMContentLoaded', () => {

  /* ══════════════════════════════════════════
     LOAD PAPERS FROM ADMIN REPOSITORY
     Admin stores approved theses in localStorage
     under 'aidea_repository' via Thesis_submissions.js
  ══════════════════════════════════════════ */
  function getRepository() {
    try {
      return JSON.parse(localStorage.getItem('aidea_repository') || '[]');
    } catch {
      return [];
    }
  }

  let papers = getRepository();
  let search = '';
  let course = '';
  let year = '';

  /* ── Populate filters dynamically from actual data ── */
  function populateFilters() {
    const yearFilter = document.getElementById('yearFilter');
    const courseFilter = document.getElementById('courseFilter');

    const years = [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
    const courses = [...new Set(papers.map(p => p.course).filter(Boolean))].sort();

    yearFilter.innerHTML = '<option value="">All Years</option>' +
      years.map(y => `<option value="${y}">${y}</option>`).join('');

    courseFilter.innerHTML = '<option value="">All Courses</option>' +
      courses.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  /* ── FORMAT DATE ── */
  function formatDate(raw) {
    if (!raw) return '—';
    return new Date(raw).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ── FILE ICON ── */
  function fileIcon(name) {
    if (!name) return '📁';
    const ext = name.split('.').pop().toLowerCase();
    return { pdf: '📄', doc: '📝', docx: '📝' }[ext] || '📁';
  }

  /* ── RENDER GRID ── */
  function render() {
    const grid = document.getElementById('repoGrid');
    papers = getRepository();

    const filtered = papers.filter(p => {
      const matchSearch = !search ||
        p.title.toLowerCase().includes(search) ||
        (p.authors || '').toLowerCase().includes(search);
      const matchCourse = !course || p.course === course;
      const matchYear = !year || p.year === year;
      return matchSearch && matchCourse && matchYear;
    });

    if (papers.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">📭</div>
          <p style="color:#888;font-size:15px;font-weight:500;">No papers in the repository yet.</p>
          <p style="color:#666;font-size:13px;margin-top:6px;">Papers approved by the Research Office will appear here.</p>
        </div>`;
      return;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
          <div style="font-size:48px;margin-bottom:16px;">🔍</div>
          <p style="color:#888;font-size:14px;">No papers found matching your search.</p>
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => `
      <div class="repo-card">
        <div class="repo-card-header">
          <span class="repo-course">${p.course || '—'}</span>
          <span class="repo-year-badge">📅 ${p.year || '—'}</span>
        </div>
        <h4>${p.title}</h4>
        <p class="repo-authors">👤 ${p.authors || 'Unknown'}</p>
        ${p.adviser ? `<p class="repo-adviser">🎓 Adviser: ${p.adviser}</p>` : ''}
        <p class="repo-abstract">${p.abstract || 'No abstract available.'}</p>
        <div class="repo-footer">
          <span class="repo-added">Added ${formatDate(p.addedAt)}</span>
          <div style="display:flex;gap:8px;">
            <button class="btn-read btn-read-secondary" onclick='openAbstractModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Details</button>
            ${p.fileUrl
        ? `<a class="btn-read" href="${p.fileUrl}" target="_blank" rel="noopener noreferrer">${fileIcon(p.fileName)} Read Paper</a>`
        : `<button class="btn-read btn-read-disabled" disabled title="No file available">No File</button>`
      }
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ── ABSTRACT MODAL ── */
  window.openAbstractModal = function (paper) {
    document.getElementById('abstractModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'abstractModal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;
      display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#1a1d2e;border-radius:16px;max-width:680px;width:100%;
                  max-height:85vh;overflow-y:auto;padding:32px;position:relative;
                  border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 60px rgba(0,0,0,0.4);">
        <button onclick="document.getElementById('abstractModal').remove()"
          style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.08);
                 border:none;color:#aaa;width:32px;height:32px;border-radius:50%;
                 cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>

        <div style="display:inline-block;background:#1e3a5f;color:#60a5fa;font-size:11px;
                    font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:14px;letter-spacing:.5px;">
          ${paper.course || '—'}
        </div>

        <h3 style="color:#fff;font-size:18px;font-weight:700;margin:0 0 10px;line-height:1.4;padding-right:32px;">
          ${paper.title}
        </h3>

        <p style="color:#888;font-size:13px;margin:0 0 4px;">👤 ${paper.authors || 'Unknown'}</p>
        ${paper.adviser ? `<p style="color:#888;font-size:13px;margin:0 0 4px;">🎓 Adviser: ${paper.adviser}</p>` : ''}
        <p style="color:#666;font-size:12px;margin:0 0 20px;">
          📅 ${paper.year || '—'} &nbsp;·&nbsp; 🕓 Added ${formatDate(paper.addedAt)}
        </p>

        <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;margin-bottom:20px;">
          <p style="color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px;">Abstract</p>
          <p style="color:#ccc;font-size:14px;line-height:1.8;margin:0;">
            ${paper.abstract || 'No abstract available.'}
          </p>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${paper.fileUrl
        ? `<a href="${paper.fileUrl}" target="_blank" rel="noopener noreferrer"
                  style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;
                         background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;
                         font-size:13px;font-weight:600;"
                  onmouseover="this.style.background='#4f52c9'" onmouseout="this.style.background='#6366f1'">
                  ${fileIcon(paper.fileName)} Read Full Paper
               </a>`
        : `<span style="font-size:13px;color:#666;align-self:center;">📂 No file available</span>`
      }
          <button onclick="document.getElementById('abstractModal').remove()"
            style="padding:10px 20px;background:rgba(255,255,255,0.06);color:#aaa;
                   border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:13px;cursor:pointer;">
            Close
          </button>
        </div>
      </div>`;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escClose); }
    });
    document.body.appendChild(modal);
  };

  /* ── EVENT LISTENERS ── */
  document.getElementById('repoSearch')?.addEventListener('input', e => {
    search = e.target.value.toLowerCase();
    render();
  });
  document.getElementById('courseFilter')?.addEventListener('change', e => {
    course = e.target.value;
    render();
  });
  document.getElementById('yearFilter')?.addEventListener('change', e => {
    year = e.target.value;
    render();
  });
  document.querySelector('.btn-signout')?.addEventListener('click', () => {
    if (confirm('Sign out?')) window.location.href = '../user/login/login.html';
  });

  /* ── INIT ── */
  populateFilters();
  render();

  /* ── Live sync if admin updates repo in another tab ── */
  window.addEventListener('storage', e => {
    if (e.key === 'aidea_repository') {
      papers = getRepository();
      populateFilters();
      render();
    }
  });
});