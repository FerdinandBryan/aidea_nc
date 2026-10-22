// Academic-year totals come from the existing dashboard endpoint.
(function () {
    'use strict';
    const panel = document.getElementById('submissionTrends');
    if (!panel) return;
    const find = id => panel.querySelector('#' + id);
    const range = find('trendRange');
    const view = find('trendView');
    const message = find('trendMessage');
    const retry = find('trendRetry');
    const canvas = find('trendCanvas');
    let rows = [];
    let chart = null;

    function normalize(data) {
        const list = Array.isArray(data) ? data : data?.data;
        if (!Array.isArray(list)) throw new Error('Invalid submission totals');
        const years = new Map();
        list.forEach(row => {
            const year = String(row.academic_year || '').trim();
            const count = Number(row.total);
            if (!/^\d{4}-\d{4}$/.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1
                || !Number.isSafeInteger(count) || count < 0) return;
            years.set(year, (years.get(year) || 0) + count);
        });
        if (list.length && !years.size) throw new Error('Invalid academic-year totals');
        return [...years].sort(([a], [b]) => a.localeCompare(b))
            .map(([year, total]) => ({ year, total }));
    }

    function selectedRows() {
        if (range.value === 'all' || !rows.length) return rows;
        const start = Number(rows.at(-1).year.slice(0, 4)) - 4;
        return rows.filter(row => Number(row.year.slice(0, 4)) >= start);
    }

    function setMessage(text, allowRetry) {
        message.textContent = text;
        message.hidden = !text;
        retry.hidden = !allowRetry;
    }

    function render() {
        if (chart) { chart.destroy(); chart = null; }
        const selected = selectedRows();
        const total = selected.reduce((sum, row) => sum + row.total, 0);
        const latest = rows.at(-1);
        const previous = latest && rows.find(row => Number(row.year.slice(0, 4)) === Number(latest.year.slice(0, 4)) - 1);
        find('trendTotal').textContent = total.toLocaleString();
        find('trendLatest').textContent = latest ? latest.total.toLocaleString() : '—';
        find('trendLatestLabel').textContent = latest ? 'Latest year · ' + latest.year : 'Latest academic year';
        const change = find('trendChange');
        change.removeAttribute('data-direction');
        if (previous && previous.total > 0) {
            const percent = (latest.total - previous.total) / previous.total * 100;
            change.textContent = (percent > 0 ? '+' : '') + percent.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
            change.dataset.direction = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
            find('trendChangeLabel').textContent = 'Compared with ' + previous.year;
        } else {
            change.textContent = '—';
            find('trendChangeLabel').textContent = 'No comparable previous year';
        }
        find('trendSummary').textContent = selected.length
            ? selected[0].year + (selected.length > 1 ? ' to ' + selected.at(-1).year : '') + ' · ' + selected.length + ' recorded academic ' + (selected.length === 1 ? 'year' : 'years')
            : 'Academic-year totals from thesis submissions';

        const body = find('trendTableBody');
        body.replaceChildren();
        selected.forEach(row => {
            const tr = document.createElement('tr');
            [row.year, row.total.toLocaleString(), total ? (row.total / total * 100).toFixed(1) + '%' : '0%'].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        if (typeof Chart === 'undefined') view.value = 'table';
        const tableView = view.value === 'table';
        find('trendPlot').hidden = tableView || !selected.length;
        find('trendTable').hidden = !tableView || !selected.length;
        setMessage(selected.length ? '' : 'No thesis submissions yet. Totals will appear here after submissions are recorded.', false);
        find('trendFootnote').textContent = tableView
            ? 'Share is calculated within the selected years.'
            : 'Counts are shown for recorded years. Missing years are not treated as zero.';
        if (!selected.length || tableView) return;

        const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const line = view.value === 'line';
        find('trendPlot').style.height = selected.length === 1 ? '210px' : '260px';
        find('trendPlotInner').style.minWidth = Math.max(280, selected.length * 82) + 'px';
        canvas.setAttribute('aria-label', 'Thesis submissions: ' + selected.map(row => row.year + ': ' + row.total).join(', '));
        chart = new Chart(canvas.getContext('2d'), {
            type: line ? 'line' : 'bar',
            data: {
                labels: selected.map(row => row.year),
                datasets: [{
                    label: 'Submissions', data: selected.map(row => row.total),
                    backgroundColor: line ? color('--chart-fill') : color('--chart-line'),
                    borderColor: color('--chart-line'), borderWidth: line ? 2 : 0,
                    borderRadius: 6, borderSkipped: false, maxBarThickness: 40,
                    pointRadius: 5, pointHoverRadius: 7, fill: line, tension: 0,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
                layout: { padding: { top: 20, right: 12 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { displayColors: false, callbacks: { label: context => context.parsed.y.toLocaleString() + ' submissions' } },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: color('--chart-text'), maxRotation: 0, autoSkip: false } },
                    y: { beginAtZero: true, grace: '20%', suggestedMax: 1,
                        grid: { color: color('--chart-grid') },
                        ticks: { color: color('--chart-text'), precision: 0, maxTicksLimit: 5 } },
                },
            },
            plugins: [{
                id: 'submissionCounts',
                afterDatasetsDraw(instance) {
                    const context = instance.ctx;
                    context.save();
                    context.fillStyle = color('--text');
                    context.font = '600 12px sans-serif';
                    context.textAlign = 'center';
                    instance.getDatasetMeta(0).data.forEach((point, index) => {
                        context.fillText(selected[index].total.toLocaleString(), point.x, point.y - 10);
                    });
                    context.restore();
                },
            }],
        });
    }

    async function refresh() {
        let loaded = false;
        rows = [];
        panel.setAttribute('aria-busy', 'true');
        range.disabled = view.disabled = true;
        if (chart) { chart.destroy(); chart = null; }
        find('trendPlot').hidden = find('trendTable').hidden = true;
        ['trendTotal', 'trendLatest', 'trendChange'].forEach(id => { find(id).textContent = '—'; });
        find('trendSummary').textContent = 'Loading submission totals…';
        setMessage('Loading submission trends…', false);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(ADMIN_API + '/dashboard/thesis-by-year', { headers: authHeaders(), signal: controller.signal });
            if (response.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
            if (!response.ok) throw new Error('Could not load submission totals');
            rows = normalize(await response.json());
            render();
            loaded = true;
        } catch (error) {
            find('trendSummary').textContent = 'Submission totals are temporarily unavailable.';
            setMessage('We could not load submission trends. Please try again.', true);
        } finally {
            clearTimeout(timer);
            panel.setAttribute('aria-busy', 'false');
            range.disabled = view.disabled = !loaded;
        }
    }

    range.addEventListener('change', render);
    view.addEventListener('change', render);
    retry.addEventListener('click', refresh);
    new MutationObserver(() => { if (rows.length && panel.getAttribute('aria-busy') !== 'true') render(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    refresh();
})();
