<?php

namespace App\Http\Controllers;

use App\Models\ThesisSubmission;
use Illuminate\Http\Request;

class LibrarianUploadController extends Controller
{
    /* LIBRARIAN: add a document straight into the public repository */
    public function store(Request $request)
    {
        $user = $request->user();
        $role = strtolower((string) ($user->role ?? ''));

        if (!$user || ($role !== 'librarian' && !$user->is_admin)) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $v = $request->validate([
            'title'         => 'required|string|max:500',
            'authors'       => 'required|string|max:500',
            'academic_year' => 'required|string|max:20',
            'course'        => 'nullable|string|max:255',
            'adviser_name'  => 'nullable|string|max:255',
            'abstract'      => 'nullable|string',
            'file'          => 'required|file|mimes:pdf|max:20480',
        ]);

        $file = $request->file('file');
        $path = $file->store('thesis_files', 'public');

        $doc = ThesisSubmission::create([
            'user_id'           => $user->id,
            'title'             => $v['title'],
            'authors'           => $v['authors'],
            'academic_year'     => $v['academic_year'],
            'course'            => $v['course'] ?? 'Library upload',
            'adviser_name'      => $v['adviser_name'] ?? 'N/A',
            'abstract'          => $v['abstract'] ?? '',
            'submission_type'   => 'final',
            'file_path'         => $path,
            'original_filename' => $file->getClientOriginalName(),
            'file_size'         => $file->getSize(),
            'file_type'         => $file->getClientMimeType(),
            'status'            => 'approved',
            'remarks'           => 'Added by librarian',
            'visible_in_repo'   => true,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Document added to the repository.',
            'data'    => ['id' => $doc->id, 'title' => $doc->title],
        ], 201);
    }
}