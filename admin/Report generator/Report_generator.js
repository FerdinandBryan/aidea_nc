// report-generator.js

const sampleReports = [
    { name: 'Revenue Summary — December 2024', type: 'PDF', date: '2024-12-31', size: '1.2 MB' },
    { name: 'Thesis Submission Report — Q4 2024', type: 'CSV', date: '2024-12-28', size: '320 KB' },
    { name: 'Student Enrollment Report — Nov 2024', type: 'PDF', date: '2024-11-30', size: '890 KB' },
    { name: 'Service Usage Report — Q3 2024', type: 'Excel', date: '2024-09-30', size: '450 KB' },
];

function typeIcon(t) {
    const icons = { PDF: '📄', CSV: '📊', Excel: '📑' };
    return icons[t] || '📄';
}

function renderReports() {
    const list = document.getElementById('reportList');
    list.innerHTML = sampleReports.map(r => `
    <div class="report-item">
      <div class="report-info">
        <div class="report-name">${typeIcon(r.type)} ${r.name}</div>
        <div class="report-meta">${r.type} · ${r.size} · Generated ${new Date(r.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
      <button class="btn-dl">Download</button>
    </div>
  `).join('');

    list.querySelectorAll('.btn-dl').forEach((btn, i) => {
        btn.addEventListener('click', () => alert(`Downloading: ${sampleReports[i].name}`));
    });
}

function handleGenerate() {
    const type = document.getElementById('reportType').value;
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    const fmt = document.querySelector('input[name="fmt"]:checked').value;
    if (!from || !to) { alert('Please select a date range.'); return; }
    if (new Date(from) > new Date(to)) { alert('Start date must be before end date.'); return; }

    const btn = document.getElementById('generateBtn');
    btn.textContent = 'Generating…';
    btn.disabled = true;
    setTimeout(() => {
        const newReport = { name: `${type} — ${from} to ${to}`, type: fmt, date: to, size: '560 KB' };
        sampleReports.unshift(newReport);
        renderReports();
        btn.textContent = 'Generate Report';
        btn.disabled = false;
        alert(`✅ Report generated successfully as ${fmt}!`);
    }, 1500);
}

document.addEventListener('DOMContentLoaded', () => {
    renderReports();
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
    document.getElementById('homeBtn').addEventListener('click', () => location.href = 'dashboard.html');
    document.getElementById('signOutBtn').addEventListener('click', () => { if (confirm('Sign out?')) alert('Signed out.'); });

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateTo').value = today;
    const from = new Date(); from.setMonth(from.getMonth() - 1);
    document.getElementById('dateFrom').value = from.toISOString().split('T')[0];
});