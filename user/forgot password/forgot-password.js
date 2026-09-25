document.addEventListener('DOMContentLoaded', () => {

    /* ── STATE ── */
    let submittedEmail = '';
    let resendCountdown = null;

    /* ── ELEMENTS ── */
    const forgotForm = document.getElementById('forgotForm');
    const resetEmailEl = document.getElementById('resetEmail');
    const errResetEmail = document.getElementById('errResetEmail');
    const resetBtn = document.getElementById('resetBtn');
    const resetBtnText = document.getElementById('resetBtnText');
    const resetBtnSpinner = document.getElementById('resetBtnSpinner');

    const panelRequest = document.getElementById('panelRequest');
    const panelSent = document.getElementById('panelSent');
    const sentEmailDisplay = document.getElementById('sentEmailDisplay');

    const resendBtn = document.getElementById('resendBtn');
    const resendBtnText = document.getElementById('resendBtnText');
    const resendBtnSpinner = document.getElementById('resendBtnSpinner');
    const resendTimer = document.getElementById('resendTimer');
    const timerCount = document.getElementById('timerCount');

    /* ── FORM SUBMIT ── */
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEmail()) return;

        submittedEmail = resetEmailEl.value.trim();

        setLoading(resetBtn, resetBtnText, resetBtnSpinner, true);
        await delay(1600);
        setLoading(resetBtn, resetBtnText, resetBtnSpinner, false);

        // Show sent panel
        sentEmailDisplay.textContent = submittedEmail;
        panelRequest.style.display = 'none';
        panelSent.style.display = 'block';

        // Start resend cooldown
        startResendTimer();

        showToast('Reset link sent! Check your inbox.', 'success');
    });

    /* ── RESEND BUTTON ── */
    resendBtn.addEventListener('click', async () => {
        setLoading(resendBtn, resendBtnText, resendBtnSpinner, true);
        await delay(1400);
        setLoading(resendBtn, resendBtnText, resendBtnSpinner, false);

        showToast('Reset link resent to ' + submittedEmail, 'success');

        // Start cooldown again
        startResendTimer();
    });

    /* ── RESEND COUNTDOWN ── */
    function startResendTimer() {
        // Disable resend button, show timer
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

    /* ── VALIDATION ── */
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

    /* ── REAL-TIME VALIDATION ── */
    resetEmailEl.addEventListener('input', () => {
        if (resetEmailEl.classList.contains('error')) {
            clearError('errResetEmail');
            resetEmailEl.classList.remove('error');
        }
    });

    resetEmailEl.addEventListener('blur', () => {
        validateEmail();
    });

    /* ── ERROR HELPERS ── */
    function showError(id, msg) {
        const el = document.getElementById(id);
        if (el) el.textContent = msg;
    }

    function clearError(id) {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    }

    /* ── LOADING STATE ── */
    function setLoading(btn, textEl, spinnerEl, on) {
        btn.disabled = on;
        textEl.style.display = on ? 'none' : 'inline';
        spinnerEl.style.display = on ? 'inline-block' : 'none';
    }

    /* ── TOAST ── */
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

    /* ── HELPERS ── */
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

});