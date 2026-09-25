<?php

use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

// Loaded from routes/api.php, so these are served under /api/profile
Route::middleware('auth:sanctum')->prefix('profile')->group(function () {
    Route::get('/',          [ProfileController::class, 'show']);
    Route::put('/',          [ProfileController::class, 'update']);
    Route::put('/password',  [ProfileController::class, 'updatePassword']);
    Route::post('/avatar',   [ProfileController::class, 'uploadAvatar']);
    Route::delete('/avatar', [ProfileController::class, 'deleteAvatar']);
});