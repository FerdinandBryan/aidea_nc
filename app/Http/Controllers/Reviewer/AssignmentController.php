<?php

namespace App\Http\Controllers\Reviewer;

use App\Http\Controllers\Controller;
use App\Models\ThesisAssignment;
use Illuminate\Http\Request;
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
            'reviewed_file' => ['required', 'file', 'max:20480'],
            'note' => ['nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => $validator->errors()->first()], 422);
        }

        $path = $request->file('reviewed_file')->store('assignments', 'public');

        $assignment->update([
            'reviewed_file_path' => $path,
            'reviewer_note' => $request->input('note'),
            'status' => 'completed',
        ]);

        return response()->json(['data' => $assignment]);
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
            'reviewer_note' => null,
        ]);

        return response()->json(['data' => $assignment]);
    }
}