document.addEventListener('DOMContentLoaded', () => {

    const $ = id => document.getElementById(id);
    const API = 'http://127.0.0.1:8000/api';

    /* ── THEME (shares the 'aidea_theme' key with the admin dashboard) ── */
    const root = document.documentElement;

    function applyTheme(theme, persist) {
        root.setAttribute('data-theme', theme);
        if (persist) { try { localStorage.setItem('aidea_theme', theme); } catch { } }
        $('themeBtn')?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    }

    applyTheme(root.getAttribute('data-theme') || 'light', false);
    $('themeBtn')?.addEventListener('click', () => {
        applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });

    /* ── SHOW / HIDE PASSWORD ── */
    document.querySelectorAll('.toggle-pass').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.target);
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.classList.toggle('shown', show);
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        });
    });

    /* ── PASSWORD STRENGTH ── */
    const rules = {
        hint8char: p => p.length >= 8,
        hintUpper: p => /[A-Z]/.test(p),
        hintNum: p => /[0-9]/.test(p),
        hintSpecial: p => /[!@#$%^&*]/.test(p),
    };

    const levels = [
        { pct: '15%', color: '#ef4444', text: 'Very weak' },
        { pct: '35%', color: '#f97316', text: 'Weak' },
        { pct: '60%', color: '#f5b301', text: 'Fair' },
        { pct: '80%', color: '#22c55e', text: 'Strong' },
        { pct: '100%', color: '#16a34a', text: 'Very strong' },
    ];

    function checkStrength(pass) {
        return Object.values(rules).filter(test => test(pass)).length;
    }

    function updateStrength(pass) {
        // only show the strength box while the person is typing a password
        $('strengthBox').hidden = pass.length === 0;

        const score = checkStrength(pass);
        const lvl = levels[Math.max(0, score - 1)];
        const fill = $('strengthFill');
        const label = $('strengthLabel');

        fill.style.width = score === 0 ? '0' : lvl.pct;
        fill.style.background = lvl.color;
        label.textContent = score === 0 ? 'Very weak' : lvl.text;
        label.style.color = score === 0 ? '' : lvl.color;

        Object.entries(rules).forEach(([id, test]) => $(id)?.classList.toggle('met', test(pass)));
    }

    $('regPassword')?.addEventListener('input', e => updateStrength(e.target.value));

    /* ── FORM SUBMIT ── */
    $('registerForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);

        const payload = {
            fname: $('fname').value.trim(),
            lname: $('lname').value.trim(),
            mi: $('mi').value.trim() || null,
            email: $('regEmail').value.trim(),
            password: $('regPassword').value,
            password_confirmation: $('regConfirmPass').value,
        };

        try {
            const res = await fetch(`${API}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            setLoading(false);

            if (data.success) {
                $('successOverlay').hidden = false;
                document.querySelector('#successOverlay .btn-submit')?.focus();
            } else {
                const firstError = Object.values(data.errors || {})[0];
                showToast(firstError ? firstError[0] : (data.message || 'Registration failed.'), 'error');
            }
        } catch {
            setLoading(false);
            showToast('Couldn’t reach the server. Check your connection and try again.', 'error');
        }
    });

    /* ── VALIDATION ── */
    const errorFields = { errFname: 'fname', errLname: 'lname', errEmail: 'regEmail', errPassword: 'regPassword', errConfirmPass: 'regConfirmPass' };

    function validateForm() {
        Object.keys(errorFields).concat('errTerms').forEach(id => showErr(id, ''));

        const fname = $('fname').value.trim();
        const lname = $('lname').value.trim();
        const email = $('regEmail').value.trim();
        const pass = $('regPassword').value;
        const confirm = $('regConfirmPass').value;
        let valid = true;
        const fail = (id, msg) => { showErr(id, msg); valid = false; };

        if (!fname) fail('errFname', 'Enter your first name');
        if (!lname) fail('errLname', 'Enter your last name');

        if (!email) fail('errEmail', 'Enter your email address');
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('errEmail', 'Enter a valid email address');

        if (!pass) fail('errPassword', 'Enter a password');
        else if (pass.length < 8) fail('errPassword', 'Use at least 8 characters');
        else if (checkStrength(pass) < 2) fail('errPassword', 'Too weak. Add an uppercase letter, number, or symbol');

        if (!confirm) fail('errConfirmPass', 'Confirm your password');
        else if (pass !== confirm) fail('errConfirmPass', 'Passwords don’t match');

        if (!$('agreeTerms').checked) fail('errTerms', 'Agree to the terms to continue');

        document.querySelector('input.error')?.focus();
        return valid;
    }

    function showErr(id, msg) {
        const el = $(id);
        if (el) el.textContent = msg;
        const input = $(errorFields[id]);
        if (input) input.classList.toggle('error', !!msg);
    }

    // clear a field's error as soon as the person edits it
    Object.entries(errorFields).forEach(([errId, inputId]) => {
        $(inputId)?.addEventListener('input', () => showErr(errId, ''));
    });
    $('agreeTerms')?.addEventListener('change', () => showErr('errTerms', ''));

    /* ── TERMS / PRIVACY MODAL ── */
    const legal = $('legalModal');
    let legalTrigger = null;

    function showTab(name) {
        ['terms', 'privacy'].forEach(t => {
            const on = t === name;
            $('panel' + (t === 'terms' ? 'Terms' : 'Privacy')).hidden = !on;
            const tab = $('tab' + (t === 'terms' ? 'Terms' : 'Privacy'));
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        });
        $('legalBody').scrollTop = 0;
    }

    function openLegal(tab, trigger) {
        legalTrigger = trigger || null;
        showTab(tab);
        legal.hidden = false;
        document.body.classList.add('no-scroll');
        $('legalAgree').focus();
    }

    function closeLegal() {
        legal.hidden = true;
        document.body.classList.remove('no-scroll');
        legalTrigger?.focus();
    }

    document.querySelectorAll('[data-legal]').forEach(a => {
        a.addEventListener('click', e => { e.preventDefault(); openLegal(a.dataset.legal, a); });
    });
    document.querySelectorAll('.legal-tabs [data-tab]').forEach(t => {
        t.addEventListener('click', () => showTab(t.dataset.tab));
    });
    $('legalClose')?.addEventListener('click', closeLegal);
    $('legalCancel')?.addEventListener('click', closeLegal);
    $('legalAgree')?.addEventListener('click', () => {
        $('agreeTerms').checked = true;
        showErr('errTerms', '');
        closeLegal();
    });
    legal?.addEventListener('click', e => { if (e.target === legal) closeLegal(); });
    document.addEventListener('keydown', e => {
        if (!legal.hidden && e.key === 'Escape') closeLegal();
    });

    /* ── LOADING ── */
    function setLoading(on) {
        $('registerBtn').disabled = on;
        $('regBtnText').textContent = on ? 'Creating account…' : 'Create account';
        $('regBtnSpinner').hidden = !on;
    }

    /* ── TOAST ── */
    function showToast(msg, type = 'info') {
        const wrap = $('toastWrap');
        if (!wrap) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }
});