<?php

namespace App\Http\Controllers;

use App\Rules\ValidWordDocument;
use App\Services\AdminFormattingTemplate;
use Illuminate\Http\Request;

class AdminFormattingTemplateController extends Controller
{
    public function storeReference(string $templateId, Request $request, AdminFormattingTemplate $templates)
    {
        $data = $request->validate([
            'file' => ['bail', 'required', 'file', 'max:51200', new ValidWordDocument],
        ]);
        $templates->load($templateId);
        $templates->saveReference($templateId, $data['file']->getRealPath());

        return response()->json(['ok' => true]);
    }
}