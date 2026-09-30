<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use Illuminate\Support\Facades\Storage;

class CertificateController extends Controller
{
    /** Returns { "<payment_id>": { url, name, type } }. Admins get all, students only their own. */
    public function index()
    {
        $user    = request()->user();
        $isAdmin = $user && stripos((string) ($user->role ?? ''), 'admin') !== false;

        $out = [];

        // 1) Database records (these carry the real type: files | certificate)
        $query = Payment::whereNotNull('certificate_url');
        if (!$isAdmin) {
            $query->where('user_id', $user->id);
        }
        foreach ($query->get(['id', 'certificate_url', 'certificate_name', 'certificate_type']) as $p) {
            $out[(string) $p->id] = [
                'url'  => preg_replace('#^http://#i', 'https://', (string) $p->certificate_url),
                'name' => $p->certificate_name,
                'type' => $p->certificate_type ?: 'certificate',
            ];
        }

        // 2) Fallback for older records that only exist on disk
        $allowed = null;
        if (!$isAdmin) {
            $allowed = Payment::where('user_id', $user->id)->pluck('id')
                ->map(fn ($v) => (string) $v)->all();
        }

        $disk = Storage::disk('public');
        foreach ($disk->directories('payment-files') as $dir) {
            $id = basename($dir);
            if (isset($out[$id])) { continue; }
            if ($allowed !== null && !in_array($id, $allowed, true)) { continue; }

            $type  = 'certificate';
            $files = $disk->files($dir . '/certificate');
            if (!$files) { $files = $disk->files($dir); $type = 'files'; }
            if (!$files) { continue; }

            usort($files, fn ($a, $b) => $disk->lastModified($b) <=> $disk->lastModified($a));
            $f = $files[0];

            $out[$id] = [
                'url'  => secure_url('/storage/' . str_replace('%2F', '/', rawurlencode($f))),
                'name' => basename($f),
                'type' => $type,
            ];
        }

        return response()->json((object) $out);
    }
}
