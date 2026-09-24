<?php

namespace App\Http\Controllers;

use App\Models\ThesisSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ThesisSubmissionController extends Controller
{
    /* â”€â”€ STUDENT: submit a thesis â”€â”€ */
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
            'file_size' => $file->getSize(),        // â† add this
            'file_type' => $file->getMimeType(),    // â† add this
            'status' => 'pending',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Thesis submitted successfully!',
            'data' => $submission,
        ], 201);
    }

    /* â”€â”€ ADMIN: view ALL submissions â”€â”€ */
    /* â”€â”€ ADMIN: view ALL submissions â”€â”€ */
    public function adminList()
    {
        $theses = ThesisSubmission::with('user')->latest()->get();

        return response()->json([
            'data' => $theses->map(function ($t) {
                return [
                    'id' => $t->id,
                    'user_id' => $t->user_id,
                    'student_name' => $t->authors,
                    'user' => $t->user ? [
                        'id' => $t->user->id,
                        'name' => (trim((string) $t->user->full_name) !== '' ? $t->user->full_name : (trim(($t->user->fname ?? '') . ' ' . ($t->user->lname ?? '')) ?: ($t->user->name ?? $t->user->email ?? null))),
                    ] : null,
                    'title' => $t->title,
                    'course' => $t->course,
                    'academic_year' => $t->academic_year,
                    'abstract' => $t->abstract,
                    'adviser_name' => $t->adviser_name,
                    'submission_type' => $t->submission_type,
                    'authors' => $t->authors,
                    'status' => $t->status,
                    'visible_in_repo' => (bool) $t->visible_in_repo,
                    'remarks' => $t->remarks,
                    'created_at' => $t->created_at,
                    'file_path' => $t->file_path,
                    'original_filename' => $t->original_filename,
                    'file_size' => $t->file_size,
                    'file_type' => $t->file_type,
                    'file_url' => $t->file_path
                        ? asset('storage/' . $t->file_path)
                        : null,
                ];
            })
        ]);
    }

    /* â”€â”€ PUBLIC: approved theses for landing page â”€â”€ */
    public function publicApproved()
    {
        $theses = ThesisSubmission::with('user')
            ->where('status', 'approved')
            ->where('visible_in_repo', true)
            ->latest()
            ->get();

        return response()->json([
            'data' => $theses->map(function ($t) {
                return [
                    'title' => $t->title,
                    'author' => $t->user->full_name ?? $t->authors ?? 'N/A',
                    'course' => $t->course,
                    'academic_year' => $t->academic_year,
                    'abstract' => $t->abstract,
                    'status' => $t->status,
                ];
            })
        ]);
    }

    /* -- ADMIN: toggle repository visibility (independent of approval status) -- */
    public function toggleRepoVisibility($id)
    {
        $thesis = ThesisSubmission::findOrFail($id);
        $thesis->update(['visible_in_repo' => !$thesis->visible_in_repo]);

        return response()->json([
            'message' => 'Repository visibility updated.',
            'data' => $thesis->fresh(),
        ]);
    }

    /* â”€â”€ STUDENT: view own submissions â”€â”€ */
    public function index()
    {
        $theses = ThesisSubmission::with('user')
            ->where('user_id', auth()->id())
            ->latest()
            ->get();

        return response()->json(['data' => $theses]);
    }

    /* â”€â”€ ADMIN: approve / reject â”€â”€ */
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

    /* â”€â”€ SERVE FILE (view/download) â”€â”€ */
    public function serveFile($id)
    {
        $thesis = \App\Models\ThesisSubmission::findOrFail($id);

        $path = storage_path('app/public/' . $thesis->file_path);

        if (!file_exists($path)) {
            return response()->json(['error' => 'File not found'], 404);
        }

        return response()->file($path, [
            'Access-Control-Allow-Origin' => '*',
            'Access-Control-Allow-Methods' => 'GET, OPTIONS',
            'Access-Control-Allow-Headers' => 'Authorization, Content-Type',
            'Content-Type' => mime_content_type($path),
        ]);
    }


}
