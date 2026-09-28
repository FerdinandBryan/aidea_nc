const API_BASE = 'http://127.0.0.1:8000/api';

/* ══════════════════════════════════════════════════
   SESSION / USER IDENTITY
══════════════════════════════════════════════════ */
function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

/* Render sidebar identity (avatar, name, role) from the
   real logged-in user object — same logic as dashboard.js
   and avail-services.js */
function renderUserIdentity() {
    const user = getUser();
    if (!user) return;

    const fullName = user.full_name || user.name || 'Student';
    const course = user.course || 'Student';

    const parts = fullName.trim().split(' ');
    const initials = parts.length >= 2
        ? parts[0][0] + parts[parts.length - 1][0]
        : parts[0].slice(0, 2);

    const avatarEl = document.querySelector('.user-avatar');
    const nameEl = document.querySelector('.user-info h4');
    const roleEl = document.querySelector('.user-info p');

    if (avatarEl) avatarEl.textContent = initials.toUpperCase();
    if (nameEl) nameEl.textContent = fullName;
    if (roleEl) roleEl.textContent = course;
}

/* ══════════════════════════════════════════════════
   SIDEBAR NAV GROUPS (MAIN / SERVICES / EVENTS)
   Click a group label to expand/collapse it.
══════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════
   SIDEBAR FOOTER DROPDOWN (My Profile / Sign Out)
   Clicking the footer no longer navigates directly —
   it toggles a small menu instead.
══════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════
   SIGN OUT CONFIRMATION MODAL
══════════════════════════════════════════════════ */
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
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
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

/* ══════════════════════════════════════════════════
   EVENTS PAGE LOGIC
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    renderUserIdentity();
    initNavGroups();
    initSidebarDropdown();
    initSignOutModal();

    const today = new Date();

    const events = [
        { title: 'Thesis Defense Schedule', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15), location: 'AVR Hall', time: '8:00 AM', tag: 'Defense', desc: 'Final thesis defense for BSIT and BSCS graduating students. Bring two printed copies.', status: 'Upcoming' },
        { title: 'Research Writing Workshop', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 22), location: 'Library', time: '1:00 PM', tag: 'Workshop', desc: 'Intensive workshop on APA citation, research methodology, and academic writing standards.', status: 'Upcoming' },
        { title: 'IT Symposium 2025', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30), location: 'Gymnasium', time: '9:00 AM', tag: 'Symposium', desc: 'Annual IT symposium featuring student research presentations and industry guest speakers.', status: 'Upcoming' },
        { title: 'Plagiarism Awareness Seminar', date: new Date(today.getFullYear(), today.getMonth(), today.getDate()), location: 'Room 201', time: '2:00 PM', tag: 'Seminar', desc: 'Learn about academic integrity, proper citation, and how to avoid plagiarism in research.', status: 'Today' },
        { title: 'Orientation for New Thesis Students', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10), location: 'AVR Hall', time: '10:00 AM', tag: 'Orientation', desc: 'Orientation session for students beginning their thesis journey this semester.', status: 'Past' },
        { title: 'Statistical Methods Training', date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5), location: 'Computer Lab 3', time: '3:00 PM', tag: 'Training', desc: 'Hands-on SPSS and Excel training for data analysis and thesis statistics requirements.', status: 'Past' },
    ];

    let activeFilter = 'all';
    let searchTerm = '';

    function formatDate(d) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function render() {
        const list = document.getElementById('eventsList');
        const filtered = events.filter(e => {
            const matchFilter = activeFilter === 'all' || e.status === activeFilter;
            const matchSearch = !searchTerm || e.title.toLowerCase().includes(searchTerm) || e.tag.toLowerCase().includes(searchTerm);
            return matchFilter && matchSearch;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<p style="color:#888;font-size:14px;padding:32px;text-align:center;background:#fff;border-radius:14px;">No events found.</p>';
            return;
        }

        list.innerHTML = filtered.map(e => {
            const isPast = e.status === 'Past';
            const isToday = e.status === 'Today';
            const cardClass = isPast ? 'event-card past' : isToday ? 'event-card today-card' : 'event-card';
            const month = e.date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            const day = e.date.getDate();

            return `
        <div class="${cardClass}">
          <div class="event-date-box">
            <span class="month">${month}</span>
            <span class="day">${day}</span>
          </div>
          <div class="event-content">
            <h4>${e.title}</h4>
            <div class="event-meta">
              <span>📍 ${e.location}</span>
              <span>🕐 ${e.time}</span>
              <span>📅 ${formatDate(e.date)}</span>
            </div>
            <p class="event-desc">${e.desc}</p>
            <span class="event-tag">${e.tag}</span>
            <br/>
            ${isPast
                    ? `<button class="btn-rsvp past-btn" disabled>✓ Ended</button>`
                    : isToday
                        ? `<button class="btn-rsvp" onclick="rsvp(this, '${e.title.replace(/'/g, "\\'")}')">✅ Happening Today</button>`
                        : `<button class="btn-rsvp" onclick="rsvp(this, '${e.title.replace(/'/g, "\\'")}')">RSVP</button>`
                }
          </div>
        </div>
      `;
        }).join('');
    }

    window.rsvp = (btn, title) => {
        btn.textContent = '✓ Registered';
        btn.style.background = '#22c55e';
        btn.style.color = '#fff';
        btn.disabled = true;
        showToast(`Registered for "${title}"!`);
    };

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            render();
        });
    });

    document.getElementById('eventSearch')?.addEventListener('input', e => {
        searchTerm = e.target.value.toLowerCase();
        render();
    });

    // Mini Calendar
    let calYear = today.getFullYear();
    let calMonth = today.getMonth();

    function renderCal() {
        const label = document.getElementById('calMonthLabel');
        const grid = document.getElementById('calGrid');
        label.textContent = new Date(calYear, calMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });

        const firstDay = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const eventDays = new Set(events.map(e => {
            if (e.date.getFullYear() === calYear && e.date.getMonth() === calMonth)
                return e.date.getDate();
            return null;
        }).filter(Boolean));

        let html = '';
        for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday2 = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
            const hasEv = eventDays.has(d);
            let cls = 'cal-day';
            if (isToday2) cls += ' today';
            else if (hasEv) cls += ' has-event';
            html += `<div class="${cls}">${d}</div>`;
        }
        grid.innerHTML = html;
    }

    document.getElementById('prevMonth')?.addEventListener('click', () => {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCal();
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCal();
    });

    function showToast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = `position:fixed;bottom:28px;right:28px;background:#22c55e;color:#fff;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    render();
    renderCal();
});