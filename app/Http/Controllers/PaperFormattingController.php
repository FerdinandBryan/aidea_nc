<?php

namespace App\Http\Controllers;

use App\Rules\ValidWordDocument;

use App\Services\PaperFormatter;
use App\Services\AdminFormattingTemplate;
use App\Services\PaperAttentionMarker;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Throwable;

class PaperFormattingController extends Controller
{
    public function show(string $templateId, AdminFormattingTemplate $templates, PaperFormatter $formatter)
    {
        $template = $templates->load($templateId);
        try { $settings = $formatter->settings($template['effective_rules']); }
        catch (InvalidArgumentException $e) { throw ValidationException::withMessages(['template_id' => $e->getMessage()]); }
        return response()->json(['template_id' => $templateId, 'template' => $template['name'] ?? 'Selected template',
            'revision' => $template['revision'], 'settings' => $settings])->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request, PaperFormatter $formatter, AdminFormattingTemplate $templates, PaperAttentionMarker $marker)
    {
        $data = $request->validate([
            'file' => ['bail', 'required', 'file', 'max:20480', new ValidWordDocument],
            'template_id' => 'required|string|max:120',
            'include_report' => 'sometimes|boolean',
        ]);
        $missing = $formatter->missingExtensions();
        if ($missing) {
            return response()->json([
                'message' => 'Paper formatting is temporarily unavailable: the server needs PHP extensions '.implode(', ', $missing).'. Please retry after the backend deployment finishes.',
            ], 503);
        }
        $template = $templates->load($data['template_id']);
        // Never accept a URL or rules supplied by the browser. Work on a private
        // copy and delete it after streaming, leaving the original unchanged.
        $directory = storage_path('app/private/paper-fixes');
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new \RuntimeException('Could not create the paper processing directory.');
        $path = tempnam($directory, 'paper_');
        if ($path === false) throw new \RuntimeException('Could not create the paper processing file.');
        try {
            if (!copy($request->file('file')->getRealPath(), $path)) throw new \RuntimeException('Could not copy the uploaded paper.');
            $report = $formatter->format($path, $template['effective_rules']);
            $original = $marker->mark($request->file('file')->getRealPath(), $report['settings'], [], false);
            $verification = $marker->mark($path, $report['settings'], [], false);
            $report['attention_resolutions'] = $marker->resolutions($original['issues'], $verification['issues']);
            $report['fixed_validation'] = ['remaining_formatting_issues' => $verification['issues'], 'review_marks_removed' => true, 'content_review_required' => true];
            foreach ($verification['issues'] as $issue) $report['manual_review_rules'][] = $issue['message'];
            $report['manual_review_required'] = !empty($report['manual_review_rules']);
            $report['template_revision'] = $template['revision'];
            if ($request->boolean('include_report')) {
                $report['template'] = $template['name'] ?? 'Selected template';
                $report['template_id'] = $data['template_id'];
                $document = base64_encode(file_get_contents($path));
                @unlink($path);
                return response()->json(['document_base64' => $document, 'report' => $report])->header('Cache-Control', 'private, no-store');
            }
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
