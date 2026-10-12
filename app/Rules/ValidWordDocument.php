<?php

namespace App\Rules;

use Closure;
use DOMDocument;
use DOMXPath;
use Illuminate\Contracts\Validation\ValidationRule;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use ZipArchive;

class ValidWordDocument implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!$value instanceof UploadedFile || strtolower($value->getClientOriginalExtension()) !== 'docx') {
            $fail('Upload a valid Word (.docx) document.'); return;
        }
        $zip = new ZipArchive;
        if ($zip->open($value->getRealPath()) !== true) { $fail('Upload a valid Word (.docx) document.'); return; }
        try {
            $total = 0;
            if ($zip->numFiles > 10000) { $fail('The Word document is too large to process.'); return; }
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $total += $zip->statIndex($i)['size'];
                if ($total > 100 * 1024 * 1024) { $fail('The Word document is too large to process.'); return; }
            }
            $document = $this->xml($zip, 'word/document.xml', 10 * 1024 * 1024);
            $types = $this->xml($zip, '[Content_Types].xml', 1024 * 1024);
            if (!$document || !$types || $document->documentElement->localName !== 'document' ||
                $document->documentElement->namespaceURI !== 'http://schemas.openxmlformats.org/wordprocessingml/2006/main') {
                $fail('The uploaded file does not contain a valid Word document.'); return;
            }
            $xp = new DOMXPath($types); $xp->registerNamespace('ct', 'http://schemas.openxmlformats.org/package/2006/content-types');
            if (!$xp->query('/ct:Types/ct:Override[@PartName="/word/document.xml" and @ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"]')->length ||
                !$document->getElementsByTagNameNS($document->documentElement->namespaceURI, 'body')->length) $fail('The uploaded file does not contain a valid Word document.');
        } finally { $zip->close(); }
    }

    private function xml(ZipArchive $zip, string $name, int $limit): ?DOMDocument
    {
        $stat = $zip->statName($name);
        if (!$stat || $stat['size'] > $limit) return null;
        $xml = $zip->getFromName($name);
        if (!$xml || stripos($xml, '<!DOCTYPE') !== false) return null;
        $doc = new DOMDocument;
        return @$doc->loadXML($xml, LIBXML_NONET) ? $doc : null;
    }
}
