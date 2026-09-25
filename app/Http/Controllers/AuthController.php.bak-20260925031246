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
            "email" => "required|email|unique:users,email",
            "password" => "required|string|min:8|confirmed",
        ]);

        $user = User::create([
            "fname" => $validated["fname"],
            "lname" => $validated["lname"],
            "mi" => $validated["mi"] ?? null,
            "email" => $validated["email"],
            "password_hash" => Hash::make($validated["password"]),
            "is_verified" => 0,
        ]);

        $verificationUrl = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            "verification.verify",
            now()->addMinutes(60),
            ["id" => $user->getKey(), "hash" => sha1($user->email)]
        );
        $user->notify(new \App\Notifications\VerifyEmailNotification($verificationUrl));

        return response()->json([
            "success" => true,
            "message" => "Account created! Please check your email to verify your account.",
            "user" => $user,
        ], 201);
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