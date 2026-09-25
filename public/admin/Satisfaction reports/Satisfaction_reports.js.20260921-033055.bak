// satisfaction-reports.js

const ratingBreakdown = [
    { stars: 5, count: 52 },
    { stars: 4, count: 22 },
    { stars: 3, count: 10 },
    { stars: 2, count: 3 },
    { stars: 1, count: 2 },
];

const reviews = [
    { name: 'Maria Santos', service: 'Data Analysis', rating: 5, text: 'Very professional and thorough. The analysis was spot-on and helped me pass my thesis defense!', initials: 'MS' },
    { name: 'Juan dela Cruz', service: 'Statistician', rating: 4, text: 'Great assistance with my statistics chapter. Would have preferred a bit faster turnaround.', initials: 'JD' },
    { name: 'Ana Reyes', service: 'Grammarian', rating: 5, text: 'My thesis was polished beyond what I expected. Excellent grammar corrections!', initials: 'AR' },
    { name: 'Carlo Mendoza', service: 'Data Analysis', rating: 4, text: 'Comprehensive data visualization. Needed minor revisions but overall very satisfied.', initials: 'CM' },
    { name: 'Liza Aquino', service: 'Statistician', rating: 5, text: 'Perfect statistical consultation. Explained everything clearly and patiently.', initials: 'LA' },
];

function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function renderAvgStars() {
    document.getElementById('avgStars').textContent = '★★★★★';
}

function renderBreakdown() {
    const total = ratingBreakdown.reduce((a, b) => a + b.count, 0);
    document.getElementById('ratingBars').innerHTML = ratingBreakdown.map(r => `
    <div class="rating-row">
      <span class="rating-label">${r.stars}★</span>
      <div class="rating-bar-bg">
        <div class="rating-bar-fill" style="width:${Math.round(r.count / total * 100)}%"></div>
      </div>
      <span class="rating-count">${r.count}</span>
    </div>
  `).join('');
}

function initServiceChart() {
    const ctx = document.getElementById('serviceRatingChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Data Analysis', 'Statistician', 'Grammarian'],
            datasets: [{
                data: [4.8, 4.6, 4.7],
                backgroundColor: ['#38d9a9', '#f5c842', '#7c6af7'],
                borderRadius: 7,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 4, max: 5, grid: { color: '#f0f2f7' }, ticks: { font: { size: 11 } } },
                x: { grid: { display: false }, ticks: { font: { size: 12 } } }
            }
        }
    });
}

function renderReviews() {
    document.getElementById('reviewsList').innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-avatar">${r.initials}</div>
      <div style="flex:1">
        <div class="review-header">
          <span class="review-name">${r.name}</span>
          <span class="review-stars">${stars(r.rating)}</span>
        </div>
        <div class="review-service">${r.service}</div>
        <div class="review-text">${r.text}</div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    renderAvgStars();
    renderBreakdown();
    renderReviews();
    initServiceChart();
    document.getElementById('homeBtn').addEventListener('click', () => location.href = 'dashboard.html');
    document.getElementById('signOutBtn').addEventListener('click', () => { if (confirm('Sign out?')) alert('Signed out.'); });
});