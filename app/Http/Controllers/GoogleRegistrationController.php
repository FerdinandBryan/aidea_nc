<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GoogleRegistrationController extends Controller
{
    public function configuration()
    {
        return response()->json(['client_id' => config('services.google.client_id')]);
    }

    public function store(Request $request)
    {
        return $this->authenticate($request, false);
    }

    public function login(Request $request)
    {
        return $this->authenticate($request, true);
    }

    private function authenticate(Request $request, bool $signIn)
    {
        $request->validate(['code' => 'required|string|max:4096']);
        // The popup callback posts from our own frontend, never from a Google redirect.
        $origin = rtrim((string) config('services.google.frontend_origin'), '/');
        abort_unless($origin && $request->header('Origin') === $origin
            && $request->header('X-Requested-With') === 'XMLHttpRequest', 403);
        abort_unless(config('services.google.client_id') && config('services.google.client_secret'), 503,
            'Google sign-in is not configured yet.');

        try {
            $tokens = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
                'client_id' => config('services.google.client_id'),
                'client_secret' => config('services.google.client_secret'),
                'code' => $request->input('code'),
                'grant_type' => 'authorization_code',
                'redirect_uri' => $origin,
            ])->throw()->json();
            if (empty($tokens['access_token'])) {
                return response()->json(['message' => 'Google could not verify this request. Please try again.'], 422);
            }
            $profile = Http::withToken($tokens['access_token'])->timeout(15)
                ->get('https://openidconnect.googleapis.com/v1/userinfo')->throw()->json();
        } catch (\Illuminate\Http\Client\HttpClientException $e) {
            // Never log provider responses, authorization codes or credentials.
            return response()->json(['message' => 'Google verification failed. Please try again.'], 422);
        }

        $email = strtolower(trim((string) ($profile['email'] ?? '')));
        if (($profile['email_verified'] ?? false) !== true || empty($profile['sub'])
            || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return response()->json(['message' => 'Please use a Google account with a verified email address.'], 422);
        }
        if ($signIn) {
            $user = User::where('google_sub', $profile['sub'])->first();
            if (!$user) {
                $user = User::where('email', $email)->first();
                if (!$user) {
                    return response()->json([
                        'message' => 'No account found. Please register first.',
                        'registration_required' => true,
                    ], 404);
                }
                // Google is authoritative for Gmail and verified Workspace addresses.
                // Other existing accounts need password-based linking, not email matching.
                if ($user->google_sub || (!str_ends_with($email, '@gmail.com') && empty($profile['hd']))) {
                    return response()->json(['message' => 'Please sign in with your password for this account.'], 403);
                }
            }
            if (!empty($user->archived_at)) {
                return response()->json(['message' => 'This account has been archived. Please contact the administrator.'], 403);
            }
            if (\Illuminate\Support\Facades\Schema::hasTable('email_verification_codes')
                && \Illuminate\Support\Facades\DB::table('email_verification_codes')->where('email', strtolower($user->email))->exists()) {
                return response()->json(['message' => 'Please confirm your email with the code we sent before signing in.'], 403);
            }
            $user->forceFill(['google_sub' => $profile['sub']])->save();
            $user->tokens()->delete();
            return response()->json([
                'success' => true,
                'token' => $user->createToken('aidea-session')->plainTextToken,
                'user' => $user,
            ]);
        }
        if (User::where('email', $email)->exists()) {
            return response()->json(['message' => 'This email is already registered. Sign in to your existing account.'], 409);
        }
        $user = User::create([
            'fname' => Str::limit($profile['given_name'] ?? $profile['name'] ?? 'Student', 75, ''),
            'lname' => Str::limit($profile['family_name'] ?? '', 75, ''),
            'email' => $email,
            'password_hash' => Hash::make(Str::random(64)),
            'email_verified_at' => now(),
            'is_verified' => false,
            'is_admin' => false,
            'role' => 'student',
        ]);
        $user->forceFill(['google_sub' => $profile['sub']])->save();
        return response()->json([
            'success' => true,
            'token' => $user->createToken('aidea-session')->plainTextToken,
            'user' => $user,
        ], 201);
    }
}
