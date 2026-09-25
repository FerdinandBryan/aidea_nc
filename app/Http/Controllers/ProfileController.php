<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    /** Same shape as login()/me(), plus avatar_url. Explicit fields = password_hash can never leak. */
    private function payload(User $u): array
    {
        return [
            'id'          => $u->id,
            'fname'       => $u->fname,
            'lname'       => $u->lname,
            'mi'          => $u->mi,
            'email'       => $u->email,
            'is_verified' => $u->is_verified,
            'is_admin'    => $u->is_admin,
            'role'        => $u->role,
            'avatar_url'  => $u->avatar_url,
        ];
    }

    private function ok(User $u): JsonResponse
    {
        return response()->json(['success' => true, 'user' => $this->payload($u->fresh())]);
    }

    /** GET /api/profile */
    public function show(Request $request): JsonResponse
    {
        return $this->ok($request->user());
    }

    /** PUT /api/profile - fname, lname, email (mi is left untouched) */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'fname' => ['required', 'string', 'max:75'],
            'lname' => ['required', 'string', 'max:75'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
        ]);

        $user->forceFill($data)->save();

        return $this->ok($user);
    }

    /** PUT /api/profile/password - current_password, password, password_confirmation */
    public function updatePassword(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'string', 'min:8', 'confirmed'], // same rule as register
        ]);

        if (! Hash::check($request->current_password, $user->password_hash)) {
            // 422 (not 401) so the frontend shows the message instead of logging the student out
            return response()->json([
                'success' => false,
                'message' => 'Current password is incorrect.',
                'errors'  => ['current_password' => ['Current password is incorrect.']],
            ], 422);
        }

        $user->forceFill(['password_hash' => Hash::make($request->password)])->save();

        // Sign out any other device/session; keep the current one
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        return response()->json(['success' => true, 'message' => 'Password updated.']);
    }

    /** POST /api/profile/avatar - multipart field "avatar" */
    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'], // KB
        ]);

        $user = $request->user();
        $path = $request->file('avatar')->store('avatars', User::avatarDisk());

        if ($user->avatar_path) {
            Storage::disk(User::avatarDisk())->delete($user->avatar_path); // remove the old photo
        }

        $user->forceFill(['avatar_path' => $path])->save();

        return $this->ok($user);
    }

    /** DELETE /api/profile/avatar */
    public function deleteAvatar(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->avatar_path) {
            Storage::disk(User::avatarDisk())->delete($user->avatar_path);
            $user->forceFill(['avatar_path' => null])->save();
        }

        return $this->ok($user);
    }
}