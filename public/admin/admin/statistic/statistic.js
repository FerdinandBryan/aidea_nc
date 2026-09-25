// statistics.js

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function initSubmissionsChart() {
    const ctx = document.getElementById('submissionsChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Submissions',
                data: [5, 8, 6, 12, 9, 14, 11, 18, 10, 15, 13, 20],
                backgroundColor: 'rgba(124,106,247,0.75)',
                borderRadius: 7,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                y: { grid: { color: '#f0f2f7' }, ticks: { font: { size: 11 } } }
            }
        }
    });
}

function initServiceBarChart() {
    const ctx = document.getElementById('serviceBarChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Data Analysis', 'Statistician', 'Grammarian'],
            datasets: [{
                data: [45, 25, 30],
                backgroundColor: ['#38d9a9', '#f5c842', '#7c6af7'],
                borderRadius: 7,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: '#f0f2f7' }, ticks: { callback: v => v + '%', font: { size: 11 } } },
                y: { grid: { display: false }, ticks: { font: { size: 12 } } }
            }
        }
    });
}

function initEnrollmentChart() {
    const ctx = document.getElementById('enrollmentChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Enrolled',
                data: [18, 22, 19, 28, 25, 30, 27, 35, 24, 32, 29, 38],
                borderColor: '#38d9a9',
                backgroundColor: 'rgba(56,217,169,0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#38d9a9',
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
                y: { grid: { color: '#f0f2f7' }, ticks: { font: { size: 11 } } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initSubmissionsChart();
    initServiceBarChart();
    initEnrollmentChart();
    document.getElementById('homeBtn').addEventListener('click', () => location.href = 'dashboard.html');
    document.getElementById('signOutBtn').addEventListener('click', () => { if (confirm('Sign out?')) alert('Signed out.'); });
});