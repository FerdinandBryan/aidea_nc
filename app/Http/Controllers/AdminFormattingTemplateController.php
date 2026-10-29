<?php

namespace App\Http\Controllers;

use App\Rules\ValidWordDocument;
use App\Services\AdminFormattingTemplate;
use Illuminate\Http\Request;
use RuntimeException;

class AdminFormattingTemplateController extends Controller
{
    public function storeReference(string $templateId, Request $request, AdminFormattingTemplate $templates)
    {
        $data = $request->validate([
            'file' => ['bail', 'required', 'file', 'max:20480', new ValidWordDocument],
        ]);
        $templates->load($templateId);
        $path = $templates->referenceStoragePath($templateId);
        $directory = dirname($path);
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Could not create the private template directory.');
        }
        if (!copy($data['file']->getRealPath(), $path)) throw new RuntimeException('Could not save the admin reference template.');
        @chmod($path, 0600);

        return response()->json(['ok' => true]);
    }
}