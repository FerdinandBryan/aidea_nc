// dashboard.js

const transactions = [
    { student: 'Maria Santos', service: 'Data Analysis', amount: 850, ref: 'GC202501A', status: 'Completed', date: '2025-01-10' },
    { student: 'Juan dela Cruz', service: 'Statistician', amount: 600, ref: 'GC202502B', status: 'Pending', date: '2025-01-14' },
    { student: 'Ana Reyes', service: 'Grammarian', amount: 500, ref: 'GC202503C', status: 'Completed', date: '2025-01-18' },
    { student: 'Carlo Mendoza', service: 'Data Analysis', amount: 850, ref: 'GC202504D', status: 'Cancelled', date: '2025-01-22' },
    { student: 'Liza Aquino', service: 'Statistician', amount: 600, ref: 'GC202505E', status: 'Completed', date: '2025-01-26' },
];

function statusBadge(s) {
    const map = { Completed: 'badge-success', Pending: 'badge-warning', Cancelled: 'badge-danger' };
    return `<span class="badge ${map[s] || ''}">${s}</span>`;
}

function renderTable() {
    const tbody = document.getElementById('txnBody');
    tbody.innerHTML = transactions.map(t => `
    <tr>
      <td><strong>${t.student}</strong></td>
      <td>${t.service}</td>
      <td>₱ ${t.amount.toLocaleString()}</td>
      <td><code>${t.ref}</code></td>
      <td>${statusBadge(t.status)}</td>
      <td>${new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td><button class="btn-action">View</button></td>
    </tr>
  `).join('');
}

function initRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = [3200, 4100, 2800, 5600, 4900, 6100, 5300, 7200, 4800, 6500, 5900, 8100];
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Revenue (₱)',
                data,
                borderColor: '#7c6af7',
                backgroundColor: 'rgba(124,106,247,0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#7c6af7',
                pointRadius: 4,
                tension: 0.4,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { grid: { color: '#f0f2f7' }, ticks: { font: { size: 11 }, callback: v => '₱' + v.toLocaleString() } }
            }
        }
    });
}

const ADMIN_API = 'http://127.0.0.1:8000/api';

function handleSignOut() {
    if (confirm('Are you sure you want to sign out?')) {
        const token = localStorage.getItem('auth_token');
        if (token) {
            fetch(`${ADMIN_API}/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                },
            }).catch(() => { });
        }
        localStorage.removeItem('auth_token');
        localStorage.removeItem('aidea_user');
        window.location.href = '../../user/login/login.html';
    }
}

function initDonutChart() {
    const ctx = document.getElementById('donutChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Data Analysis', 'Statistician', 'Grammarian'],
            datasets: [{ data: [45, 25, 30], backgroundColor: ['#38d9a9', '#f5c842', '#3a7bd5'], borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
            cutout: '65%',
            plugins: { legend: { display: false } }
        }
    });
}



document.addEventListener('DOMContentLoaded', () => {

    // ── Session guard ──
    const token = localStorage.getItem('auth_token');
    const user = JSON.parse(localStorage.getItem('aidea_user') || '{}');
    if (!token || user.role !== 'admin') {
        window.location.href = '../../user/login/login.html';
        return;
    }

    // ── Update admin name in sidebar ──
    const footerName = document.querySelector('.footer-name');
    const footerAvatar = document.querySelector('.footer-avatar');
    if (footerName) footerName.textContent = user.full_name || 'Admin';
    if (footerAvatar) footerAvatar.textContent = (user.full_name || 'AD').slice(0, 2).toUpperCase();

    renderTable();
    initRevenueChart();
    initDonutChart();

    document.getElementById('homeBtn')?.addEventListener('click', () => {
        location.href = '../dashboard/dashboard.html';
    });
});


