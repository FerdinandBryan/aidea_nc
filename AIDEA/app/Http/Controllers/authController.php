<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use App\Models\User;

class AuthController extends Controller
{
    // ── REGISTER ──
    public function register(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:75',
            'last_name' => 'required|string|max:75',
            'email' => 'required|email|unique:users,email',
            'student_number' => 'required|string|unique:users,student_number|regex:/^\d{4}-\d{4}$/',
            'course' => 'required|string',
            'year_level' => 'required|integer|between:1,4',
            'section' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
            'contact_num' => 'nullable|digits:11',
            'address' => 'nullable|string',
            'adviser' => 'nullable|string',
        ]);

        $user = User::create([
            'student_number' => $validated['student_number'],
            'full_name' => $validated['first_name'] . ' ' . $validated['last_name'],
            'email' => $validated['email'],
            'password_hash' => Hash::make($validated['password']),
            'course' => $validated['course'],
            'year_level' => $validated['year_level'],
            'section' => $validated['section'],
            'role' => 'student',
            'is_verified' => 0,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Account created. Please wait for admin verification before logging in.',
            'user' => $user,
        ], 201);
    }

    // ── LOGIN ──
    public function login(Request $request)
    {
        $request->validate([
            'role' => 'required|in:student,admin',
            'password' => 'required|string',
        ]);

        $role = $request->role;

        /* ── Find user by role ── */
        if ($role === 'student') {
            $request->validate([
                'student_number' => 'required|string',
            ]);
            $user = User::where('student_number', $request->student_number)
                ->where('role', 'student')
                ->first();
        } else {
            $request->validate([
                'email' => 'required|email',
            ]);
            $user = User::where('email', $request->email)
                ->where('role', 'admin')
                ->first();
        }

        /* ── Validate credentials ── */
        if (!$user || !Hash::check($request->password, $user->password_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid credentials. Please check and try again.',
            ], 401);
        }

        /* ── Check email verified (students only) ── */
        if ($role === 'student' && !$user->is_verified) {
            return response()->json([
                'success' => false,
                'message' => 'Your account is not yet verified. Please check your email.',
            ], 403);
        }

        /* ── Revoke old tokens, issue new Sanctum token ── */
        $user->tokens()->delete();
        $token = $user->createToken('aidea-session')->plainTextToken;

        return response()->json([
            'success' => true,
            'token' => $token,
            'role' => $user->role,
            'user' => [
                'id' => $user->id,
                'full_name' => $user->full_name,
                'email' => $user->email,
                'student_number' => $user->student_number,
                'role' => $user->role,
                'course' => $user->course,
                'year_level' => $user->year_level,
                'section' => $user->section,
                'is_verified' => $user->is_verified,
            ],
        ]);
    }

    // ── LOGOUT ──
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['success' => true, 'message' => 'Logged out.']);
    }

    /* ─────────────────────────────────────────────
       GET /api/me   (requires auth:sanctum)
       Returns the currently authenticated user.
    ───────────────────────────────────────────── */
    public function me(Request $request)
    {
        $user = $request->user();
        return response()->json([
            'id' => $user->id,
            'full_name' => $user->full_name,
            'email' => $user->email,
            'student_number' => $user->student_number,
            'role' => $user->role,
            'course' => $user->course,
            'year_level' => $user->year_level,
            'section' => $user->section,
            'is_verified' => $user->is_verified,
        ]);
    }
}