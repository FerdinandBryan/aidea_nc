<?php

namespace App\Http\Controllers;

use App\Models\ThesisSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ThesisSubmissionController extends Controller
{
    /* ── STUDENT: submit a thesis ── */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:500',
            'course' => 'required|string',
            'academic_year' => 'required|string|max:20',
            'abstract' => 'required|string|min:50',
            'adviser_name' => 'required|string|max:255',
            'submission_type' => 'required|in:initial,revision,final',
            'authors' => 'nullable|string|max:500',
            'file' => 'required|file|mimes:pdf,docx|max:20480',
        ]);

        $file = $request->file('file');
        $path = $file->store('thesis_files', 'public');

        $submission = ThesisSubmission::create([
            'user_id' => auth()->id(),
            'title' => $validated['title'],
            'course' => $validated['course'],
            'academic_year' => $validated['academic_year'],
            'abstract' => $validated['abstract'],
            'adviser_name' => $validated['adviser_name'],
            'submission_type' => $validated['submission_type'],
            'authors' => $validated['authors'] ?? null,
            'file_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),        // ← add this
            'file_type' => $file->getMimeType(),    // ← add this
            'status' => 'pending',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Thesis submitted successfully!',
            'data' => $submission,
        ], 201);
    }

    /* ── ADMIN: view ALL submissions ── */
    public function adminList()
    {
        $theses = ThesisSubmission::with('user')->latest()->get();

        return response()->json([
            'data' => $theses->map(function ($t) {
                return [
                    'id' => $t->id,
                    'user_id' => $t->user_id,
                    'user' => $t->user,
                    'title' => $t->title,
                    'course' => $t->course,
                    'academic_year' => $t->academic_year,
                    'abstract' => $t->abstract,
                    'adviser_name' => $t->adviser_name,
                    'submission_type' => $t->submission_type,
                    'authors' => $t->authors,
                    'status' => $t->status,
                    'remarks' => $t->remarks,
                    'created_at' => $t->created_at,
                    'file_path' => $t->file_path,
                    'original_filename' => $t->original_filename,
                    'file_size' => $t->file_size,
                    'file_type' => $t->file_type,
                    // ✅ Direct public URL — no auth needed
                    'file_url' => $t->file_path
                        ? asset('storage/' . $t->file_path)
                        : null,
                ];
            })
        ]);
    }

    /* ── STUDENT: view own submissions ── */
    public function index()
    {
        $theses = ThesisSubmission::with('user')
            ->where('user_id', auth()->id())
            ->latest()
            ->get();

        return response()->json(['data' => $theses]);
    }

    /* ── ADMIN: approve / reject ── */
    public function review(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:Approved,Pending,Rejected',
            'remarks' => 'nullable|string|max:1000',
        ]);

        $thesis = ThesisSubmission::findOrFail($id);

        $thesis->update([
            'status' => strtolower($request->status), // stored lowercase in DB
            'remarks' => $request->remarks,
        ]);

        return response()->json([
            'message' => 'Review submitted.',
            'data' => $thesis->fresh('user'),
        ]);
    }

    /* ── SERVE FILE (view/download) ── */
    public function serveFile($id)
    {
        $thesis = ThesisSubmission::findOrFail($id);

        if (!$thesis->file_path || !Storage::disk('public')->exists($thesis->file_path)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return Storage::disk('public')->download(
            $thesis->file_path,
            $thesis->original_filename ?? basename($thesis->file_path)
        );
    }
}