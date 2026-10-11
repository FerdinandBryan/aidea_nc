<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMXPath;
use InvalidArgumentException;
use ZipArchive;

class PaperAttentionMarker
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function mark(string $original, array $settings, array $findings = []): array
    {
        $path = tempnam(sys_get_temp_dir(), 'paper_attention_');
        if (!$path || !copy($original, $path)) throw new InvalidArgumentException('Could not prepare the attention copy.');
        $zip = new ZipArchive;
        $opened = false;
        try {
            if ($zip->open($path) !== true) throw new InvalidArgumentException('Upload a valid Word document.');
            $opened = true;
            $xml = $zip->getFromName('word/document.xml');
            $doc = new DOMDocument;
            if (!$xml || stripos($xml, '<!DOCTYPE') !== false || !@$doc->loadXML($xml, LIBXML_NONET)) throw new InvalidArgumentException('The Word document contains invalid XML.');
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $paragraphs = iterator_to_array($xp->query('//w:body//w:p'));
            $notes = []; $issues = []; $abstract = false;
            foreach ($paragraphs as $index => $p) {
                $text = ''; foreach ($xp->query('.//w:t', $p) as $t) $text .= $t->textContent;
                $text = trim($text); if ($text === '') continue;
                $isHeading = strtoupper($text) === 'ABSTRACT';
                if ($isHeading) $abstract = true;
                elseif (preg_match('/^(CHAPTER\s|TABLE OF CONTENTS|LIST OF|ACKNOWLEDGEMENT|REFERENCES|APPENDICES)/i', $text)) $abstract = false;
                if ($xp->query('ancestor::w:tbl', $p)->length) continue;
                $target = $abstract && !$isHeading ? ($settings['abstract'] ?? $settings['spacing']) : $settings['spacing'];
                $spacing = $xp->query('./w:pPr/w:spacing', $p)->item(0);
                if ($target !== null && $spacing && $spacing->hasAttributeNS(self::W, 'line') &&
                    in_array($spacing->getAttributeNS(self::W, 'lineRule'), ['', 'auto'], true)) {
                    $actual = (float) $spacing->getAttributeNS(self::W, 'line') / 240;
                    if (abs($actual - $target) > .02) {
                        $message = 'Line spacing is '.round($actual, 2).'; the selected admin template requires '.$target.'.';
                        $notes[$index][] = $message; $issues[] = ['paragraph' => $index + 1, 'type' => 'spacing', 'message' => $message];
                    }
                }
            }
            $firstText = null;
            foreach ($paragraphs as $index => $p) if (trim($xp->evaluate('string(.//w:t)', $p)) !== '') { $firstText = $index; break; }
            foreach ($xp->query('//w:sectPr') as $sectionIndex => $section) {
                $margin = $xp->query('./w:pgMar', $section)->item(0);
                if (!$margin) continue;
                foreach ($settings['margins'] as $side => $target) {
                    if (!$margin->hasAttributeNS(self::W, $side)) continue;
                    $actual = (float) $margin->getAttributeNS(self::W, $side) / 1440;
                    if (abs($actual - $target) <= .01) continue;
                    $message = 'Section '.($sectionIndex + 1).' '.$side.' margin is '.round($actual, 2).' inches; template requires '.$target.' inches.';
                    if ($firstText !== null) $notes[$firstText][] = $message;
                    $issues[] = ['paragraph' => ($firstText ?? -1) + 1, 'type' => 'margin', 'message' => $message];
                }
            }
            foreach ($findings as $finding) {
                if (($finding['status'] ?? '') !== 'fail') continue;
                $index = (int) ($finding['paragraph'] ?? 0) - 1;
                $message = 'AI review (advisory): '.($finding['rule'] ?? 'Checklist rule').': '.$finding['explanation'];
                if ($index >= 0 && isset($paragraphs[$index])) $notes[$index][] = $message;
                elseif ($firstText !== null) $notes[$firstText][] = $message.' No exact paragraph was identified.';
                $issues[] = ['paragraph' => max(0, $index + 1), 'type' => 'content', 'message' => $message];
            }
            foreach ($notes as $index => $messages) {
                $p = $paragraphs[$index];
                foreach (iterator_to_array($xp->query('.//w:r[w:t]', $p)) as $run) {
                    $pr = $this->child($run, 'rPr', true);
                    $highlight = $this->child($pr, 'highlight'); $highlight->setAttributeNS(self::W, 'w:val', 'yellow');
                }
                $note = $doc->createElementNS(self::W, 'w:p');
                $run = $note->appendChild($doc->createElementNS(self::W, 'w:r'));
                $pr = $run->appendChild($doc->createElementNS(self::W, 'w:rPr'));
                $color = $pr->appendChild($doc->createElementNS(self::W, 'w:color')); $color->setAttributeNS(self::W, 'w:val', 'FF0000');
                $run->appendChild($doc->createElementNS(self::W, 'w:t'))->textContent = 'Needs attention: '.implode(' ', array_unique($messages));
                $p->parentNode->insertBefore($note, $p->nextSibling);
            }
            $zip->addFromString('word/document.xml', $doc->saveXML()); $zip->close(); $opened = false;
            return ['document_base64' => base64_encode(file_get_contents($path)), 'issues' => $issues];
        } finally { if ($opened) $zip->close(); @unlink($path); }
    }

    private function child(DOMElement $parent, string $name, bool $first = false): DOMElement
    {
        foreach ($parent->childNodes as $child) if ($child instanceof DOMElement && $child->localName === $name && $child->namespaceURI === self::W) return $child;
        $child = $parent->ownerDocument->createElementNS(self::W, 'w:'.$name);
        $parent->insertBefore($child, $first ? $parent->firstChild : null); return $child;
    }
}
