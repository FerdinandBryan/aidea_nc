<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class StudentController extends Controller
{
    public function index()
    {
        $students = User::where('is_admin', 0)
            ->orderBy('created_at', 'desc')
            ->get(['id', 'fname', 'lname', 'mi', 'email', 'is_verified', 'created_at']);

        return response()->json($students);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'fname'    => 'required|string|max:75',
            'lname'    => 'required|string|max:75',
            'mi'       => 'nullable|string|max:5',
            'email'    => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $student = new User();
        $student->forceFill([
            'fname'             => $validated['fname'],
            'lname'             => $validated['lname'],
            'mi'                => $validated['mi'] ?? null,
            'email'             => strtolower($validated['email']),
            'password_hash'     => Hash::make($validated['password']),
            'is_verified'       => 1,
            'email_verified_at' => now(),
            'is_admin'          => 0,
        ])->save();

        return response()->json($student, 201);
    }

    public function update(Request $request, $id)
    {
        $student = User::where('is_admin', 0)->findOrFail($id);

        $validated = $request->validate([
            'fname' => 'required|string|max:75',
            'lname' => 'required|string|max:75',
            'mi' => 'nullable|string|max:5',
            'email' => ['required', 'email', Rule::unique('users', 'email')->ignore($student->id)],
            'is_verified' => 'nullable|boolean',
        ]);

        $justApproved = !$student->is_verified && !empty($validated['is_verified']);

        $student->update($validated);

        if ($justApproved) {
            $student->notify(new \App\Notifications\AccountApprovedNotification());
        }

        return response()->json($student);
    }

    public function destroy($id)
    {
        $student = User::where('is_admin', 0)->findOrFail($id);
        $student->delete();

        return response()->json(['message' => 'Student deleted successfully.']);
    }
}
