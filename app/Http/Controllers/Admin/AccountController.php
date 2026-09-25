<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AccountController extends Controller
{
    /**
     * GET /api/admin/profile
     */
    public function profile(Request $request)
    {
        $user = $request->user()->makeHidden(['password_hash']);
        return response()->json(['data' => $user]);
    }

    /**
     * PUT /api/admin/profile
     */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'fname' => ['required', 'string', 'max:75'],
            'lname' => ['required', 'string', 'max:75'],
            'email' => ['required', 'email', 'max:150', 'unique:users,email,' . $user->id],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        $user->fill($validator->validated());
        $user->save();

        return response()->json([
            'data' => $user->makeHidden(['password_hash']),
            'message' => 'Profile updated.',
        ]);
    }

    /**
     * PUT /api/admin/change-password
     */
    public function changePassword(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'current_password' => ['required'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        if (!Hash::check($request->input('current_password'), $user->password_hash)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->password_hash = Hash::make($request->input('password'));
        $user->save();

        return response()->json(['message' => 'Password updated.']);
    }

    /**
     * GET /api/admin/reviewers
     */
    public function reviewers()
    {
        $reviewers = User::whereIn('role', ['statistician', 'grammarian'])
            ->orderByDesc('created_at')
            ->get()
            ->makeHidden(['password_hash']);

        return response()->json(['data' => $reviewers]);
    }

    /**
     * POST /api/admin/reviewers
     */
    public function storeReviewer(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'fname' => ['required', 'string', 'max:75'],
            'lname' => ['required', 'string', 'max:75'],
            'email' => ['required', 'email', 'max:150', 'unique:users,email'],
            'role' => ['required', 'in:statistician,grammarian'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        $reviewer = User::create([
            'fname' => $request->input('fname'),
            'lname' => $request->input('lname'),
            'email' => $request->input('email'),
            'role' => $request->input('role'),
            'password_hash' => Hash::make($request->input('password')),
            'is_admin' => false,
            'is_verified' => true,
        ]);

        return response()->json([
            'data' => $reviewer->makeHidden(['password_hash']),
            'message' => 'Account created.',
        ], 201);
    }

    /**
     * DELETE /api/admin/reviewers/{id}
     */
    public function destroyReviewer($id)
    {
        $reviewer = User::whereIn('role', ['statistician', 'grammarian'])->find($id);

        if (!$reviewer) {
            return response()->json(['message' => 'Reviewer account not found.'], 404);
        }

        $reviewer->delete();

        return response()->json(['message' => 'Account removed.']);
    }
}