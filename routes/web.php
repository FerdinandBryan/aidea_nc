<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Forces a real download for files in storage/assignments (used by File Transfer > Download)
Route::get('/download/assignments/{file}', function (\Illuminate\Http\Request $request, string $file) {
    $file = basename($file);
    $path = 'assignments/' . $file;
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    abort_unless($disk->exists($path), 404);
    $name = preg_replace('/[^\w\s.\-()]/u', '', (string) $request->query('name', $file));
    if ($name === '' || $name === null) { $name = $file; }
    return $disk->download($path, $name);
})->where('file', '[A-Za-z0-9._\-]+');
