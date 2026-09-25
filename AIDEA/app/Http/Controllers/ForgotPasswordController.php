<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class ForgotPasswordController extends Controller
{
    // ── SEND 6-DIGIT CODE ──
    public function sendResetLink(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users,email',
        ]);

        // Generate 6-digit code
        $code = strval(random_int(100000, 999999));

        // Save hashed code to password_reset_tokens table
        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $request->email],
            [
                'token' => Hash::make($code),
                'created_at' => Carbon::now(),
            ]
        );

        // Send email with the plain code
        Mail::send('emails.reset-password', ['code' => $code], function ($message) use ($request) {
            $message->to($request->email)
                ->subject('AIDEA - Your Password Reset Code');
        });

        return response()->json([
            'success' => true,
            'message' => 'A 6-digit reset code has been sent to your email.',
        ]);
    }

    // ── VERIFY CODE ──
    public function verifyCode(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users,email',
            'code' => 'required|string|size:6',
        ]);

        $record = DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->first();

        if (!$record || !Hash::check($request->code, $record->token)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid code. Please check and try again.',
            ], 400);
        }

        if (Carbon::parse($record->created_at)->addMinutes(30)->isPast()) {
            return response()->json([
                'success' => false,
                'message' => 'Code has expired. Please request a new one.',
            ], 400);
        }

        return response()->json([
            'success' => true,
            'message' => 'Code verified.',
        ]);
    }

    // ── RESET PASSWORD ──
    public function resetPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email|exists:users,email',
            'code' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $record = DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->first();

        if (!$record || !Hash::check($request->code, $record->token)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or expired code.',
            ], 400);
        }

        if (Carbon::parse($record->created_at)->addMinutes(30)->isPast()) {
            return response()->json([
                'success' => false,
                'message' => 'Code has expired. Please request a new one.',
            ], 400);
        }

        // Update password
        User::where('email', $request->email)->update([
            'password_hash' => Hash::make($request->password),
        ]);

        // Delete used token
        DB::table('password_reset_tokens')->where('email', $request->email)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Password reset successfully.',
        ]);
    }
}