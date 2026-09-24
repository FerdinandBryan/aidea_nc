document.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard ──
    const session = AideaSession.require('student');
    if (!session) return;
    const { token, user } = session;

    const fileDrop = document.getElementById('fileDrop');
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');

    fileDrop.addEventListener('click', () => fileInput.click());
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault(); fileDrop.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) showFile(file);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) showFile(fileInput.files[0]);
    });

    function showFile(file) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        filePreview.style.display = 'flex';
        filePreview.innerHTML = `<span>📎</span><span>${file.name} (${sizeMB} MB)</span><button onclick="clearFile()" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:#888">✕</button>`;
    }

    window.clearFile = () => {
        fileInput.value = '';
        filePreview.style.display = 'none';
    };

    document.getElementById('resetBtn')?.addEventListener('click', () => {
        document.getElementById('thesisForm').reset();
        window.clearFile();
    });

    document.querySelector('.btn-signout')?.addEventListener('click', () => {
        AideaSession.logout();
    });

    document.getElementById('thesisForm')?.addEventListener('submit', async e => {
        e.preventDefault();

        const title = document.getElementById('thesisTitle').value.trim();
        const course = document.getElementById('thesisCourse').value;
        const year = document.getElementById('thesisYear').value.trim();
        const abstract = document.getElementById('thesisAbstract').value.trim();
        const adviser = document.getElementById('adviserName').value.trim();
        const subType = document.getElementById('submissionType').value;
        const authors = document.getElementById('authors').value.trim();
        const file = fileInput.files[0];

        if (!title) { showToast('Thesis title is required.', 'error'); return; }
        if (!course) { showToast('Please select a course.', 'error'); return; }
        if (!year) { showToast('Academic year is required.', 'error'); return; }
        if (abstract.length < 50) { showToast(`Abstract is too short (${abstract.length} chars). Minimum is 50 characters.`, 'error'); return; }
        if (!adviser) { showToast('Adviser name is required.', 'error'); return; }
        if (!file) { showToast('Please upload a file.', 'error'); return; }

        const allowedExts = ['.pdf', '.docx'];
        const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!allowedExts.includes(fileExt)) { showToast('Only PDF or DOCX files are allowed.', 'error'); return; }

        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) { showToast('File exceeds 20MB limit.', 'error'); return; }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('course', course);
        formData.append('academic_year', year);
        formData.append('abstract', abstract);
        formData.append('adviser_name', adviser);
        formData.append('submission_type', subType);
        formData.append('authors', authors);
        formData.append('file', file);

        try {
            const response = await fetch('http://127.0.0.1:8000/api/thesis/submit', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                const errors = result.errors
                    ? Object.entries(result.errors).map(([field, msgs]) => `• ${field}: ${msgs.join(', ')}`).join('\n')
                    : result.message;
                showToast(errors || 'Submission failed.', 'error');
                return;
            }

            showToast('Thesis submitted successfully! You will be notified of the status.');
            setTimeout(() => window.location.href = '../my submission/my-submissions.html', 1800);

        } catch (err) {
            console.error('Network / parse error:', err);
            showToast('Network error. Please try again.', 'error');
        }
    });

    function showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = `position:fixed;bottom:28px;right:28px;background:${type === 'error' ? '#ef4444' : '#22c55e'};color:#fff;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.15);white-space:pre-line;`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    window._showToast = showToast;
});

/* ══════════════════════════════════════════
   Check Formatting — opens the modal, which now
   has its own upload area. No file is read from
   the main page form here. Kept outside the auth
   guard so it works even if AideaSession.require()
   hasn't resolved.
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('checkFormatBtn')?.addEventListener('click', () => {
        window.openDocValidationModalForFile(
            null,
            'Format Check',
            'window._showToast ? window._showToast("Formatting check complete.") : null'
        );
    });
});