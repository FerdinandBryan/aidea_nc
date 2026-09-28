


document.addEventListener('DOMContentLoaded', () => {

    // ── Load real session user ──
    const user = JSON.parse(localStorage.getItem('aidea_user') || '{}');
    const fullName = user.full_name || '';
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const initials = (firstName[0] || '') + (lastName[0] || '');

    // Pre-fill fields
    if (document.getElementById('firstName')) document.getElementById('firstName').value = firstName;
    if (document.getElementById('lastName')) document.getElementById('lastName').value = lastName;
    if (document.getElementById('studentId')) document.getElementById('studentId').value = user.student_number || '';
    if (document.getElementById('course')) document.getElementById('course').value = user.course || '';
    if (document.getElementById('email')) document.getElementById('email').value = user.email || '';
    if (document.getElementById('section')) document.getElementById('section').value = user.section || '';
    if (document.getElementById('yearLevel')) document.getElementById('yearLevel').value = user.year_level || '';

    // Update display
    if (document.getElementById('displayName')) document.getElementById('displayName').textContent = fullName;
    if (document.getElementById('displayEmail')) document.getElementById('displayEmail').textContent = user.email || '';
    if (document.getElementById('avatarCircle')) document.getElementById('avatarCircle').textContent = initials.toUpperCase();

    // ── Restore cancel defaults from session (not hardcoded) ──
    document.getElementById('cancelEdit')?.addEventListener('click', () => {
        editing = false;
        inputs.forEach(inp => inp.disabled = true);
        formActions.style.display = 'none';
        toggleBtn.textContent = '✏️ Edit';
        // Restore from real session, not hardcoded values
        document.getElementById('firstName').value = firstName;
        document.getElementById('lastName').value = lastName;
        document.getElementById('studentId').value = user.student_number || '';
        document.getElementById('course').value = user.course || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('section').value = user.section || '';
        document.getElementById('yearLevel').value = user.year_level || '';
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const first = document.getElementById('firstName').value.trim();
        const last = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();

        // Update display
        document.getElementById('displayName').textContent = `${first} ${last}`;
        document.getElementById('displayEmail').textContent = email;
        const initials = (first[0] || '') + (last[0] || '');
        document.getElementById('avatarCircle').textContent = initials.toUpperCase();
        document.querySelectorAll('.user-info h4').forEach(el => el.textContent = `${first} ${last}`);

        editing = false;
        inputs.forEach(inp => inp.disabled = true);
        formActions.style.display = 'none';
        toggleBtn.textContent = '✏️ Edit';

        showToast('Profile updated successfully!');
    });

    // Password section
    const togglePassBtn = document.getElementById('togglePassword');
    const passwordFields = document.getElementById('passwordFields');
    let passOpen = false;

    togglePassBtn?.addEventListener('click', () => {
        passOpen = !passOpen;
        passwordFields.style.display = passOpen ? 'block' : 'none';
        togglePassBtn.textContent = passOpen ? '✖ Cancel' : '🔐 Change';
    });

    document.getElementById('cancelPassword')?.addEventListener('click', () => {
        passOpen = false;
        passwordFields.style.display = 'none';
        togglePassBtn.textContent = '🔐 Change';
        ['currentPass', 'newPass', 'confirmPass'].forEach(id => document.getElementById(id).value = '');
    });

    document.getElementById('savePassword')?.addEventListener('click', () => {
        const cur = document.getElementById('currentPass').value;
        const nw = document.getElementById('newPass').value;
        const conf = document.getElementById('confirmPass').value;
        if (!cur || !nw || !conf) { showToast('Please fill all password fields.', 'error'); return; }
        if (nw !== conf) { showToast('New passwords do not match.', 'error'); return; }
        if (nw.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
        passOpen = false;
        passwordFields.style.display = 'none';
        togglePassBtn.textContent = '🔐 Change';
        ['currentPass', 'newPass', 'confirmPass'].forEach(id => document.getElementById(id).value = '');
        showToast('Password updated successfully!');
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