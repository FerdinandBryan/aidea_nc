// Satisfaction_reports.js - live ratings and reviews from /api/admin/feedbacks
(function () {
    'use strict';
    const UI = window.AideaUI;
    const COLORS = ['#38d9a9', '#f5c842', '#7c6af7', '#f97316', '#38bdf8', '#f43f5e'];
    let chart = null, page = 1, lastPage = 1, unread = 0;

    function $(id) { return document.getElementById(id); }
    function stars(n) {
        n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
        return '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
    }
    function initials(name) {
        const p = String(name || '').trim().split(/\s+/).filter(Boolean);
        return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
    }
    function muted(text) {
        const p = UI.el('p', '', text);
        p.style.cssText = 'color:#9ca3af;font-size:13px;padding:8px 0';
        return p;
    }
    function updateBadge() {
        const b = $('unreadBadge');
        if (!b) return;
        b.textContent = unread;
        b.style.display = unread > 0 ? 'inline-block' : 'none';
    }

    // ------------------------------------------------------------ summary + bars + chart
    function renderStats(s) {
        const total = Number(s.total_count) || 0;
        const avg = Number(s.average_rating) || 0;
        $('avgScore').textContent = total ? avg.toFixed(1) : '--';
        $('avgStars').textContent = stars(total ? avg : 0);
        $('totalCount').textContent = total ? 'Based on ' + total + ' review' + (total === 1 ? '' : 's') : 'No reviews yet';

        const b = s.breakdown || {};
        const box = $('ratingBars');
        box.textContent = '';
        [5, 4, 3, 2, 1].forEach(function (n) {
            const c = Number(b[n]) || 0;
            const row = UI.el('div', 'rating-row');
            row.appendChild(UI.el('span', 'rating-label', n + '\u2605'));
            const bg = UI.el('div', 'rating-bar-bg');
            const fill = UI.el('div', 'rating-bar-fill');
            fill.style.width = (total ? Math.round(c / total * 100) : 0) + '%';
            bg.appendChild(fill);
            row.appendChild(bg);
            row.appendChild(UI.el('span', 'rating-count', String(c)));
            box.appendChild(row);
        });
        renderChart(s.per_type || {});
    }

    function renderChart(perType) {
        const canvas = $('serviceRatingChart');
        const labels = Object.keys(perType);
        let note = $('noChartNote');
        if (chart) { chart.destroy(); chart = null; }

        if (!labels.length || typeof Chart === 'undefined') {
            canvas.style.display = 'none';
            if (!note) { note = muted(''); note.id = 'noChartNote'; canvas.parentNode.appendChild(note); }
            note.textContent = labels.length ? 'The chart library did not load (it needs internet).' : 'No ratings yet.';
            return;
        }
        if (note) note.remove();
        canvas.style.display = '';
        chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: labels.map(function (l) { return Number(perType[l]) || 0; }),
                    backgroundColor: labels.map(function (l, i) { return COLORS[i % COLORS.length]; }),
                    borderRadius: 7
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { min: 0, max: 5, grid: { color: '#f0f2f7' }, ticks: { font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 12 } } }
                }
            }
        });
    }

    // ------------------------------------------------------------ reviews
    function smallBtn(text, color) {
        const b = UI.el('button', '', text);
        b.type = 'button';
        b.style.cssText = 'border:1px solid ' + color + ';color:' + color + ';background:#fff;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;margin-right:8px';
        return b;
    }

    function reviewNode(f) {
        const item = UI.el('div', 'review-item');
        item.appendChild(UI.el('div', 'review-avatar', initials(f.student_name)));

        const body = UI.el('div');
        body.style.flex = '1';
        const head = UI.el('div', 'review-header');
        head.appendChild(UI.el('span', 'review-name', f.student_name));
        if (!f.is_read) {
            const nw = UI.el('span', '', 'NEW');
            nw.style.cssText = 'background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;margin-left:8px';
            head.appendChild(nw);
        }
        head.appendChild(UI.el('span', 'review-stars', stars(f.rating)));
        body.appendChild(head);
        body.appendChild(UI.el('div', 'review-service', f.feedback_type + (f.reference ? ' \u00B7 ' + f.reference : '')));
        body.appendChild(UI.el('div', 'review-text', f.comment));

        const foot = UI.el('div', 'review-service', f.date + (f.recommend ? ' \u00B7 Would recommend: ' + f.recommend : ''));
        foot.style.marginTop = '8px';
        body.appendChild(foot);

        const actions = UI.el('div');
        actions.style.marginTop = '8px';
        if (!f.is_read) {
            const rd = smallBtn('Mark as read', '#2563eb');
            rd.addEventListener('click', function () { markRead(f, item, rd); });
            actions.appendChild(rd);
        }
        const del = smallBtn('Delete', '#dc2626');
        del.addEventListener('click', function () { removeReview(f); });
        actions.appendChild(del);
        body.appendChild(actions);

        item.appendChild(body);
        return item;
    }

    async function markRead(f, item, btn) {
        btn.disabled = true;
        try {
            await UI.apiFetch('/api/admin/feedbacks/' + f.id + '/read', { method: 'PATCH' });
            f.is_read = true;
            unread = Math.max(0, unread - 1);
            updateBadge();
            item.replaceWith(reviewNode(f));
        } catch (e) {
            btn.disabled = false;
            UI.showError(e);
        }
    }

    async function removeReview(f) {
        const ok = await UI.openModal({
            title: 'Delete review', type: 'warning',
            message: 'Delete the review from ' + f.student_name + '? This cannot be undone.',
            confirmText: 'Delete', cancelText: 'Cancel'
        });
        if (!ok) return;
        try {
            await UI.apiFetch('/api/admin/feedbacks/' + f.id, { method: 'DELETE' });
            await loadAll();
        } catch (e) {
            UI.showError(e);
        }
    }

    async function loadReviews(reset) {
        const data = await UI.apiFetch('/api/admin/feedbacks?page=' + page);
        const pg = data.feedbacks || {};
        const items = pg.data || [];
        lastPage = pg.last_page || 1;
        unread = Number(data.unread_count) || 0;
        updateBadge();

        const list = $('reviewsList');
        if (reset) list.textContent = '';
        const oldMore = $('loadMoreBtn');
        if (oldMore) oldMore.remove();

        if (!items.length && reset) { list.appendChild(muted('No reviews yet. They appear here when students submit feedback.')); return; }
        items.forEach(function (f) { list.appendChild(reviewNode(f)); });

        if (page < lastPage) {
            const more = UI.el('button', 'btn-dl', 'Load more');
            more.id = 'loadMoreBtn';
            more.type = 'button';
            more.style.marginTop = '12px';
            more.addEventListener('click', async function () {
                page++;
                more.disabled = true;
                try { await loadReviews(false); }
                catch (e) { page--; more.disabled = false; UI.showError(e); }
            });
            list.appendChild(more);
        }
    }

    async function loadAll() {
        try {
            const stats = await UI.apiFetch('/api/admin/feedbacks/stats');   // one request at a time so the token prompt shows once
            renderStats(stats);
            page = 1;
            await loadReviews(true);
        } catch (e) {
            $('totalCount').textContent = 'Could not load';
            const list = $('reviewsList');
            list.textContent = '';
            list.appendChild(muted('Reviews could not be loaded. Reload the page to try again.'));
            UI.showError(e);
        }
    }

    // ------------------------------------------------------------ init
    document.addEventListener('DOMContentLoaded', function () {
        if (!UI) {
            $('reviewsList').textContent = 'aidea-ui.js did not load. Check that it sits in the admin folder.';
            return;
        }
        $('homeBtn').addEventListener('click', function () { location.href = '../dashboard/dashboard.html'; });
        $('signOutBtn').addEventListener('click', async function () {
            const ok = await UI.openModal({ title: 'Sign out', message: 'Are you sure you want to sign out?', type: 'warning', confirmText: 'Sign out', cancelText: 'Cancel' });
            if (ok) {
                UI.clearToken();
                UI.openModal({ title: 'Signed out', message: 'You have been signed out.', type: 'success' });
            }
        });
        loadAll();
    });
})();