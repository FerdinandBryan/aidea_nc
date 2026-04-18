<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use App\Models\Submission;
use App\Models\Payment;
use App\Models\Feedback;

class DashboardController extends Controller
{
    public function stats(Request $request)
    {
        $user = $request->user();

        $submissions = Submission::where('user_id', $user->id)->count();

        $approved = Submission::where('user_id', $user->id)
            ->where('status', 'approved')
            ->count();

        $totalPaid = Payment::where('student_id', (string) $user->id)
            ->where('status', 'Paid')
            ->sum('amount');

        $avgRating = Feedback::where('user_id', $user->id)->avg('rating');

        return response()->json([
            'submissions' => $submissions,
            'approved' => $approved,
            'total_paid' => $totalPaid ?? 0,
            'avg_rating' => $avgRating ? round($avgRating, 1) : null,
        ]);
    }
}