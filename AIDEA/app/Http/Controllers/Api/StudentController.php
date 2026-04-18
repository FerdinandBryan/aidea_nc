<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class StudentController extends Controller
{
    /**
     * GET /api/students
     * Return all users with role = 'student'
     */
    public function index()
    {
        $students = User::where('role', 'student')
            ->orderBy('created_at', 'desc')
            ->get([
                'id', 'full_name', 'student_number',
                'email', 'course', 'year_level',
                'section', 'is_verified', 'created_at'
            ]);

        return response()->json($students);
    }

    /**
     * POST /api/students
     * Create a new student record
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'full_name'      => 'required|string|max:255',
            'student_number' => 'required|string|unique:users,student_number',
            'email'          => 'required|email|unique:users,email',
            'course'         => 'required|string|max:100',
            'year_level'     => 'nullable|integer|min:1|max:4',
            'section'        => 'nullable|string|max:50',
            'is_verified'    => 'nullable|boolean',
        ]);

        $student = User::create([
            'full_name'      => $validated['full_name'],
            'student_number' => $validated['student_number'],
            'email'          => $validated['email'],
            'course'         => $validated['course'],
            'year_level'     => $validated['year_level'] ?? null,
            'section'        => $validated['section'] ?? null,
            'is_verified'    => $validated['is_verified'] ?? false,
            'role'           => 'student',
            // Default password = student number; student must reset via email
            'password'       => Hash::make($validated['student_number']),
        ]);

        return response()->json($student, 201);
    }

    /**
     * PUT /api/students/{id}
     * Update an existing student
     */
    public function update(Request $request, $id)
    {
        $student = User::where('role', 'student')->findOrFail($id);

        $validated = $request->validate([
            'full_name'      => 'required|string|max:255',
            'student_number' => ['required', 'string', Rule::unique('users', 'student_number')->ignore($student->id)],
            'email'          => ['required', 'email', Rule::unique('users', 'email')->ignore($student->id)],
            'course'         => 'required|string|max:100',
            'year_level'     => 'nullable|integer|min:1|max:4',
            'section'        => 'nullable|string|max:50',
            'is_verified'    => 'nullable|boolean',
        ]);

        $student->update($validated);

        return response()->json($student);
    }

    /**
     * DELETE /api/students/{id}
     */
    public function destroy($id)
    {
        $student = User::where('role', 'student')->findOrFail($id);
        $student->delete();

        return response()->json(['message' => 'Student deleted successfully.']);
    }
}