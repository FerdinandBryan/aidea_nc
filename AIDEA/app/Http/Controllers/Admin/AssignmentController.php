<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ThesisAssignment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;

class AssignmentController extends Controller
{
    // GET /api/admin/assignments?status=pending|completed
    public function index(Request $request)
    {
        $query = ThesisAssignment::with(['thesis', 'reviewer'])->latest();

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        return response()->json(['data' => $query->get()]);
    }

    // POST /api/admin/assignments  (admin sends file to a reviewer)
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'thesis_id' => ['required', 'exists:thesis_submissions,id'],
            'reviewer_id' => ['required', 'exists:users,id'],
            'note' => ['nullable', 'string'],
            'file' => ['required', 'file', 'max:20480'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        $path = $request->file('file')->store('assignments', 'public');

        $assignment = ThesisAssignment::create([
            'thesis_submission_id' => $request->input('thesis_id'),
            'reviewer_id' => $request->input('reviewer_id'),
            'file_path' => $path,
            'status' => 'pending',
        ]);

        return response()->json(['data' => $assignment], 201);
    }

    // GET /api/admin/assignments/{id}/download?type=original|reviewed
    public function download(Request $request, $id)
    {
        $assignment = ThesisAssignment::findOrFail($id);
        $type = $request->query('type', 'original');
        $path = $type === 'reviewed' ? $assignment->reviewed_file_path : $assignment->file_path;

        if (!$path || !Storage::disk('public')->exists($path)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return Storage::disk('public')->response($path);
    }
}