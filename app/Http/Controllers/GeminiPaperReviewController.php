<?php

namespace App\Http\Controllers;

use App\Services\AdminFormattingTemplate;
use App\Services\GeminiPaperReview;
use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use RuntimeException;

class GeminiPaperReviewController extends Controller
{
    public function store(Request $request, AdminFormattingTemplate $templates, GeminiPaperReview $reviewer)
    {
        $data = $request->validate(['file' => 'required|file|mimes:docx|max:20480', 'template_id' => 'required|string|max:120']);
        $template = $templates->load($data['template_id']);
        try {
            return response()->json($reviewer->review($request->file('file')->getRealPath(), $template))->header('Cache-Control', 'private, no-store');
        } catch (ConnectionException $e) {
            return response()->json(['message' => 'Gemini is unreachable or timed out. Try again later.'], 503);
        } catch (RuntimeException $e) {
            $code = in_array($e->getCode(), [429, 502, 503], true) ? $e->getCode() : 502;
            return response()->json(['message' => $e->getMessage()], $code);
        }
    }
}
