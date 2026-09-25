<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

class PublicStatsController extends Controller
{
    public function index()
    {
        $totalThesis = DB::table('thesis_submissions')
            ->whereRaw('LOWER(status) = ?', ['approved'])
            ->count();

        $totalStudents = DB::table('users')
            ->where('is_admin', 0)
            ->count();

        $totalValidations = DB::table('thesis_submissions')->count();

        $avgRating = DB::table('feedbacks')->avg('rating');

        return response()->json([
            'total_thesis'      => $totalThesis,
            'total_students'    => $totalStudents,
            'total_validations' => $totalValidations,
            'avg_rating'        => $avgRating ? round($avgRating, 1) : 0,
        ]);
    }
}