document.addEventListener('DOMContentLoaded', () => {
    let selectedRating = 0;
    const stars = document.querySelectorAll('.star');
    const ratingLabel = document.getElementById('ratingLabel');
    const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

    stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const val = parseInt(star.dataset.val);
            highlightStars(val);
        });
        star.addEventListener('mouseleave', () => {
            highlightStars(selectedRating);
        });
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.val);
            highlightStars(selectedRating);
            ratingLabel.textContent = `${selectedRating}/5 – ${labels[selectedRating]}`;
            ratingLabel.style.color = 'var(--accent)';
            ratingLabel.style.fontWeight = '700';
        });
    });

    function highlightStars(val) {
        stars.forEach(s => {
            const sv = parseInt(s.dataset.val);
            s.classList.toggle('active', sv <= val);
        });
    }

    document.getElementById('submitFeedbackBtn')?.addEventListener('click', () => {
        const type = document.getElementById('feedbackType').value;
        const ref = document.getElementById('feedbackRef').value.trim();
        const comment = document.getElementById('feedbackComment').value.trim();
        const recommend = document.querySelector('input[name="recommend"]:checked')?.value;

        if (!type) { showToast('Please select a feedback type.', 'error'); return; }
        if (!selectedRating) { showToast('Please select a rating.', 'error'); return; }
        if (!comment) { showToast('Please add your comments.', 'error'); return; }

        const starStr = '★'.repeat(selectedRating) + '☆'.repeat(5 - selectedRating);
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const prevList = document.getElementById('prevFeedbacks');
        const item = document.createElement('div');
        item.className = 'prev-fb-item';
        item.innerHTML = `
      <div class="prev-fb-header">
        <strong>${type}</strong>
        <div class="prev-stars">${starStr}</div>
      </div>
      <p class="prev-fb-ref">${ref || 'General'}</p>
      <p class="prev-fb-comment">"${comment}"</p>
      <span class="prev-fb-date">${today}</span>
    `;
        prevList.prepend(item);

        // Reset form
        document.getElementById('feedbackType').value = '';
        document.getElementById('feedbackRef').value = '';
        document.getElementById('feedbackComment').value = '';
        document.querySelectorAll('input[name="recommend"]').forEach(r => r.checked = false);
        selectedRating = 0;
        highlightStars(0);
        ratingLabel.textContent = 'Click to rate';
        ratingLabel.style.color = '';
        ratingLabel.style.fontWeight = '';

        // Update summary count
        const countEl = document.querySelector('.fb-stat-num');
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;

        showToast('Feedback submitted! Thank you.');
    });

    document.querySelector('.btn-signout')?.addEventListener('click', () => {
        if (confirm('Sign out?')) alert('Signed out.');
    });

    function showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = `position:fixed;bottom:28px;right:28px;background:${type === 'error' ? '#ef4444' : '#22c55e'};color:#fff;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
});