<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ForgotPasswordController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\ServiceController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\SubmissionController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\PriceAuditLogController;
use App\Http\Controllers\ThesisSubmissionController;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use App\Http\Controllers\Admin\FeedbackController as AdminFeedbackController;
use App\Http\Controllers\Admin\AccountController as AdminAccountController;
use App\Http\Controllers\Student\FeedbackController as StudentFeedbackController;




/* -- Public routes (no token needed) -- */
Route::post('/login', [AuthController::class, 'login']);

/* -- Protected routes (requires valid Sanctum token) -- */
Route::middleware('auth:sanctum')->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // -- Dashboard --
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);

    // -- Submissions --
    Route::get('/submissions', [SubmissionController::class, 'index']);

    // -- Events --
    Route::get('/events/upcoming', [EventController::class, 'upcoming']);
});

Route::prefix('students')->group(function () {
    Route::get('/', [StudentController::class, 'index']);
    Route::post('/', [StudentController::class, 'store']);
    Route::put('/{id}', [StudentController::class, 'update']);
    Route::delete('/{id}', [StudentController::class, 'destroy']);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

// Password reset routes
Route::post('/forgot-password', [ForgotPasswordController::class, 'sendResetLink']);
Route::post('/verify-reset-code', [ForgotPasswordController::class, 'verifyCode']);
Route::post('/reset-password', [ForgotPasswordController::class, 'resetPassword']);

// -- Service Routes --
Route::prefix('services')->controller(ServiceController::class)->group(function () {
    Route::get('/', 'index');
    Route::get('/{service}', 'show');
    Route::post('/', 'store');
    Route::put('/{service}', 'update');
    Route::patch('/{service}/toggle', 'toggle');
    Route::delete('/{service}', 'destroy');
});

// -- Payments --
Route::get('payments', [PaymentController::class, 'index'])->middleware('auth:sanctum');
Route::post('payments', [PaymentController::class, 'store'])->middleware('auth:sanctum');
Route::get('payments/{payment}', [PaymentController::class, 'show'])->middleware('auth:sanctum');
Route::patch('payments/{payment}/approve', [PaymentController::class, 'approve'])->middleware('auth:sanctum');
Route::patch('payments/{payment}/reject', [PaymentController::class, 'reject'])->middleware('auth:sanctum');

Route::get('/price-audit-logs', [PriceAuditLogController::class, 'index']);
Route::post('/price-audit-logs', [PriceAuditLogController::class, 'store']);

Route::middleware('auth:sanctum')->group(function () {
    // Student routes
    Route::post('/thesis/submit', [ThesisSubmissionController::class, 'store']);
    Route::get('/thesis/my-submissions', [ThesisSubmissionController::class, 'index']);

    // Admin routes
    Route::get('/thesis/list', [ThesisSubmissionController::class, 'adminList']); // different method
    Route::post('/thesis/{id}/review', [ThesisSubmissionController::class, 'review']);
    Route::get('/thesis/file/{id}', [ThesisSubmissionController::class, 'serveFile']);
    Route::patch('/thesis/{id}/toggle-repo', [ThesisSubmissionController::class, 'toggleRepoVisibility']);
});

// -- Email Verification --
Route::get('/email/verify/{id}/{hash}', function (EmailVerificationRequest $request) {
    $request->fulfill();
    // Redirect to your frontend login page after verified
    return redirect('http://127.0.0.1:5500/login/login.html?verified=1');
})->middleware(['auth:sanctum', 'signed'])->name('verification.verify');

Route::post('/email/resend-verification', function (Request $request) {
    $request->user()->sendEmailVerificationNotification();
    return response()->json(['success' => true, 'message' => 'Verification email resent.']);
})->middleware(['auth:sanctum', 'throttle:6,1']);

Route::post('/email/resend/{id}', function ($id) {
    $user = App\Models\User::findOrFail($id);
    $user->sendEmailVerificationNotification();
    return response()->json(['success' => true, 'message' => 'Verification email resent.']);
});
Route::post('admin/approve-student/{id}', [App\Http\Controllers\AuthController::class, 'approveStudent'])->middleware('auth:sanctum');


// -- AIDEA Feedback routes (auto-added by Setup-AIDeaFeedback.ps1) --
// Student routes
Route::middleware('auth:sanctum')->prefix('student')->group(function () {
    Route::get('feedbacks', [StudentFeedbackController::class, 'index']);
    Route::post('feedbacks', [StudentFeedbackController::class, 'store']);
});

// Admin routes
Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
    Route::get('feedbacks/stats', [AdminFeedbackController::class, 'stats']);
    Route::get('feedbacks', [AdminFeedbackController::class, 'index']);
    Route::patch('feedbacks/{feedback}/read', [AdminFeedbackController::class, 'markRead']);
    Route::delete('feedbacks/{feedback}', [AdminFeedbackController::class, 'destroy']);

    // Dashboard stats ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â matches the /api/admin/stats URL dashboard.js calls
    // Uses adminStats() (aggregated across all students), NOT stats()
    // (which is scoped to the logged-in user and would show zeros for an admin)
    Route::get('stats', [DashboardController::class, 'adminStats']);

    // Thesis assignments (admin -> reviewer file transfer)
    Route::get('assignments', [App\Http\Controllers\Admin\AssignmentController::class, 'index']);
    Route::post('assignments', [App\Http\Controllers\Admin\AssignmentController::class, 'store']);
    Route::get('assignments/{id}/download', [App\Http\Controllers\Admin\AssignmentController::class, 'download']);

    // AIDEA_ADMIN_ACCOUNT_ROUTES
    // Manage Account (admin's own profile + password)
    Route::get('profile', [AdminAccountController::class, 'profile']);
    Route::put('profile', [AdminAccountController::class, 'updateProfile']);
    Route::put('change-password', [AdminAccountController::class, 'changePassword']);

    // Reviewer accounts (statistician / grammarian)
    Route::get('reviewers', [AdminAccountController::class, 'reviewers']);
    Route::post('reviewers', [AdminAccountController::class, 'storeReviewer']);
    Route::delete('reviewers/{id}', [AdminAccountController::class, 'destroyReviewer']);
});



Route::middleware('auth:sanctum')->get('/reports', [\App\Http\Controllers\ReportController::class, 'generate']);
Route::get('/public/stats', [\App\Http\Controllers\PublicStatsController::class, 'index']);

Route::get('/public/thesis', [\App\Http\Controllers\ThesisSubmissionController::class, 'publicApproved']);

// --- Send files / certificate + user notifications (added by apply-send-files.ps1) ---
// If you have an admin-only middleware group, move the send-files line into it.
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/payments/{payment}/send-files', [\App\Http\Controllers\PaymentController::class, 'sendFiles']);

    Route::get('/notifications', [\App\Http\Controllers\NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [\App\Http\Controllers\NotificationController::class, 'readAll']);
    Route::post('/notifications/{id}/read', [\App\Http\Controllers\NotificationController::class, 'markRead']);
});

Route::middleware('auth:sanctum')->get('/certificates', [\App\Http\Controllers\CertificateController::class, 'index']);


// Reviewer routes (statistician / grammarian)
Route::middleware(['auth:sanctum', 'reviewer'])->prefix('reviewer')->group(function () {
    Route::get('assignments', [App\Http\Controllers\Reviewer\AssignmentController::class, 'index']);
    Route::post('assignments/{id}/complete', [App\Http\Controllers\Reviewer\AssignmentController::class, 'complete']);
    Route::post('assignments/{id}/resend', [App\Http\Controllers\Reviewer\AssignmentController::class, 'resend']);
});

// My Profile routes
require __DIR__ . '/profile.php';

// Forces a real download for files in storage/assignments (File Transfer > Download)
\Illuminate\Support\Facades\Route::get('/download/assignments/{file}', function (\Illuminate\Http\Request $request, string $file) {
    $file = basename($file);
    $path = 'assignments/' . $file;
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    abort_unless($disk->exists($path), 404);
    $name = preg_replace('/[^\w\s.\-()]/u', '', (string) $request->query('name', $file));
    if ($name === '' || $name === null) { $name = $file; }
    return response()->download($disk->path($path), $name);
})->where('file', '[A-Za-z0-9._\-]+');

// Forces a real download for payment files and certificates (student Requests & Certificate)
\Illuminate\Support\Facades\Route::get('/download/payment-files/{path}', function (\Illuminate\Http\Request $request, string $path) {
    abort_if(str_contains($path, '..'), 404);
    $rel = 'payment-files/' . ltrim($path, '/');
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    abort_unless($disk->exists($rel), 404);
    $name = preg_replace('/[^\w\s.\-()]/u', '', (string) $request->query('name', basename($rel)));
    if ($name === '' || $name === null) { $name = basename($rel); }
    return response()->download($disk->path($rel), $name);
})->where('path', '.+');

// Format templates shared between admin and students (stored as one JSON list)
\Illuminate\Support\Facades\Route::get('/format-templates', function () {
    $row = \Illuminate\Support\Facades\DB::table('format_templates')->orderBy('id')->first();
    return response()->json($row ? json_decode($row->data, true) : []);
});
\Illuminate\Support\Facades\Route::put('/format-templates', function (\Illuminate\Http\Request $request) {
    $list = $request->input('templates', []);
    abort_unless(is_array($list), 422);
    $json = json_encode(array_values($list));
    $row = \Illuminate\Support\Facades\DB::table('format_templates')->orderBy('id')->first();
    if ($row) {
        \Illuminate\Support\Facades\DB::table('format_templates')->where('id', $row->id)->update(['data' => $json, 'updated_at' => now()]);
    } else {
        \Illuminate\Support\Facades\DB::table('format_templates')->insert(['data' => $json, 'created_at' => now(), 'updated_at' => now()]);
    }
    return response()->json(['ok' => true]);
})->middleware(['auth:sanctum', 'admin']);

// Certificate templates (admin): reference images shown in Generate certificate
\Illuminate\Support\Facades\Route::middleware(['auth:sanctum', 'admin'])->prefix('certificate-templates')->group(function () {
    \Illuminate\Support\Facades\Route::get('/', function () {
        return response()->json(\Illuminate\Support\Facades\DB::table('certificate_templates')->orderByDesc('id')->get(['id', 'name', 'created_at']));
    });
    \Illuminate\Support\Facades\Route::post('/', function (\Illuminate\Http\Request $request) {
        $data = $request->validate([
            'name'  => 'required|string|max:120',
            'image' => 'required|file|mimes:png,jpg,jpeg,webp|max:10240',
        ]);
        $file = $request->file('image');
        $mime = $file->getMimeType();
        $ext  = strtolower($file->getClientOriginalExtension() ?: 'png');
        $path = $file->storeAs('certificate-templates', uniqid('tpl_') . '.' . $ext, 'public');
        $id = \Illuminate\Support\Facades\DB::table('certificate_templates')->insertGetId([
            'name' => $data['name'], 'path' => $path, 'mime' => $mime, 'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json(['ok' => true, 'id' => $id], 201);
    });
    \Illuminate\Support\Facades\Route::get('/{id}/image', function ($id) {
        $row = \Illuminate\Support\Facades\DB::table('certificate_templates')->where('id', $id)->first();
        abort_unless($row, 404);
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        abort_unless($disk->exists($row->path), 404);
        return response()->json(['image' => 'data:' . ($row->mime ?: 'image/png') . ';base64,' . base64_encode($disk->get($row->path))]);
    })->whereNumber('id');
    \Illuminate\Support\Facades\Route::delete('/{id}', function ($id) {
        $row = \Illuminate\Support\Facades\DB::table('certificate_templates')->where('id', $id)->first();
        abort_unless($row, 404);
        \Illuminate\Support\Facades\Storage::disk('public')->delete($row->path);
        \Illuminate\Support\Facades\DB::table('certificate_templates')->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    })->whereNumber('id');
});


// -- Pricing sheet (Excel upload shown to students) --
Route::get('/pricing-sheet', [\App\Http\Controllers\PricingSheetController::class, 'show'])->middleware('auth:sanctum');
Route::post('/pricing-sheet', [\App\Http\Controllers\PricingSheetController::class, 'store'])->middleware(['auth:sanctum', 'admin']);
Route::delete('/pricing-sheet', [\App\Http\Controllers\PricingSheetController::class, 'destroy'])->middleware(['auth:sanctum', 'admin']);