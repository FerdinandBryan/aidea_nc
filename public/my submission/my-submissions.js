document.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard ──
    const session = AideaSession.require('student');
    if (!session) return;
    const { token, user } = session;

    // Update sidebar user info
    const userCard = document.querySelector('.user-info h4');
    const userRole = document.querySelector('.user-info p');
    if (userCard && user?.name) userCard.textContent = user.name;
    if (userRole && user?.course) userRole.textContent = `${user.course} STUDENT`;

    // Update avatar initials
    const avatar = document.querySelector('.user-avatar');
    if (avatar && user?.name) {
        const parts = user.name.trim().split(' ');
        avatar.textContent = parts.length >= 2
            ? parts[0][0] + parts[parts.length - 1][0]
            : parts[0][0];
    }

    let allData = [];
    let activeFilter = 'all';
    let searchTerm = '';

    // ── Fetch submissions from API ──
    async function loadSubmissions() {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:#888;">Loading submissions...</td></tr>`;

        try {
            const response = await fetch('http://127.0.0.1:8000/api/thesis/my-submissions', {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            const result = await response.json();

            if (!response.ok) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:#ef4444;">Failed to load submissions.</td></tr>`;
                return;
            }

            allData = result.data || [];
            render();

        } catch (err) {
            console.error('Failed to fetch submissions:', err);
            document.getElementById('tableBody').innerHTML =
                `<tr><td colspan="6" style="text-align:center;padding:32px;color:#ef4444;">Network error. Please try again.</td></tr>`;
        }
    }

    // ── Map API status to display label ──
    function mapStatus(status) {
        const map = {
            'pending': 'Under Review',
            'under_review': 'Under Review',
            'approved': 'Approved',
            'rejected': 'Rejected',
        };
        return map[status] || 'Under Review';
    }

    // ── Map submission_type to display label ──
    function mapType(type) {
        const map = {
            'initial': 'Initial',
            'revision': 'Revision',
            'final': 'Final Copy',
        };
        return map[type] || type;
    }

    // ── Format date ──
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    function badgeHTML(status) {
        if (status === 'Approved') return '<span class="badge badge-approved">✅ Approved</span>';
        if (status === 'Rejected') return '<span class="badge badge-rejected">❌ Rejected</span>';
        return '<span class="badge badge-review">⏳ Under Review</span>';
    }

    function render() {
        const tbody = document.getElementById('tableBody');
        const empty = document.getElementById('tableEmpty');

        const filtered = allData.filter(d => {
            const displayStatus = mapStatus(d.status);
            const matchFilter = activeFilter === 'all' || displayStatus === activeFilter;
            const matchSearch = d.title.toLowerCase().includes(searchTerm)
                || d.course.toLowerCase().includes(searchTerm);
            return matchFilter && matchSearch;
        });

        window._filteredData = filtered;

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        tbody.innerHTML = filtered.map((d, i) => {
            const displayStatus = mapStatus(d.status);
            return `
            <tr>
                <td class="title-cell">${d.title}</td>
                <td>${d.course}</td>
                <td>${formatDate(d.created_at)}</td>
                <td>${mapType(d.submission_type)}</td>
                <td>${badgeHTML(displayStatus)}</td>
                <td class="actions-cell">
                    <button class="btn-action" onclick="openModal(${i})">View</button>
                    ${displayStatus === 'Approved' ? `<button class="btn-action btn-review" onclick="openModal(${i})">🔖 Review</button>` : ''}
                </td>
            </tr>`;
        }).join('');
    }

    window.openModal = (i) => {
        const d = (window._filteredData || allData)[i];
        const displayStatus = mapStatus(d.status);

        document.getElementById('modalTitle').textContent = d.title;
        document.getElementById('modalBody').innerHTML = `
        <div class="modal-row"><label>Course</label><span>${d.course}</span></div>
        <div class="modal-row"><label>Academic Year</label><span>${d.academic_year || '—'}</span></div>
        <div class="modal-row"><label>Submitted</label><span>${formatDate(d.created_at)}</span></div>
        <div class="modal-row"><label>Type</label><span>${mapType(d.submission_type)}</span></div>
        <div class="modal-row"><label>Adviser</label><span>${d.adviser_name}</span></div>
        <div class="modal-row"><label>Authors</label><span>${d.authors || '—'}</span></div>
        <div class="modal-row"><label>Status</label><span>${badgeHTML(displayStatus)}</span></div>
        ${d.remarks ? `
            <div class="modal-row modal-row--remarks">
            <label>Admin Remarks</label>
            <span class="remarks-box remarks-box--${d.status}">${d.remarks}</span>
        </div>` : ''}
        <div class="modal-row"><label>Abstract</label><span>${d.abstract}</span></div>
        `;
        document.getElementById('modalOverlay').style.display = 'flex';
    };

    document.getElementById('modalClose')?.addEventListener('click', () => {
        document.getElementById('modalOverlay').style.display = 'none';
    });
    document.getElementById('modalOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modalOverlay'))
            document.getElementById('modalOverlay').style.display = 'none';
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            render();
        });
    });

    document.getElementById('searchInput')?.addEventListener('input', e => {
        searchTerm = e.target.value.toLowerCase();
        render();
    });

    document.querySelector('.btn-signout')?.addEventListener('click', () => {
        AideaSession.logout();
    });

    // ── Init ──
    loadSubmissions();
});