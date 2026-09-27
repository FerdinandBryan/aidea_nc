document.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard ──
    const session = AideaSession.require('student');
    if (!session) return;
    const { token, user } = session;

    // Update sidebar user info — same fallback pattern as dashboard.js
    const fullName = user?.full_name || user?.name || 'Student';
    const course = user?.course || 'Student';

    const userCard = document.querySelector('.user-info h4');
    const userRole = document.querySelector('.user-info p');
    if (userCard) userCard.textContent = fullName;
    if (userRole) userRole.textContent = `${course} STUDENT`;

    // Update avatar initials
    const avatar = document.querySelector('.user-avatar');
    if (avatar) {
        const parts = fullName.trim().split(' ');
        const initials = parts.length >= 2
            ? parts[0][0] + parts[parts.length - 1][0]
            : parts[0].slice(0, 2);
        avatar.textContent = initials.toUpperCase();
    }

    // ── Sidebar nav groups (MAIN / SERVICES / EVENTS) ──
    function initNavGroups() {
        const toggles = document.querySelectorAll('.nav-group-toggle');

        toggles.forEach((toggle) => {
            toggle.addEventListener('click', () => {
                const group = toggle.closest('.nav-group');
                if (!group) return;
                group.classList.toggle('open');
            });
        });

        // Auto-expand whichever group holds the active page link.
        const activeGroup = document.querySelector('.nav-group .nav-item.active')?.closest('.nav-group');
        if (activeGroup) activeGroup.classList.add('open');
    }

    // ── Sidebar footer dropdown (My Profile / Sign Out) ──
    function initSidebarDropdown() {
        const sidebarUser = document.getElementById('sidebarUser');
        const dropdown = document.getElementById('userDropdown');
        const signOutBtn = document.getElementById('dropdownSignOutBtn');
        if (!sidebarUser || !dropdown) return;

        function closeDropdown() {
            sidebarUser.classList.remove('open');
        }

        sidebarUser.addEventListener('click', (e) => {
            if (dropdown.contains(e.target)) return;
            sidebarUser.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!sidebarUser.contains(e.target)) closeDropdown();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDropdown();
        });

        if (signOutBtn) {
            signOutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeDropdown();
                openSignOutModal();
            });
        }
    }

    // ── Sign out confirmation modal ──
    function initSignOutModal() {
        const overlay = document.getElementById('signoutModalOverlay');
        const cancelBtn = document.getElementById('signoutCancelBtn');
        const confirmBtn = document.getElementById('signoutConfirmBtn');
        if (!overlay) return;

        cancelBtn?.addEventListener('click', closeSignOutModal);
        confirmBtn?.addEventListener('click', performSignOut);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSignOutModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) {
                closeSignOutModal();
            }
        });
    }

    function openSignOutModal() {
        document.getElementById('signoutModalOverlay')?.classList.add('open');
    }

    function closeSignOutModal() {
        document.getElementById('signoutModalOverlay')?.classList.remove('open');
    }

    async function performSignOut() {
        const authToken = localStorage.getItem('auth_token');
        if (authToken) {
            try {
                await fetch('http://127.0.0.1:8000/api/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Accept': 'application/json',
                    },
                });
            } catch {
                // ignore network errors — clear session locally regardless
            }
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('aidea_user');
        window.location.href = '../login/login.html';
    }

    initNavGroups();
    initSidebarDropdown();
    initSignOutModal();

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
        <!-- <div class="modal-row"><label>Abstract</label><span>${d.abstract}</span></div> -->
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

    // ── Init ──
    loadSubmissions();
});