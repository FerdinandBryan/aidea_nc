<?php

namespace App\Http\Controllers\Reviewer;

use App\Http\Controllers\Controller;
use App\Models\ThesisAssignment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class AssignmentController extends Controller
{
    // GET /api/reviewer/assignments?status=pending|completed
    public function index(Request $request)
    {
        $query = ThesisAssignment::with(['thesis'])
            ->where('reviewer_id', $request->user()->id)
            ->latest();

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        return response()->json(['data' => $query->get()]);
    }

    // POST /api/reviewer/assignments/{id}/complete
    public function complete(Request $request, $id)
    {
        $assignment = ThesisAssignment::where('reviewer_id', $request->user()->id)->find($id);

        if (!$assignment) {
            return response()->json(['message' => 'Assignment not found.'], 404);
        }

        $validator = Validator::make($request->all(), [
            'reviewed_file' => ['required_without_all:reviewed_files,comments_file', 'file', 'max:20480'],
            'reviewed_files' => ['required_without_all:reviewed_file,comments_file', 'array', 'max:5'],
            'comments_file' => ['nullable', 'file', 'max:20480'],
            'reviewed_files.*' => ['file', 'max:20480'],
            'note' => ['nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        $paths = [];
        if ($request->hasFile('reviewed_files')) {
            foreach ((array) $request->file('reviewed_files') as $f) {
                $paths[] = $f->store('assignments', 'public');
            }
        } elseif ($request->hasFile('reviewed_file')) {
            $paths[] = $request->file('reviewed_file')->store('assignments', 'public');
        }
        $path = $paths[0] ?? null;
        $commentsPath = $request->hasFile('comments_file') ? $request->file('comments_file')->store('assignments', 'public') : null;

        $assignment->update([
            'reviewed_file_path' => $path,
            'reviewed_files' => $paths,
            'comments_file_path' => $commentsPath,
            'reviewer_note' => $request->input('note'),
            'status' => 'completed',
        ]);

        return response()->json(['data' => $assignment]);
    }

    // GET /api/reviewer/assignments/{id}/file/{n} - streams the n-th original file (used by the split viewer)
    public function file(Request $request, $id, $n = 0)
    {
        $assignment = ThesisAssignment::where('reviewer_id', $request->user()->id)->find($id);

        if (!$assignment) {
            return response()->json(['message' => 'Assignment not found.'], 404);
        }

        $items = $assignment->files ?: [];
        if (!$items && $assignment->file_path) {
            $items = [['path' => $assignment->file_path]];
        }

        $item = $items[(int) $n] ?? null;
        $path = is_array($item) ? ($item['path'] ?? null) : null;

        if (!$path || !Storage::disk('public')->exists($path)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return Storage::disk('public')->response($path);
    }

    // POST /api/reviewer/assignments/{id}/resend
    public function resend(Request $request, $id)
    {
        $assignment = ThesisAssignment::where('reviewer_id', $request->user()->id)
            ->where('status', 'completed')
            ->find($id);

        if (!$assignment) {
            return response()->json(['message' => 'Assignment not found or not yet completed.'], 404);
        }

        $assignment->update([
            'status' => 'pending',
            'reviewed_file_path' => null,
            'reviewed_files' => null,
            'comments_file_path' => null,
            'reviewer_note' => null,
        ]);

        return response()->json(['data' => $assignment]);
    }
}