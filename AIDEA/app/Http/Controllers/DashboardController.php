<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use App\Models\Submission;
use App\Models\Payment;
use App\Models\Feedback;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard/stats
     * A student's own stats — scoped to the logged-in user.
     */
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

    /**
     * GET /api/admin/stats
     * Admin-wide overview numbers for the dashboard cards.
     * Keys must match what dashboard.js reads:
     *   total_students, total_submissions, pending_payments,
     *   total_revenue, avg_feedback
     */
    public function adminStats(Request $request)
    {
        // "Students" = non-admin users with no reviewer role set.
        // (Reviewer accounts also have is_admin = false, so they'd get
        // counted as students here if we didn't exclude role.)
        $totalStudents = \App\Models\User::where('is_admin', 0)
            ->whereNull('role')
            ->count();

        $totalSubmissions = \App\Models\ThesisSubmission::count();

        // Status casing isn't consistent across the app ('Paid' vs 'pending'
        // vs 'Completed'), so match case-insensitively like the frontend does.
        $pendingPayments = \App\Models\Payment::whereRaw("LOWER(status) = 'pending'")
            ->count();

        $totalRevenue = \App\Models\Payment::whereRaw("LOWER(status) IN ('paid','completed')")
            ->sum('amount');

        $avgFeedback = \App\Models\Feedback::avg('rating');

        return response()->json([
            'total_students' => $totalStudents,
            'total_submissions' => $totalSubmissions,
            'pending_payments' => $pendingPayments,
            'total_revenue' => $totalRevenue ?? 0,
            'avg_feedback' => $avgFeedback ? round($avgFeedback, 1) : null,
        ]);
    }
}