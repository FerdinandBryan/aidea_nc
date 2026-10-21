# Google registration setup

Create a Google OAuth client of type **Web application** in Google Cloud Console.
Configure the consent screen and add your Vercel frontend origin under Authorized
JavaScript origins (scheme and hostname only, no path). For popup code flow,
the token exchange uses that same origin as the redirect URI.

Set these variables privately on the backend host and redeploy:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_FRONTEND_ORIGIN=https://your-frontend.vercel.app
```

The three registration pages use `https://aidea-nc.wasmer.app/api` in the
Google button's `data-api` attribute. Change this if your backend address differs.
Deploy the backend and frontend changes together. A client secret must never
appear in frontend files or be committed.

The popup requests only identity, email and profile access. The backend exchanges
the one-time code directly with Google and requires a verified email. New accounts
are students and retain the existing separate administrator approval status.
Already-registered email addresses are rejected rather than linked automatically.
Google-created users can set a password through the existing password reset flow
to sign in later. This change adds registration, not Google sign-in for existing users.

Reference: https://developers.google.com/identity/oauth2/web/guides/use-code-model
# Google sign-in

The sign-in pages also use the popup authorization-code flow and post to
`POST /api/auth/google/login`. The existing role-based redirect is reused.
Unknown accounts must register first; archived accounts and accounts awaiting
an email code cannot sign in through Google.

Deploy the `2026_10_22_000001_add_google_sub_to_users_table.php` migration before
using the updated Google endpoints. Registration saves Google's stable subject
identifier. Sign-in uses that identifier; first-time email matching for existing
accounts is limited to verified Gmail or Google Workspace addresses. Other
unlinked accounts must use their password.
