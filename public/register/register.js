document.addEventListener('DOMContentLoaded', () => {

    let currentStep = 1;

    /* ── STEP NAVIGATION ── */
    function goToStep(step) {
        document.querySelectorAll('.form-step').forEach(s => s.style.display = 'none');
        document.getElementById(`step${step}`).style.display = 'block';

        for (let i = 1; i <= 3; i++) {
            const progStep = document.getElementById(`progStep${i}`);
            const progLine = document.getElementById(`progLine${i}`);
            progStep.classList.remove('active', 'done');
            if (progLine) progLine.classList.remove('done');

            if (i < step) {
                progStep.classList.add('done');
                progStep.querySelector('.prog-dot').textContent = '✓';
                if (progLine) progLine.classList.add('done');
            } else if (i === step) {
                progStep.classList.add('active');
                progStep.querySelector('.prog-dot').textContent = i;
            } else {
                progStep.querySelector('.prog-dot').textContent = i;
            }
        }

        currentStep = step;
        document.querySelector('.auth-right').scrollTop = 0;
    }

    /* ── STEP 1 NEXT ── */
    document.getElementById('nextStep1')?.addEventListener('click', () => {
        if (validateStep1()) goToStep(2);
    });

    /* ── STEP 2 NAV ── */
    document.getElementById('backStep2')?.addEventListener('click', () => goToStep(1));
    document.getElementById('nextStep2')?.addEventListener('click', () => {
        if (validateStep2()) goToStep(3);
    });

    /* ── STEP 3 BACK ── */
    document.getElementById('backStep3')?.addEventListener('click', () => goToStep(2));

    /* ── TOGGLE PASSWORD VISIBILITY (SVG eye icons) ── */
    document.getElementById('togglePass1')?.addEventListener('click', () => {
        togglePassSVG('regPassword', 'eyeShow1', 'eyeHide1');
    });
    document.getElementById('togglePass2')?.addEventListener('click', () => {
        togglePassSVG('regConfirmPass', 'eyeShow2', 'eyeHide2');
    });

    function togglePassSVG(inputId, showId, hideId) {
        const input = document.getElementById(inputId);
        const eyeShow = document.getElementById(showId);
        const eyeHide = document.getElementById(hideId);

        if (input.type === 'password') {
            input.type = 'text';
            eyeShow.style.display = 'none';
            eyeHide.style.display = 'inline';
        } else {
            input.type = 'password';
            eyeShow.style.display = 'inline';
            eyeHide.style.display = 'none';
        }
    }

    /* ── PHONE NUMBER: digits only, max 11 ── */
    document.getElementById('contactNum')?.addEventListener('input', (e) => {
        // Strip non-digits
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
    });

    /* ── PASSWORD STRENGTH ── */
    document.getElementById('regPassword')?.addEventListener('input', (e) => {
        const val = e.target.value;
        updateStrengthUI(checkStrength(val));
        updateHints(val);
    });

    function checkStrength(pass) {
        let score = 0;
        if (pass.length >= 8) score++;
        if (/[A-Z]/.test(pass)) score++;
        if (/[0-9]/.test(pass)) score++;
        if (/[!@#$%^&*]/.test(pass)) score++;
        return score;
    }

    function updateStrengthUI(score) {
        const bar = document.getElementById('strengthFill');
        const label = document.getElementById('strengthLabel');
        const wrap = document.getElementById('passStrength');
        wrap.style.display = 'flex';

        const levels = [
            { pct: '15%', color: '#ef4444', text: 'Very Weak' },
            { pct: '35%', color: '#f97316', text: 'Weak' },
            { pct: '60%', color: '#f59e0b', text: 'Fair' },
            { pct: '80%', color: '#22c55e', text: 'Strong' },
            { pct: '100%', color: '#16a34a', text: 'Very Strong' },
        ];
        const lvl = levels[Math.max(0, score - 1)] || levels[0];
        bar.style.width = score === 0 ? '0%' : lvl.pct;
        bar.style.background = lvl.color;
        label.textContent = score === 0 ? '' : lvl.text;
        label.style.color = lvl.color;
    }

    function updateHints(pass) {
        const hints = [
            { id: 'hint8char', test: pass.length >= 8, text: '✓ At least 8 characters', fail: '○ At least 8 characters' },
            { id: 'hintUpper', test: /[A-Z]/.test(pass), text: '✓ One uppercase letter', fail: '○ One uppercase letter' },
            { id: 'hintNum', test: /[0-9]/.test(pass), text: '✓ One number', fail: '○ One number' },
            { id: 'hintSpecial', test: /[!@#$%^&*]/.test(pass), text: '✓ One special character (!@#$)', fail: '○ One special character (!@#$)' },
        ];
        hints.forEach(h => {
            const el = document.getElementById(h.id);
            if (!el) return;
            el.textContent = h.test ? h.text : h.fail;
            el.classList.toggle('met', h.test);
        });
    }

    /* ── FORM SUBMIT ── */
    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateStep3()) return;

        setLoading(true);

        const payload = {
            first_name: document.getElementById('firstName').value.trim(),
            last_name: document.getElementById('lastName').value.trim(),
            email: document.getElementById('regEmail').value.trim(),
            contact_num: document.getElementById('contactNum').value.trim(),
            address: document.getElementById('address').value.trim(),
            student_number: document.getElementById('studentNum').value.trim(),
            course: document.getElementById('course').value,
            year_level: document.getElementById('yearLevel').value,
            section: document.getElementById('section').value.trim(),
            adviser: document.getElementById('adviser').value.trim(),
            password: document.getElementById('regPassword').value,
            password_confirmation: document.getElementById('regConfirmPass').value,
        };

        try {
            const res = await fetch('http://127.0.0.1:8000/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            setLoading(false);

            if (data.success) {
                document.getElementById('successOverlay').style.display = 'flex';
            } else {
                const errors = data.errors || {};
                const firstError = Object.values(errors)[0];
                if (firstError) showToast(firstError[0], 'error');
                else showToast(data.message || 'Registration failed.', 'error');
            }
        } catch (err) {
            setLoading(false);
            showToast('Server error. Please try again.', 'error');
        }
    });

    /* ── VALIDATION ── */
    function validateStep1() {
        clearErrors(['errFirstName', 'errLastName', 'errEmail', 'errContactNum']);
        let valid = true;

        const first = document.getElementById('firstName').value.trim();
        const last = document.getElementById('lastName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const contact = document.getElementById('contactNum').value.trim();

        if (!first) { showErr('errFirstName', 'First name is required'); valid = false; }
        if (!last) { showErr('errLastName', 'Last name is required'); valid = false; }

        if (!email) {
            showErr('errEmail', 'Email is required'); valid = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showErr('errEmail', 'Enter a valid email address'); valid = false;
        }

        // Contact number: optional but if filled, must be exactly 11 digits
        if (contact && !/^\d{11}$/.test(contact)) {
            showErr('errContactNum', 'Contact number must be exactly 11 digits (e.g. 09123456789)');
            valid = false;
        }

        return valid;
    }

    function validateStep2() {
        clearErrors(['errStudentNum', 'errCourse', 'errYear', 'errSection']);
        let valid = true;

        const num = document.getElementById('studentNum').value.trim();
        const course = document.getElementById('course').value;
        const year = document.getElementById('yearLevel').value;
        const section = document.getElementById('section').value.trim();

        if (!num) {
            showErr('errStudentNum', 'Student number is required'); valid = false;
        } else if (!/^\d{4}-\d{4}$/.test(num)) {
            showErr('errStudentNum', 'Format must be YYYY-XXXX (e.g. 2023-0101)'); valid = false;
        }
        if (!course) { showErr('errCourse', 'Please select a course'); valid = false; }
        if (!year) { showErr('errYear', 'Please select year level'); valid = false; }
        if (!section) { showErr('errSection', 'Section is required'); valid = false; }

        return valid;
    }

    function validateStep3() {
        clearErrors(['errPassword', 'errConfirmPass', 'errTerms']);
        let valid = true;

        const pass = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regConfirmPass').value;
        const terms = document.getElementById('agreeTerms').checked;

        if (!pass) {
            showErr('errPassword', 'Password is required'); valid = false;
        } else if (pass.length < 8) {
            showErr('errPassword', 'Password must be at least 8 characters'); valid = false;
        } else if (checkStrength(pass) < 2) {
            showErr('errPassword', 'Password is too weak. Add uppercase, numbers, or symbols'); valid = false;
        }

        if (!confirm) {
            showErr('errConfirmPass', 'Please confirm your password'); valid = false;
        } else if (pass !== confirm) {
            showErr('errConfirmPass', 'Passwords do not match'); valid = false;
        }

        if (!terms) {
            showErr('errTerms', 'You must agree to the terms to continue'); valid = false;
        }

        return valid;
    }

    function showErr(id, msg) {
        const el = document.getElementById(id);
        if (el) el.textContent = msg;
    }

    function clearErrors(ids) {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });
    }

    /* ── LOADING ── */
    function setLoading(on) {
        const btn = document.getElementById('registerBtn');
        const text = document.getElementById('regBtnText');
        const spinner = document.getElementById('regBtnSpinner');
        btn.disabled = on;
        text.style.display = on ? 'none' : 'inline';
        spinner.style.display = on ? 'inline-block' : 'none';
    }

    /* ── TOAST ── */
    function showToast(msg, type = 'info') {
        const wrap = document.getElementById('toastWrap');
        if (!wrap) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    /* ── HELPERS ── */
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

});