// events.js

const events = [
    { id: 1, name: 'Thesis Defense Orientation', desc: 'Orientation for all 4th year students preparing for thesis defense.', date: '2025-02-10', time: '9:00 AM', venue: 'AVR Room 1', attendees: 120, type: 'Upcoming' },
    { id: 2, name: 'Data Analysis Workshop', desc: 'Hands-on workshop on SPSS and statistical analysis tools.', date: '2025-02-15', time: '1:00 PM', venue: 'Computer Lab 3', attendees: 40, type: 'Upcoming' },
    { id: 3, name: 'Research Writing Seminar', desc: 'Academic writing techniques for undergraduate researchers.', date: '2025-01-20', time: '10:00 AM', venue: 'Function Hall', attendees: 90, type: 'Completed' },
    { id: 4, name: 'Grammarian Training', desc: 'Training session for student grammarian assistants.', date: '2025-01-10', time: '2:00 PM', venue: 'Room 202', attendees: 25, type: 'Completed' },
    { id: 5, name: 'End-of-Semester Evaluation', desc: 'Quality evaluation and satisfaction survey for all services.', date: '2025-03-01', time: '8:00 AM', venue: 'Online (Google Meet)', attendees: 248, type: 'Upcoming' },
];

function typeColors(t) {
    const m = { Upcoming: 'badge-info', Completed: 'badge-success' };
    return m[t] || 'badge-warning';
}

function getMonthDay(dateStr) {
    const d = new Date(dateStr);
    return {
        day: d.getDate(),
        month: d.toLocaleString('en-PH', { month: 'short' }),
        full: d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    };
}

function renderEvents() {
    document.getElementById('eventsList').innerHTML = events.map((e, i) => {
        const { day, month, full } = getMonthDay(e.date);
        return `
      <div class="event-card" style="animation-delay:${i * 0.07}s">
        <div class="event-date-box">
          <div class="day">${day}</div>
          <div class="month">${month}</div>
        </div>
        <div class="event-info">
          <div class="event-name">${e.name}</div>
          <div class="event-desc">${e.desc}</div>
          <div class="event-meta">
            <span>🕐 ${e.time}</span>
            <span>📍 ${e.venue}</span>
            <span>👥 ${e.attendees} attendees</span>
            <span><span class="badge ${typeColors(e.type)}">${e.type}</span></span>
          </div>
        </div>
        <div class="event-actions">
          <button class="btn-ev">Edit</button>
          <button class="btn-ev">Delete</button>
        </div>
      </div>
    `;
    }).join('');
}

function renderPinned() {
    const upcoming = events.filter(e => e.type === 'Upcoming');
    document.getElementById('pinnedList').innerHTML = upcoming.map(e => {
        const { full } = getMonthDay(e.date);
        return `
      <div class="pinned-item">
        <div class="pinned-dot"></div>
        <div>
          <div class="pinned-name">${e.name}</div>
          <div class="pinned-date">${full} · ${e.time}</div>
        </div>
      </div>
    `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    renderEvents();
    renderPinned();
    document.getElementById('addEventBtn').addEventListener('click', () => alert('Open Add Event form.'));
    document.getElementById('homeBtn').addEventListener('click', () => location.href = '../dashboard/dashboard.html');
    document.getElementById('signOutBtn').addEventListener('click', () => { if (confirm('Sign out?')) alert('Signed out.'); });
});