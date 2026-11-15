<?php

namespace App\Http\Controllers;

use App\Services\AdminFormattingTemplate;
use App\Services\PaperAttentionMarker;
use App\Services\PaperFormatter;
use Illuminate\Http\Request;

/** Compatibility endpoint: use the same selected-template pipeline as paper fixes. */
class DocxFormatController extends Controller
{
    public function format(Request $request, PaperFormattingController $papers, PaperFormatter $formatter, AdminFormattingTemplate $templates, PaperAttentionMarker $marker)
    {
        return $papers->store($request, $formatter, $templates, $marker);
    }
}
