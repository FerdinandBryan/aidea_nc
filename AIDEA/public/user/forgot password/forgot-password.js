document.addEventListener('DOMContentLoaded', () => {

    const API_BASE = 'http://127.0.0.1:8000/api';

    /* ── STATE ── */
    let submittedEmail = '';
    let resendCountdown = null;

    /* ── PANELS ── */
    const panelRequest     = document.getElementById('panelRequest');
    const panelCode        = document.getElementById('panelCode');
    const panelNewPassword = document.getElementById('panelNewPassword');
    const panelSuccess     = document.getElementById('panelSuccess');

    /* ── STEP 1 ELEMENTS ── */
    const forgotForm     = document.getElementById('forgotForm');
    const resetEmailEl   = document.getElementById('resetEmail');
    const resetBtn       = document.getElementById('resetBtn');
    const resetBtnText   = document.getElementById('resetBtnText');
    const resetBtnSpinner= document.getElementById('resetBtnSpinner');

    /* ── STEP 2 ELEMENTS ── */
    const sentEmailDisplay  = document.getElementById('sentEmailDisplay');
    const codeForm          = document.getElementById('codeForm');
    const resetCodeEl       = document.getElementById('resetCode');
    const verifyBtn         = document.getElementById('verifyBtn');
    const verifyBtnText     = document.getElementById('verifyBtnText');
    const verifyBtnSpinner  = document.getElementById('verifyBtnSpinner');
    const resendBtn         = document.getElementById('resendBtn');
    const resendBtnText     = document.getElementById('resendBtnText');
    const resendBtnSpinner  = document.getElementById('resendBtnSpinner');
    const resendTimer       = document.getElementById('resendTimer');
    const timerCount        = document.getElementById('timerCount');
    const backToEmail       = document.getElementById('backToEmail');

    /* ── STEP 3 ELEMENTS ── */
    const newPasswordForm       = document.getElementById('newPasswordForm');
    const newPasswordEl         = document.getElementById('newPassword');
    const confirmPasswordEl     = document.getElementById('confirmPassword');
    const savePasswordBtn       = document.getElementById('savePasswordBtn');
    const savePasswordBtnText   = document.getElementById('savePasswordBtnText');
    const savePasswordBtnSpinner= document.getElementById('savePasswordBtnSpinner');

    /* ════════════════════════════════════
       STEP 1 — SEND CODE
    ════════════════════════════════════ */
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEmail()) return;

        submittedEmail = resetEmailEl.value.trim();
        setLoading(resetBtn, resetBtnText, resetBtnSpinner, true);

        try {
            const res = await fetch(`${API_BASE}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email: submittedEmail }),
            });

            const data = await res.json();

            if (data.success) {
                sentEmailDisplay.textContent = submittedEmail;
                showPanel('code');
                startResendTimer();
                showToast('Reset code sent! Check your inbox.', 'success');
            } else {
                showError('errResetEmail', data.message || 'Failed to send reset code.');
            }
        } catch (err) {
            showError('errResetEmail', 'Server error. Please try again.');
            console.error(err);
        } finally {
            setLoading(resetBtn, resetBtnText, resetBtnSpinner, false);
        }
    });

    /* ════════════════════════════════════
       STEP 2 — VERIFY CODE
    ════════════════════════════════════ */
    codeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError('errResetCode');

        const code = resetCodeEl.value.trim();
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            showError('errResetCode', 'Please enter the 6-digit code from your email.');
            resetCodeEl.focus();
            return;
        }

        setLoading(verifyBtn, verifyBtnText, verifyBtnSpinner, true);

        try {
            const res = await fetch(`${API_BASE}/verify-reset-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email: submittedEmail, code }),
            });

            const data = await res.json();

            if (data.success) {
                showPanel('newPassword');
                showToast('Code verified! Set your new password.', 'success');
            } else {
                showError('errResetCode', data.message || 'Invalid code. Please try again.');
            }
        } catch (err) {
            showError('errResetCode', 'Server error. Please try again.');
            console.error(err);
        } finally {
            setLoading(verifyBtn, verifyBtnText, verifyBtnSpinner, false);
        }
    });

    /* ── Only allow digits in code input ── */
    resetCodeEl.addEventListener('input', () => {
        resetCodeEl.value = resetCodeEl.value.replace(/\D/g, '');
        clearError('errResetCode');
    });

    /* ── RESEND BUTTON ── */
    resendBtn.addEventListener('click', async () => {
        setLoading(resendBtn, resendBtnText, resendBtnSpinner, true);

        try {
            const res = await fetch(`${API_BASE}/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email: submittedEmail }),
            });

            const data = await res.json();

            if (data.success) {
                showToast('Reset code resent to ' + submittedEmail, 'success');
                startResendTimer();
                resetCodeEl.value = '';
            } else {
                showToast(data.message || 'Failed to resend.', 'error');
            }
        } catch (err) {
            showToast('Server error. Please try again.', 'error');
            console.error(err);
        } finally {
            setLoading(resendBtn, resendBtnText, resendBtnSpinner, false);
        }
    });

    /* ── BACK TO EMAIL ── */
    backToEmail.addEventListener('click', (e) => {
        e.preventDefault();
        if (resendCountdown) clearInterval(resendCountdown);
        resetCodeEl.value = '';
        clearError('errResetCode');
        showPanel('request');
    });

    /* ════════════════════════════════════
       STEP 3 — RESET PASSWORD
    ════════════════════════════════════ */
    newPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError('errNewPassword');
        clearError('errConfirmPassword');

        const password = newPasswordEl.value;
        const confirm  = confirmPasswordEl.value;

        if (password.length < 8) {
            showError('errNewPassword', 'Password must be at least 8 characters.');
            newPasswordEl.focus();
            return;
        }
        if (password !== confirm) {
            showError('errConfirmPassword', 'Passwords do not match.');
            confirmPasswordEl.focus();
            return;
        }

        setLoading(savePasswordBtn, savePasswordBtnText, savePasswordBtnSpinner, true);

        try {
            const res = await fetch(`${API_BASE}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    email: submittedEmail,
                    code: resetCodeEl.value.trim(),
                    password: password,
                    password_confirmation: confirm,
                }),
            });

            const data = await res.json();

            if (data.success) {
                showPanel('success');
                showToast('Password reset successfully!', 'success');
            } else {
                showError('errNewPassword', data.message || 'Failed to reset password.');
            }
        } catch (err) {
            showError('errNewPassword', 'Server error. Please try again.');
            console.error(err);
        } finally {
            setLoading(savePasswordBtn, savePasswordBtnText, savePasswordBtnSpinner, false);
        }
    });

    /* ════════════════════════════════════
       HELPERS
    ════════════════════════════════════ */
    function showPanel(name) {
        panelRequest.style.display     = name === 'request'     ? 'block' : 'none';
        panelCode.style.display        = name === 'code'        ? 'block' : 'none';
        panelNewPassword.style.display = name === 'newPassword' ? 'block' : 'none';
        panelSuccess.style.display     = name === 'success'     ? 'block' : 'none';
    }

    function startResendTimer() {
        resendBtn.disabled = true;
        resendTimer.style.display = 'block';
        let seconds = 60;
        timerCount.textContent = seconds;
        if (resendCountdown) clearInterval(resendCountdown);
        resendCountdown = setInterval(() => {
            seconds--;
            timerCount.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(resendCountdown);
                resendBtn.disabled = false;
                resendTimer.style.display = 'none';
            }
        }, 1000);
    }

    function validateEmail() {
        clearError('errResetEmail');
        resetEmailEl.classList.remove('error');
        const val = resetEmailEl.value.trim();
        if (!val) {
            showError('errResetEmail', 'Email address is required');
            resetEmailEl.classList.add('error');
            resetEmailEl.focus();
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            showError('errResetEmail', 'Please enter a valid email address');
            resetEmailEl.classList.add('error');
            resetEmailEl.focus();
            return false;
        }
        return true;
    }

    resetEmailEl.addEventListener('input', () => {
        if (resetEmailEl.classList.contains('error')) {
            clearError('errResetEmail');
            resetEmailEl.classList.remove('error');
        }
    });
    resetEmailEl.addEventListener('blur', () => validateEmail());

    function showError(id, msg) {
        const el = document.getElementById(id);
        if (el) el.textContent = msg;
    }

    function clearError(id) {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    }

    function setLoading(btn, textEl, spinnerEl, on) {
        btn.disabled = on;
        textEl.style.display = on ? 'none' : 'inline';
        spinnerEl.style.display = on ? 'inline-block' : 'none';
    }

    function showToast(msg, type = 'info') {
        const wrap = document.getElementById('toastWrap');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(() => {
            t.style.transition = 'opacity 0.3s';
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 300);
        }, 3200);
    }

});