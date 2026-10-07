<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

class DocxPdfController extends Controller
{
    public function convert(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:docx|max:20480']);

        $dir = storage_path('app/docx-convert/' . uniqid('', true));
        File::makeDirectory($dir, 0775, true);
        $request->file('file')->move($dir, 'certificate.docx');

        $bin = null;
        foreach (['soffice', 'libreoffice'] as $b) {
            $chk = new Process(['which', $b]);
            $chk->run();
            if ($chk->isSuccessful()) { $bin = trim($chk->getOutput()); break; }
        }
        if (!$bin) {
            File::deleteDirectory($dir);
            return response()->json(['message' => 'LibreOffice is not installed on the server'], 501);
        }

        $p = new Process([
            $bin, '--headless', '--norestore',
            '-env:UserInstallation=file://' . $dir . '/profile',
            '--convert-to', 'pdf', '--outdir', $dir, $dir . '/certificate.docx',
        ]);
        $p->setTimeout(90);
        $p->setEnv(['HOME' => $dir]);
        $p->run();

        $pdf = $dir . '/certificate.pdf';
        if (!is_file($pdf)) {
            File::deleteDirectory($dir);
            return response()->json(['message' => 'PDF conversion failed'], 500);
        }
        $bytes = file_get_contents($pdf);
        File::deleteDirectory($dir);
        return response($bytes, 200, ['Content-Type' => 'application/pdf']);
    }
}