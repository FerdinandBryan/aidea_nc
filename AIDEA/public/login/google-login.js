document.addEventListener('DOMContentLoaded', async () => {
    const button = document.getElementById('googleLogin');
    const status = document.getElementById('googleLoginStatus');
    if (!button || !status) return;
    const api = button.dataset.api;
    let client = null;
    let setupError = '';
    button.addEventListener('click', () => {
        if (!client) {
            status.textContent = setupError || 'Google is loading. Please try again in a moment.';
            return;
        }
        button.disabled = true;
        status.textContent = '';
        try { client.requestCode(); }
        catch (error) { fail('Could not open Google. Please allow popups and try again.'); }
    });
    const fail = message => { status.textContent = message; button.disabled = false; };
    try {
        const configResponse = await fetch(`${api}/auth/google/config`, { headers: { Accept: 'application/json' } });
        if (!configResponse.ok) throw new Error('Google sign-in is temporarily unavailable.');
        const config = await configResponse.json();
        if (!config.client_id) throw new Error('Google sign-in is not available yet. Please use the form below.');
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load Google. Please use the form below.'));
            document.head.appendChild(script);
        });
        client = google.accounts.oauth2.initCodeClient({
            client_id: config.client_id,
            scope: 'openid email profile',
            ux_mode: 'popup',
            error_callback: () => fail('Google sign-in was cancelled. You can try again.'),
            callback: async result => {
                if (!result.code) { fail('Google sign-in was cancelled.'); return; }
                status.textContent = 'Signing you in…';
                try {
                    const response = await fetch(`${api}/auth/google/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                        body: JSON.stringify({ code: result.code }),
                    });
                    const data = await response.json();
                    if (!response.ok || !data.token) throw new Error(data.message || 'Could not sign in.');
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('aidea_user', JSON.stringify(data.user));
                    window.location.assign(resolveRedirect(data.user));
                } catch (error) { fail(error.message); }
            },
        });
        button.disabled = false;
    } catch (error) {
        setupError = error.message;
        status.textContent = setupError;
        button.disabled = false;
    }
});
