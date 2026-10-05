<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Notifications\AccountApprovedNotification;
use Illuminate\Auth\Events\Registered;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            "fname" => "required|string|max:75",
            "lname" => "required|string|max:75",
            "mi" => "nullable|string|max:5",
            "email" => "required|email",
            "password" => "required|string|min:8|confirmed",
        ]);

        $email = strtolower(trim($validated["email"]));
        $existing = User::where("email", $email)->first();
        $pending = $existing
            ? \Illuminate\Support\Facades\DB::table("email_verification_codes")->where("email", $email)->exists()
            : false;

        if ($existing && !$pending) {
            return response()->json([
                "success" => false,
                "message" => "This email is already registered.",
                "errors" => ["email" => ["This email is already registered."]],
            ], 422);
        }

        if ($existing) {
            // Unconfirmed signup being retried: update the details and send a fresh code
            $existing->forceFill([
                "fname" => $validated["fname"],
                "lname" => $validated["lname"],
                "mi" => $validated["mi"] ?? null,
                "password_hash" => Hash::make($validated["password"]),
            ])->save();
        } else {
            User::create([
                "fname" => $validated["fname"],
                "lname" => $validated["lname"],
                "mi" => $validated["mi"] ?? null,
                "email" => $email,
                "password_hash" => Hash::make($validated["password"]),
                "is_verified" => 0,
            ]);
        }

        if (!$this->issueEmailCode($email)) {
            return response()->json([
                "success" => false,
                "message" => "We could not send the verification code right now. Please try again in a moment.",
            ], 503);
        }

        return response()->json([
            "success" => true,
            "message" => "We sent a 6-digit code to your email.",
            "email" => $email,
            "cooldown" => 60,
        ], 201);
    }

    public function verifyEmail(Request $request)
    {
        $request->validate([
            "email" => "required|email",
            "code" => "required|string|size:6",
        ]);

        $email = strtolower(trim($request->email));
        $row = \Illuminate\Support\Facades\DB::table("email_verification_codes")->where("email", $email)->first();

        if (!$row) {
            return response()->json(["success" => false, "message" => "No pending verification for this email."], 400);
        }
        if (\Carbon\Carbon::parse($row->expires_at)->isPast()) {
            return response()->json(["success" => false, "message" => "This code has expired. Please request a new one."], 400);
        }
        if ($row->attempts >= 5) {
            return response()->json(["success" => false, "message" => "Too many wrong attempts. Please request a new code."], 429);
        }
        if (!Hash::check($request->code, $row->code_hash)) {
            \Illuminate\Support\Facades\DB::table("email_verification_codes")->where("email", $email)->increment("attempts");
            $left = max(0, 4 - $row->attempts);
            return response()->json([
                "success" => false,
                "message" => $left > 0 ? "Incorrect code. {$left} attempt(s) left." : "Incorrect code. Please request a new one.",
            ], 400);
        }

        User::where("email", $email)->update(["email_verified_at" => now()]);
        \Illuminate\Support\Facades\DB::table("email_verification_codes")->where("email", $email)->delete();

        return response()->json(["success" => true, "message" => "Email confirmed."]);
    }

    public function resendEmailCode(Request $request)
    {
        $request->validate(["email" => "required|email"]);

        $email = strtolower(trim($request->email));
        $row = \Illuminate\Support\Facades\DB::table("email_verification_codes")->where("email", $email)->first();

        if (!$row) {
            return response()->json(["success" => false, "message" => "No pending verification for this email."], 400);
        }

        $wait = 60 - \Carbon\Carbon::parse($row->last_sent_at)->diffInSeconds(now(), true);
        if ($wait > 0) {
            return response()->json([
                "success" => false,
                "message" => "Please wait before requesting another code.",
                "retry_after" => (int) ceil($wait),
            ], 429);
        }

        if (!$this->issueEmailCode($email)) {
            return response()->json(["success" => false, "message" => "We could not send the code right now. Please try again."], 503);
        }

        return response()->json(["success" => true, "message" => "A new code was sent.", "cooldown" => 60]);
    }

    private function issueEmailCode(string $email): bool
    {
        $code = strval(random_int(100000, 999999));

        \Illuminate\Support\Facades\DB::table("email_verification_codes")->updateOrInsert(
            ["email" => $email],
            [
                "code_hash" => Hash::make($code),
                "attempts" => 0,
                "expires_at" => now()->addMinutes(10),
                "last_sent_at" => now(),
                "created_at" => now(),
                "updated_at" => now(),
            ]
        );

        try {
            \Illuminate\Support\Facades\Mail::send("emails.verify-code", ["code" => $code], function ($message) use ($email) {
                $message->to($email)->subject("AIDEA - Your Email Verification Code");
            });
            return true;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Verification code email failed to send: " . $e->getMessage());
            return false;
        }
    }

    public function login(Request $request)
    {
        $request->validate([
            "email" => "required|email",
            "password" => "required|string",
        ]);

        $user = User::where("email", $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password_hash)) {
            return response()->json([
                "success" => false,
                "message" => "Invalid credentials. Please check and try again.",
            ], 401);
        }

        if (\Illuminate\Support\Facades\Schema::hasTable("email_verification_codes")
            && \Illuminate\Support\Facades\DB::table("email_verification_codes")->where("email", strtolower($user->email))->exists()) {
            return response()->json([
                "success" => false,
                "message" => "Please confirm your email with the code we sent before signing in.",
                "email_unverified" => true,
            ], 403);
        }

// Verification check disabled -- all users can log in regardless of is_verified
        // if (!$user->is_verified) {
        //     return response()->json([
        //         "success" => false,
        //         "message" => "Your account is not yet verified. Please check your email.",
        //     ], 403);
        // }

        $user->tokens()->delete();
        $token = $user->createToken("aidea-session")->plainTextToken;

        return response()->json([
            "success" => true,
            "token" => $token,
            "user" => [
                "id" => $user->id,
                "fname" => $user->fname,
                "lname" => $user->lname,
                "mi" => $user->mi,
                "email" => $user->email,
                "is_verified" => $user->is_verified,
                "is_admin" => $user->is_admin,
                "role" => $user->role,
                "avatar_url" => $user->avatar_url,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(["success" => true, "message" => "Logged out."]);
    }

    public function me(Request $request)
    {
        $user = $request->user();
        return response()->json([
            "id" => $user->id,
            "fname" => $user->fname,
            "lname" => $user->lname,
            "mi" => $user->mi,
            "email" => $user->email,
            "is_verified" => $user->is_verified,
            "is_admin" => $user->is_admin,
            "role" => $user->role,
            "avatar_url" => $user->avatar_url,
        ]);
    }

    public function approveStudent(Request $request, $id)
    {
        $user = User::findOrFail($id);

        if ($user->is_verified) {
            return response()->json([
                "success" => false,
                "message" => "This account is already verified.",
            ], 409);
        }

        $user->update(["is_verified" => 1]);
        $user->notify(new AccountApprovedNotification());

        return response()->json([
            "success" => true,
            "message" => "Account approved and notified successfully.",
        ]);
    }
}