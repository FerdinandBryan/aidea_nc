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
            'title'           => 'required|string|max:500',
            'course'          => 'required|in:BSCS,BEED,BSED,BSHM',
            'academic_year'   => 'required|in:2026-2027,2027-2028,2028-2029,2029-2030',
            'adviser_name'    => 'required|string|max:255',
            'submission_type' => 'required|in:thesis,research',
            'authors'         => 'nullable|string|max:500',
            'abstract'        => 'required|string',
            'file'            => 'required|file|mimes:pdf,docx|max:20480',
            'imrad_file'      => 'required_if:submission_type,research|nullable|file|mimes:pdf,docx|max:20480',
        ]);

        $abstractText = trim($v['abstract']);
        $wordCount = count(preg_split('/\s+/u', $abstractText, -1, PREG_SPLIT_NO_EMPTY));
        if ($wordCount < 150 || $wordCount > 200) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'abstract' => ["Abstract must be 150 to 200 words (you entered {$wordCount})."],
            ]);
        }

        $file = $request->file('file');
        $path = $file->store('thesis_files', 'public');
        $imradPath = $request->hasFile('imrad_file')
            ? $request->file('imrad_file')->store('thesis_files', 'public')
            : null;

        $doc = ThesisSubmission::create([
            'user_id'           => $user->id,
            'title'             => $v['title'],
            'course'            => $v['course'],
            'academic_year'     => $v['academic_year'],
            'adviser_name'      => $v['adviser_name'],
            'submission_type'   => $v['submission_type'],
            'authors'           => $v['authors'] ?? null,
            'abstract'          => $abstractText,
            'imrad_file_path'   => $imradPath,
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