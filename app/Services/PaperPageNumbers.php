<?php

namespace App\Services;

use DOMDocument;
use DOMXPath;
use DOMElement;
use ZipArchive;

class PaperPageNumbers
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    private const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    private const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

    public function apply(string $path): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) throw new \InvalidArgumentException('Could not open the fixed paper for page numbering.');
        try {
            $doc = $this->xml($zip->getFromName('word/document.xml'));
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $chapter = null;
            foreach ($xp->query('/w:document/w:body/w:p') as $p) {
                $text = ''; foreach ($xp->query('.//w:t | .//w:br', $p) as $node) $text .= $node->localName === 'br' ? "\n" : $node->textContent;
                $style = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p);
                if (preg_match('/^TOC/i', $style) || $xp->query('.//w:tab', $p)->length || preg_match('/\.{2,}|[\x{2024}-\x{2026}]/u', $text)) continue;
                if (preg_match('/^\s*CHAPTER\s+(?:1|I|ONE)(?:\s*$|\s*\n|\s*[:.\-]\s*\p{L})/iu', $text)) { $chapter = $p; break; }
            }
            if (!$chapter) return ['status' => 'unresolved', 'warnings' => ['Page numbers were not added because the start of Chapter 1 could not be identified safely.']];
            $body = $chapter->parentNode;
            $layout = $xp->query('./w:pPr/w:sectPr | following::w:sectPr[1]', $chapter)->item(0);
            if (!$layout) { $layout = $doc->createElementNS(self::W, 'w:sectPr'); $body->appendChild($layout); }
            $previous = $chapter->previousSibling;
            while ($previous && !$previous instanceof DOMElement) $previous = $previous->previousSibling;
            if ($previous) {
                $previousSection = $previous->localName === 'p' ? $xp->query('./w:pPr/w:sectPr', $previous)->item(0) : null;
                if (!$previousSection) {
                    $boundary = $doc->createElementNS(self::W, 'w:p');
                    $pr = $doc->createElementNS(self::W, 'w:pPr'); $boundary->appendChild($pr);
                    $pr->appendChild($layout->cloneNode(true));
                    $body->insertBefore($boundary, $chapter);
                }
            }
            // Section properties describe the section ending at that node.
            $sections = iterator_to_array($xp->query('./w:pPr/w:sectPr | following::w:sectPr', $chapter));
            $rels = $this->xml($zip->getFromName('word/_rels/document.xml.rels') ?: '<Relationships xmlns="'.self::PR.'"/>');
            $types = $this->xml($zip->getFromName('[Content_Types].xml'));
            $generated = []; $first = true;
            foreach ($sections as $section) {
                if ($first && $previous) {
                    $type = $xp->query('./w:type', $section)->item(0);
                    if (!$type) { $type = $doc->createElementNS(self::W, 'w:type'); $section->insertBefore($type, $section->firstChild); }
                    $type->setAttributeNS(self::W, 'w:val', 'nextPage');
                }
                $inherited = []; $headers = [];
                foreach ($xp->query('preceding::w:sectPr | .', $section) as $prior) {
                    foreach ($xp->query('./w:footerReference', $prior) as $reference) $inherited[$reference->getAttributeNS(self::W, 'type')] = $reference->getAttributeNS(self::R, 'id');
                    foreach ($xp->query('./w:headerReference', $prior) as $reference) $headers[$reference->getAttributeNS(self::W, 'type')] = $reference->getAttributeNS(self::R, 'id');
                }
                foreach (['default', 'first', 'even'] as $kind) {
                    $headerId = $headers[$kind] ?? ($headers['default'] ?? '');
                    $headerHasPage = false;
                    foreach ($rels->documentElement->childNodes as $rel) {
                        if (!$rel instanceof DOMElement || $rel->getAttribute('Id') !== $headerId || $rel->getAttribute('TargetMode') === 'External') continue;
                        $headerPart = preg_replace('#^word/word/#', 'word/', 'word/'.ltrim($rel->getAttribute('Target'), '/'));
                        $headerXml = $zip->getFromName($headerPart);
                        if ($headerXml) {
                            $hx = new DOMXPath($this->xml($headerXml)); $hx->registerNamespace('w', self::W);
                            foreach ($hx->query('//w:instrText | //w:fldSimple/@w:instr') as $instruction) if (preg_match('/\bPAGE\b/i', $instruction->textContent)) $headerHasPage = true;
                        }
                    }
                    if ($headerHasPage) continue; // Keep the template's existing header number.
                    $rid = $inherited[$kind] ?? '';
                    $source = null;
                    foreach ($rels->documentElement->childNodes as $rel) if ($rel instanceof DOMElement && $rel->getAttribute('Id') === $rid && $rel->getAttribute('TargetMode') !== 'External') $source = 'word/'.ltrim($rel->getAttribute('Target'), '/');
                    $source = $source ? preg_replace('#^word/word/#', 'word/', $source) : null;
                    $key = $source ?: 'empty';
                    if ($source && preg_match('#/footer-aidea-[a-f0-9]+\.xml$#', $source)) $generated[$key] = $rid;
                    if (!isset($generated[$key])) {
                        $footer = $this->xml($source ? ($zip->getFromName($source) ?: '<w:ftr xmlns:w="'.self::W.'"/>') : '<w:ftr xmlns:w="'.self::W.'"/>');
                        $fx = new DOMXPath($footer); $fx->registerNamespace('w', self::W);
                        $hasPage = false;
                        foreach ($fx->query('//w:instrText | //w:fldSimple/@w:instr') as $instruction) if (preg_match('/\bPAGE\b/i', $instruction->textContent)) $hasPage = true;
                        if (!$hasPage) {
                            $p = $footer->createElementNS(self::W, 'w:p');
                            $pr = $footer->createElementNS(self::W, 'w:pPr'); $p->appendChild($pr);
                            $style = $footer->createElementNS(self::W, 'w:pStyle'); $style->setAttributeNS(self::W, 'w:val', 'AideaPageNumber'); $pr->appendChild($style);
                            $jc = $footer->createElementNS(self::W, 'w:jc'); $jc->setAttributeNS(self::W, 'w:val', 'center'); $pr->appendChild($jc);
                            $field = $footer->createElementNS(self::W, 'w:fldSimple'); $field->setAttributeNS(self::W, 'w:instr', ' PAGE '); $p->appendChild($field);
                            $run = $footer->createElementNS(self::W, 'w:r'); $field->appendChild($run);
                            $run->appendChild($footer->createElementNS(self::W, 'w:t', '1'));
                            $footer->documentElement->appendChild($p);
                        }
                        $suffix = bin2hex(random_bytes(6)); $part = 'footer-aidea-'.$suffix.'.xml'; $newId = 'rIdPage'.$suffix;
                        $zip->addFromString('word/'.$part, $footer->saveXML());
                        if ($source) {
                            $sourceRels = dirname($source).'/_rels/'.basename($source).'.rels';
                            if (($bytes = $zip->getFromName($sourceRels)) !== false) $zip->addFromString('word/_rels/'.$part.'.rels', $bytes);
                        }
                        $rel = $rels->createElementNS(self::PR, 'Relationship'); $rel->setAttribute('Id', $newId); $rel->setAttribute('Type', self::R.'/footer'); $rel->setAttribute('Target', $part); $rels->documentElement->appendChild($rel);
                        $override = $types->createElementNS($types->documentElement->namespaceURI, 'Override'); $override->setAttribute('PartName', '/word/'.$part); $override->setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'); $types->documentElement->appendChild($override);
                        $generated[$key] = $newId;
                    }
                    foreach (iterator_to_array($xp->query('./w:footerReference[@w:type="'.$kind.'"]', $section)) as $old) $section->removeChild($old);
                    $reference = $doc->createElementNS(self::W, 'w:footerReference'); $reference->setAttributeNS(self::W, 'w:type', $kind); $reference->setAttributeNS(self::R, 'r:id', $generated[$key]);
                    $section->insertBefore($reference, $section->firstChild);
                }
                foreach (iterator_to_array($xp->query('./w:pgNumType', $section)) as $old) $section->removeChild($old);
                $numbering = $doc->createElementNS(self::W, 'w:pgNumType'); $numbering->setAttributeNS(self::W, 'w:fmt', 'decimal');
                if ($first) $numbering->setAttributeNS(self::W, 'w:start', '1');
                // pgNumType follows page geometry and precedes columns.
                $after = $xp->query('./w:cols | ./w:vAlign | ./w:titlePg | ./w:docGrid', $section)->item(0);
                $section->insertBefore($numbering, $after); $first = false;
            }
            if ($previous) {
                foreach ($xp->query('.//w:br | .//w:t', $chapter) as $node) {
                    if ($node->localName === 't' && trim($node->textContent) !== '') break;
                    if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') $node->parentNode->removeChild($node);
                }
                $break = $xp->query('./w:pPr/w:pageBreakBefore', $chapter)->item(0);
                if ($break) $break->setAttributeNS(self::W, 'w:val', '0');
            }
            $zip->addFromString('word/document.xml', $doc->saveXML());
            $zip->addFromString('word/_rels/document.xml.rels', $rels->saveXML());
            $zip->addFromString('[Content_Types].xml', $types->saveXML());
            return ['status' => 'added', 'chapter_one_start' => 1, 'placement' => 'footer', 'toc_synchronized' => false];
        } finally { $zip->close(); }
    }

    private function xml(string|false $xml): DOMDocument
    {
        $doc = new DOMDocument;
        if (!$xml || stripos($xml, '<!DOCTYPE') !== false || !@$doc->loadXML($xml, LIBXML_NONET)) throw new \InvalidArgumentException('Invalid Word XML while adding page numbers.');
        return $doc;
    }
}
