// student/repository/repository.js

document.addEventListener('DOMContentLoaded', () => {

    let search = '';
    let course = '';
    let year = '';

    /* ── READ FROM LOCALSTORAGE (set by admin) ── */
    function getRepository() {
        return JSON.parse(localStorage.getItem('aidea_repository') || '[]');
    }

    /* ── RENDER ── */
    function render() {
        const grid = document.getElementById('repoGrid');
        const all = getRepository();

        const filtered = all.filter(p => {
            const matchSearch = !search ||
                p.title.toLowerCase().includes(search) ||
                p.authors.toLowerCase().includes(search);
            const matchCourse = !course || p.course === course;
            const matchYear = !year || p.year === year;
            return matchSearch && matchCourse && matchYear;
        });

        if (all.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#888;">
                    <p style="font-size:32px;margin-bottom:12px;">📭</p>
                    <p style="font-size:15px;font-weight:600;margin-bottom:6px;">No papers yet</p>
                    <p style="font-size:13px;">The admin hasn't published any thesis papers to the repository yet.</p>
                </div>`;
            return;
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#888;">
                    <p style="font-size:32px;margin-bottom:12px;">🔍</p>
                    <p style="font-size:15px;font-weight:600;margin-bottom:6px;">No results found</p>
                    <p style="font-size:13px;">Try a different search term or filter.</p>
                </div>`;
            return;
        }

        grid.innerHTML = filtered.map(p => `
            <div class="repo-card">
                <div class="repo-card-header">
                    <span class="repo-course">${p.course} · ${p.year}</span>
                </div>
                <h4>${p.title}</h4>
                <p class="repo-authors">👤 ${p.authors}</p>
                <p class="repo-abstract">${p.abstract}</p>
                <div class="repo-footer">
                    <span class="repo-year">📅 ${p.year}</span>
                    <button class="btn-read" onclick="alert('Opening: ${p.title.replace(/'/g, "\\'")}')">Read Paper</button>
                </div>
            </div>
        `).join('');
    }

    /* ── FILTERS ── */
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
        if (confirm('Sign out?')) window.location.href = '../login/login.html';
    });

    /* ── INIT ── */
    render();
});