(function () {
    'use strict';

    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme');
            var next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('aidea_user_theme', next); } catch (e) { }
            themeBtn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        });
    }

    var forgotForm = document.getElementById('forgotForm');
    var emailEl = document.getElementById('email');
    var emailError = document.getElementById('emailError');
    var sendBtn = document.getElementById('sendBtn');

    var requestCard = document.getElementById('requestCard');
    var confirmCard = document.getElementById('confirmCard');
    var sentEmailEl = document.getElementById('sentEmail');

    var backToLoginBtn = document.getElementById('backToLoginBtn');
    var resendBtn = document.getElementById('resendBtn');

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function setLoading(isLoading) {
        if (!sendBtn) return;
        sendBtn.disabled = isLoading;
        sendBtn.classList.toggle('is-loading', isLoading);
    }

    if (forgotForm) {
        forgotForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var value = emailEl ? emailEl.value.trim() : '';

            if (!isValidEmail(value)) {
                if (emailEl) emailEl.classList.add('has-error');
                if (emailError) emailError.textContent = 'Please enter a valid email address.';
                return;
            }

            if (emailEl) emailEl.classList.remove('has-error');
            if (emailError) emailError.textContent = '';

            setLoading(true);

            setTimeout(function () {
                setLoading(false);
                if (sentEmailEl) sentEmailEl.textContent = value;
                if (requestCard) requestCard.hidden = true;
                if (confirmCard) confirmCard.hidden = false;
            }, 900);
        });
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', function () {
            window.location.href = '../login/login.html';
        });
    }

    if (resendBtn) {
        resendBtn.addEventListener('click', function () {
            resendBtn.disabled = true;
            var original = resendBtn.textContent;
            resendBtn.textContent = 'Sending...';
            setTimeout(function () {
                resendBtn.textContent = 'Sent!';
                setTimeout(function () {
                    resendBtn.textContent = original;
                    resendBtn.disabled = false;
                }, 2000);
            }, 800);
        });
    }
})();
