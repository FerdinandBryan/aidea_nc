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
            'thesis_id' => ['nullable', 'exists:thesis_submissions,id'],
            'title' => ['nullable', 'string', 'max:255'],
            'student_name' => ['nullable', 'string', 'max:255'],
            'payment_id' => ['nullable', 'string', 'max:64'],
            'reviewer_id' => ['required', 'exists:users,id'],
            'note' => ['nullable', 'string'],
            'file_label' => ['nullable', 'string', 'max:2000'],
            'file' => ['nullable', 'file', 'max:20480'],
            'files' => ['nullable', 'array', 'max:10'],
            'files.*' => ['file', 'max:20480'],
            'file_labels' => ['nullable', 'array'],
            'file_labels.*' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        $path = $request->hasFile('file') ? $request->file('file')->store('assignments', 'public') : null;

        $fileItems = [];
        $labels = (array) $request->input('file_labels', []);
        foreach ((array) $request->file('files', []) as $i => $f) {
            $fileItems[] = ['path' => $f->store('assignments', 'public'), 'label' => $labels[$i] ?? null];
        }
        if ($fileItems) {
            $path = $fileItems[0]['path'];
        }

        $assignment = ThesisAssignment::create([
            'thesis_submission_id' => $request->input('thesis_id'),
            'title' => $request->input('title'),
            'student_name' => $request->input('student_name'),
            'payment_id' => $request->input('payment_id'),
            'note' => $request->input('note'),
            'file_label' => $request->input('file_label'),
            'reviewer_id' => $request->input('reviewer_id'),
            'file_path' => $path,
            'files' => $fileItems ?: null,
            'status' => 'pending',
        ]);

        return response()->json(['data' => $assignment], 201);
    }

    // DELETE /api/admin/assignments/{id}  (cancel while still pending)
    public function destroy($id)
    {
        $assignment = ThesisAssignment::findOrFail($id);

        if ($assignment->status !== 'pending') {
            return response()->json(['message' => 'Only pending assignments can be cancelled.'], 422);
        }

        $paths = collect($assignment->files ?: [])->pluck('path')->push($assignment->file_path)->filter()->unique();
        foreach ($paths as $p) {
            Storage::disk('public')->delete($p);
        }

        $assignment->delete();

        return response()->json(['message' => 'Assignment cancelled.']);
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