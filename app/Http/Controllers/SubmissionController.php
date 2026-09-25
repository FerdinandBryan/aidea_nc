<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Submission;

class SubmissionController extends Controller
{
    public function index(Request $request)
    {
        $limit = $request->query('limit', 10);

        $submissions = Submission::where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get(['id', 'title', 'status', 'submitted_at']);

        return response()->json($submissions);
    }
}
