<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\Feedback;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FeedbackController extends Controller
{
    // GET /api/student/feedbacks
    public function index()
    {
        $feedbacks = Feedback::forUser(Auth::id())
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($f) => $this->format($f));

        return response()->json([
            'feedbacks'      => $feedbacks,
            'total_count'    => $feedbacks->count(),
            'average_rating' => $feedbacks->count()
                ? round($feedbacks->avg('rating'), 1)
                : 0,
        ]);
    }

    // POST /api/student/feedbacks
    public function store(Request $request)
    {
        $data = $request->validate([
            'feedback_type' => 'required|string|max:100',
            'reference'     => 'nullable|string|max:255',
            'rating'        => 'required|integer|min:1|max:5',
            'comment'       => 'required|string|max:2000',
            'recommend'     => 'nullable|in:yes,maybe,no',
        ]);

        $feedback = Feedback::create([...$data, 'user_id' => Auth::id()]);

        return response()->json([
            'message'  => 'Feedback submitted successfully.',
            'feedback' => $this->format($feedback),
        ], 201);
    }

    private function format(Feedback $f): array
    {
        return [
            'id'            => $f->id,
            'feedback_type' => $f->feedback_type,
            'reference'     => $f->reference,
            'rating'        => $f->rating,
            'star_string'   => $f->star_string,
            'comment'       => $f->comment,
            'recommend'     => $f->recommend,
            'date'          => $f->created_at->format('M d, Y'),
        ];
    }
}