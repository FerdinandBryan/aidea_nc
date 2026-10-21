document.addEventListener('DOMContentLoaded', async () => {
    const button = document.getElementById('googleRegister');
    const status = document.getElementById('googleRegisterStatus');
    const api = button.dataset.api;
    const fail = message => { status.textContent = message; button.disabled = false; };
    try {
        const configResponse = await fetch(`${api}/auth/google/config`, { headers: { Accept: 'application/json' } });
        if (!configResponse.ok) throw new Error('Google registration is temporarily unavailable.');
        const config = await configResponse.json();
        if (!config.client_id) throw new Error('Google registration is not available yet. Please use the form below.');
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load Google. Please use the form below.'));
            document.head.appendChild(script);
        });
        const client = google.accounts.oauth2.initCodeClient({
            client_id: config.client_id,
            scope: 'openid email profile',
            ux_mode: 'popup',
            error_callback: () => fail('Google registration was cancelled. You can try again.'),
            callback: async result => {
                if (!result.code) { fail('Google registration was cancelled.'); return; }
                status.textContent = 'Creating your account…';
                try {
                    const response = await fetch(`${api}/auth/google/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                        body: JSON.stringify({ code: result.code }),
                    });
                    const data = await response.json();
                    if (!response.ok || !data.token) throw new Error(data.message || 'Could not create your account.');
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('aidea_user', JSON.stringify(data.user));
                    window.location.assign('../dashboard/dashboard.html');
                } catch (error) { fail(error.message); }
            },
        });
        button.disabled = false;
        button.addEventListener('click', () => {
            button.disabled = true;
            status.textContent = '';
            client.requestCode();
        });
    } catch (error) {
        status.textContent = error.message;
        button.disabled = true;
    }
});
