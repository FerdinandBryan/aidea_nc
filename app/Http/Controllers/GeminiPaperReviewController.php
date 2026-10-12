<?php

namespace App\Http\Controllers;

use App\Rules\ValidWordDocument;

use App\Services\AdminFormattingTemplate;
use App\Services\GeminiPaperReview;
use App\Services\PaperFormatter;
use App\Services\PaperAttentionMarker;
use App\Services\GeminiFormattingPlan;
use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use InvalidArgumentException;

class GeminiPaperReviewController extends Controller
{
    public function checkAndFix(Request $request, AdminFormattingTemplate $templates, GeminiPaperReview $reviewer, PaperFormatter $formatter, PaperAttentionMarker $marker)
    {
        $data = $request->validate(['file' => ['bail', 'required', 'file', 'max:20480', new ValidWordDocument], 'template_id' => 'required|string|max:120']);
        $template = $templates->load($data['template_id']);
        $path = null;
        try {
            $review = $reviewer->review($request->file('file')->getRealPath(), $template);
            $plan = (new GeminiFormattingPlan)->resolve($template['effective_rules'], $review['formatting_rules'] ?? [], $formatter);
            $review['review']['findings'] = (new \App\Services\DocxFormattingReview)->apply($request->file('file')->getRealPath(), $template['effective_rules'], $review['review']['findings'], $formatter);
            $path = tempnam(sys_get_temp_dir(), 'checked_paper_');
            if ($path === false || !copy($request->file('file')->getRealPath(), $path)) throw new RuntimeException('Could not prepare the formatted copy.', 503);
            $report = $formatter->format($path, $plan['rules']);
            $report['gemini_formatting'] = ['requested' => $plan['requested'], 'validated_rules' => $plan['accepted'], 'warnings' => $plan['warnings']];
            foreach ($plan['warnings'] as $warning) $report['manual_review_rules'][] = $warning;
            $report['manual_review_required'] = !empty($report['manual_review_rules']);
            $report['template'] = $template['name'] ?? 'Selected template';
            $report['template_revision'] = $template['revision'];
            $attention = $marker->mark($request->file('file')->getRealPath(), $report['settings'], $review['review']['findings']);
            $verification = $marker->mark($path, $report['settings'], [], false);
            $report['attention_resolutions'] = $marker->resolutions($attention['issues'], $verification['issues']);
            $report['fixed_validation'] = ['remaining_formatting_issues' => $verification['issues'],
                'review_marks_removed' => true, 'content_review_required' => count(array_filter($review['review']['findings'], fn ($finding) => $finding['status'] !== 'pass')) > 0];
            foreach ($verification['issues'] as $issue) $report['manual_review_rules'][] = $issue['message'];
            $report['manual_review_required'] = !empty($report['manual_review_rules']);
            return response()->json($review + ['document_base64' => base64_encode(file_get_contents($path)), 'report' => $report,
                'attention_document_base64' => $attention['document_base64'], 'attention_issues' => $attention['issues'], 'attention_objects' => $attention['objects']])
                ->header('Cache-Control', 'private, no-store');
        } catch (ConnectionException $e) {
            return response()->json(['message' => 'Gemini is unreachable or timed out. Try Check formatting again later.'], 503);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (RuntimeException $e) {
            $code = in_array($e->getCode(), [429, 502, 503], true) ? $e->getCode() : 502;
            Log::warning('Paper check and fix failed', ['status' => $code, 'template_id' => $data['template_id'], 'reason' => $e->getMessage()]);
            return response()->json(['message' => $e->getMessage()], $code);
        } finally { if ($path) @unlink($path); }
    }

    public function store(Request $request, AdminFormattingTemplate $templates, GeminiPaperReview $reviewer)
    {
        $data = $request->validate(['file' => ['bail', 'required', 'file', 'max:20480', new ValidWordDocument], 'template_id' => 'required|string|max:120']);
        $template = $templates->load($data['template_id']);
        try {
            return response()->json($reviewer->review($request->file('file')->getRealPath(), $template))->header('Cache-Control', 'private, no-store');
        } catch (ConnectionException $e) {
            return response()->json(['message' => 'Gemini is unreachable or timed out. Try again later.'], 503);
        } catch (RuntimeException $e) {
            $code = in_array($e->getCode(), [429, 502, 503], true) ? $e->getCode() : 502;
            Log::warning('Gemini paper review failed', ['status' => $code, 'template_id' => $data['template_id'], 'reason' => $e->getMessage()]);
            return response()->json(['message' => $e->getMessage()], $code);
        }
    }
}
