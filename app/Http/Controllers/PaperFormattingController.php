<?php

namespace App\Http\Controllers;

use App\Services\PaperFormatter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Throwable;

class PaperFormattingController extends Controller
{
    public function store(Request $request, PaperFormatter $formatter)
    {
        $data = $request->validate([
            'file' => 'required|file|mimes:docx|max:20480',
            'template_id' => 'required|string|max:120',
        ]);
        $row = DB::table('format_templates')->orderBy('id')->first();
        $templates = $row ? json_decode($row->data, true) : [];
        $template = collect(is_array($templates) ? $templates : [])->first(fn ($item) =>
            is_array($item) && (string) ($item['id'] ?? '') === $data['template_id']);
        if (!$template || empty($template['active']) || empty($template['rules']) || !is_array($template['rules'])) {
            throw ValidationException::withMessages(['template_id' => 'Select an active format template saved by the admin.']);
        }
        // Never accept a URL or rules supplied by the browser. Work on a private
        // copy and delete it after streaming, leaving the original unchanged.
        $directory = storage_path('app/private/paper-fixes');
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new \RuntimeException('Could not create the paper processing directory.');
        $path = tempnam($directory, 'paper_');
        if ($path === false) throw new \RuntimeException('Could not create the paper processing file.');
        try {
            if (!copy($request->file('file')->getRealPath(), $path)) throw new \RuntimeException('Could not copy the uploaded paper.');
            $formatter->format($path, $template['rules']);
            $name = preg_replace('/[^a-zA-Z0-9_.-]/', '_', pathinfo($request->file('file')->getClientOriginalName(), PATHINFO_FILENAME));
            return response()->download($path, ($name ?: 'paper').'_fixed.docx', [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Cache-Control' => 'private, no-store',
            ])->deleteFileAfterSend(true);
        } catch (InvalidArgumentException $e) {
            @unlink($path);
            throw ValidationException::withMessages(['file' => $e->getMessage()]);
        } catch (Throwable $e) {
            @unlink($path); throw $e;
        }
    }
}
