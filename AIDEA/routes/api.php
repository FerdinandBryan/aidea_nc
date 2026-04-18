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



/* ── Public routes (no token needed) ── */
Route::post('/login', [AuthController::class, 'login']);

/* ── Protected routes (requires valid Sanctum token) ── */
Route::middleware('auth:sanctum')->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // ── Dashboard ──
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);

    // ── Submissions ──
    Route::get('/submissions', [SubmissionController::class, 'index']);

    // ── Events ──
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
Route::post('/reset-password', [ForgotPasswordController::class, 'resetPassword']);

// ── Service Routes ──
Route::prefix('services')->controller(ServiceController::class)->group(function () {
    Route::get('/', 'index');
    Route::get('/{service}', 'show');
    Route::post('/', 'store');
    Route::put('/{service}', 'update');
    Route::patch('/{service}/toggle', 'toggle');
    Route::delete('/{service}', 'destroy');
});

// ── Payments ──
Route::get('payments', [PaymentController::class, 'index']);
Route::post('payments', [PaymentController::class, 'store']);
Route::get('payments/{payment}', [PaymentController::class, 'show']);
Route::patch('payments/{payment}/approve', [PaymentController::class, 'approve']);
Route::patch('payments/{payment}/reject', [PaymentController::class, 'reject']);

Route::get('/price-audit-logs', [PriceAuditLogController::class, 'index']);
Route::post('/price-audit-logs', [PriceAuditLogController::class, 'store']);

Route::middleware('auth:sanctum')->group(function () {
    // Student routes
    Route::post('/thesis/submit', [ThesisSubmissionController::class, 'store']);
    Route::get('/thesis/my-submissions', [ThesisSubmissionController::class, 'index']);

    // Admin routes
    Route::get('/thesis/list', [ThesisSubmissionController::class, 'adminList']); // ← different method
    Route::post('/thesis/{id}/review', [ThesisSubmissionController::class, 'review']);
    Route::get('/thesis/file/{id}', [ThesisSubmissionController::class, 'serveFile']);
});