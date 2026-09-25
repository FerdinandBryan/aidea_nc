<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use Illuminate\Support\Facades\Storage;

class CertificateController extends Controller
{
    /** Returns { "<payment_id>": { url, name } }. Admins get all, students only their own. */
    public function index()
    {
        $user    = request()->user();
        $isAdmin = $user && stripos((string) ($user->role ?? ''), 'admin') !== false;
        $allowed = null;
        if (!$isAdmin) {
            $allowed = Payment::where('user_id', $user->id)->pluck('id')
                ->map(fn ($v) => (string) $v)->all();
        }

        $disk = Storage::disk('public');
        $out  = [];

        foreach ($disk->directories('payment-files') as $dir) {
            $id = basename($dir);
            if ($allowed !== null && !in_array($id, $allowed, true)) { continue; }

            $files = $disk->files($dir . '/certificate');
            if (!$files) { $files = $disk->files($dir); }
            if (!$files) { continue; }

            usort($files, fn ($a, $b) => $disk->lastModified($b) <=> $disk->lastModified($a));
            $f = $files[0];

            $out[$id] = [
                'url'  => url('/storage/' . str_replace('%2F', '/', rawurlencode($f))),
                'name' => basename($f),
            ];
        }

        return response()->json((object) $out);
    }
}