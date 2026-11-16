<?php

namespace App\Services;

use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;
use Illuminate\Support\Facades\File;
use ZipArchive;

class PaperPagination
{
    public function apply(string $path): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) return ['status' => 'not-applicable'];
        $xml = $zip->getFromName('word/document.xml') ?: '';
        $zip->close();
        $text = html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
        if (!preg_match('/TABLE\s+OF\s+CONTENTS/iu', $text)) return ['status' => 'not-applicable'];
        if (!config('paper-pagination.enabled', false)) {
            return ['status' => 'unavailable', 'warnings' => ['TOC page-number synchronization is not enabled on this server. Existing TOC values were preserved.']];
        }
        $finder = new ExecutableFinder;
        $python = $finder->find('python3');
        $office = $finder->find('soffice') ?: $finder->find('libreoffice');
        if (!$python || !$office || PHP_OS_FAMILY === 'Windows') {
            return ['status' => 'unavailable', 'warnings' => ['TOC page numbers could not be recalculated: the server requires LibreOffice Writer and Python UNO. Existing TOC values were preserved.']];
        }
        $directory = storage_path('app/private/pagination/'.bin2hex(random_bytes(12)));
        File::makeDirectory($directory, 0700, true);
        try {
            if (!copy($path, $directory.'/input.docx')) throw new \RuntimeException('Could not prepare pagination.');
            $process = new Process([$python, base_path('scripts/paginate-paper.py'), $office, $directory]);
            $process->setTimeout(150);
            $process->mustRun();
            $result = json_decode(file_get_contents($directory.'/result.json'), true, 512, JSON_THROW_ON_ERROR);
            if (($result['status'] ?? '') !== 'complete' || !is_file($directory.'/output.docx') || !is_file($directory.'/output.pdf')) {
                return ['status' => 'unresolved', 'warnings' => $result['warnings'] ?? ['TOC pagination was not completed. The formatted document was preserved.']];
            }
            $check = new ZipArchive;
            if ($check->open($directory.'/output.docx') !== true) throw new \RuntimeException('Invalid paginated document.');
            $valid = $check->locateName('word/document.xml') !== false; $check->close();
            if (!$valid) throw new \RuntimeException('Missing paginated document body.');
            if (!copy($directory.'/output.docx', $path)) throw new \RuntimeException('Could not save paginated document.');
            $result['pdf_base64'] = base64_encode(file_get_contents($directory.'/output.pdf'));
            return $result;
        } catch (\Throwable $error) {
            report($error);
            return ['status' => 'failed', 'warnings' => ['Page numbering could not be verified. The formatted document and its existing TOC values were preserved; retry or update the TOC in Word.']];
        } finally {
            File::deleteDirectory($directory);
        }
    }
}
