<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMXPath;
use ZipArchive;

/** Native page numbering and TOC references for the selected thesis template. */
class TemplatePaginationFormatter
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    private const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    private ?DOMDocument $relationships = null;
    private ?DOMDocument $contentTypes = null;

    public function apply(string $path, string $referencePath, array $rules): void
    {
        $reference = new ZipArchive;
        if ($reference->open($referencePath) !== true) return;
        $enabled = false;
        foreach ($rules as $rule) if (preg_match('/pagination|page\s+number/i', $rule['detail'] ?? '')) $enabled = true;
        for ($i = 0; $i < $reference->numFiles; $i++) {
            if (preg_match('~^word/(header|footer).*\.xml$~', $reference->getNameIndex($i)) && preg_match('/\bPAGE\b/', $reference->getFromIndex($i))) $enabled = true;
        }
        $reference->close();
        if (!$enabled) return;
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) return;
        try {
            $this->relationships = $this->document($zip->getFromName('word/_rels/document.xml.rels')) ?? $this->document('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
            $this->contentTypes = $this->document($zip->getFromName('[Content_Types].xml'));
            $doc = $this->document($zip->getFromName('word/document.xml'));
            if (!$doc) return;
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $body = $xp->query('/w:document/w:body')->item(0);
            $paragraphs = iterator_to_array($xp->query('./w:p', $body));
            $chapters = []; $front = null; $firstChapter = null; $approval = false;
            foreach ($paragraphs as $index => $p) {
                if ($this->isToc($p, $xp)) continue;
                $text = $this->text($p, $xp);
                if (preg_match('/^APPROVAL SHEET$/i', $text)) $approval = true;
                if (!$firstChapter && !$front && preg_match('/^(ACKNOWLEDGEMENTS?|ABSTRACT|TABLE OF CONTENTS|LIST OF (?:TABLES|FIGURES|APPENDICES))$/i', $text)) $front = $p;
                $firstLine = '';
                foreach ($xp->query('.//w:t | .//w:br', $p) as $node) {
                    if ($node->localName === 'br' && $firstLine !== '') break;
                    if ($node->localName === 't') $firstLine .= $node->textContent;
                }
                if (preg_match('/^CHAPTER\s*(?:[1-5]|I|II|III|IV|V|ONE|TWO|THREE|FOUR|FIVE)\b/i', trim($firstLine))) {
                    $chapters[] = $p;
                    if (!$firstChapter && preg_match('/^CHAPTER\s*(?:1|I|ONE)\b/i', trim($firstLine))) $firstChapter = $p;
                }
            }
            if (!$firstChapter) return;
            $base = $xp->query('./w:sectPr', $body)->item(0);
            if (!$base) { $base = $doc->createElementNS(self::W, 'w:sectPr'); $body->appendChild($base); }
            $starts = [];
            if ($front) $starts[spl_object_id($front)] = ['mode' => 'front', 'start' => $approval ? 3 : 2, 'first' => false];
            foreach ($chapters as $p) $starts[spl_object_id($p)] = ['mode' => 'body', 'start' => $p === $firstChapter ? 1 : null, 'first' => true];
            foreach ($paragraphs as $p) {
                if (!isset($starts[spl_object_id($p)])) continue;
                $previous = $p->previousSibling;
                if (!$previous) continue;
                if (!$previous instanceof DOMElement || $previous->localName !== 'p') {
                    $previous = $doc->createElementNS(self::W, 'w:p'); $body->insertBefore($previous, $p);
                }
                $pr = $this->ensure($previous, 'pPr', true);
                if (!$xp->query('./w:sectPr', $pr)->length) $pr->appendChild($base->cloneNode(true));
                // The section boundary now supplies this page break.
                foreach (iterator_to_array($xp->query('.//w:br[@w:type="page"]', $p)) as $break) $break->parentNode->removeChild($break);
                $this->ensure($this->ensure($p, 'pPr', true), 'pageBreakBefore')->setAttributeNS(self::W, 'w:val', '0');
            }
            $this->part($zip, 'aideaPageHeader.xml', '<w:hdr xmlns:w="'.self::W.'"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>', 'rIdAideaPage');
            $this->part($zip, 'aideaBlankHeader.xml', '<w:hdr xmlns:w="'.self::W.'"><w:p/></w:hdr>', 'rIdAideaBlank');
            $state = ['mode' => ($paragraphs[0] === $firstChapter ? 'body' : 'cover'), 'start' => null, 'first' => false];
            foreach (iterator_to_array($body->childNodes) as $node) {
                if (!$node instanceof DOMElement) continue;
                if (isset($starts[spl_object_id($node)])) $state = $starts[spl_object_id($node)];
                $sections = $node->localName === 'sectPr' ? [$node] : iterator_to_array($xp->query('./w:pPr/w:sectPr', $node));
                foreach ($sections as $section) {
                    $numberedHeader = $this->numberedHeader($zip, $section, $xp);
                    foreach (iterator_to_array($xp->query('./w:headerReference | ./w:pgNumType | ./w:titlePg', $section)) as $old) $old->parentNode->removeChild($old);
                    foreach (['default' => $state['mode'] === 'cover' ? 'rIdAideaBlank' : $numberedHeader, 'first' => 'rIdAideaBlank', 'even' => $state['mode'] === 'cover' ? 'rIdAideaBlank' : $numberedHeader] as $type => $id) {
                        $ref = $doc->createElementNS(self::W, 'w:headerReference'); $ref->setAttributeNS(self::W, 'w:type', $type); $ref->setAttributeNS(self::R, 'r:id', $id); $section->insertBefore($ref, $section->firstChild);
                    }
                    $type = $this->ensure($section, 'type'); $type->setAttributeNS(self::W, 'w:val', 'nextPage');
                    $num = $this->ensure($section, 'pgNumType'); $num->setAttributeNS(self::W, 'w:fmt', $state['mode'] === 'front' ? 'lowerRoman' : 'decimal');
                    if ($state['start'] !== null) $num->setAttributeNS(self::W, 'w:start', (string) $state['start']);
                    if ($state['first']) $this->ensure($section, 'titlePg');
                    $order = array_flip(['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings','sectPrChange']);
                    $children = iterator_to_array($section->childNodes);
                    usort($children, fn ($a, $b) => ($order[$a->localName] ?? 99) <=> ($order[$b->localName] ?? 99));
                    foreach ($children as $child) $section->appendChild($child);
                    $state['start'] = null; $state['first'] = false;
                }
            }
            $this->tocFields($xp);
            $zip->addFromString('word/document.xml', $doc->saveXML());
            $settings = $this->document($zip->getFromName('word/settings.xml')) ?? $this->document('<w:settings xmlns:w="'.self::W.'"/>');
            $this->ensure($settings->documentElement, 'updateFields')->setAttributeNS(self::W, 'w:val', 'true');
            $zip->addFromString('word/settings.xml', $settings->saveXML());
            $this->relationship($zip, 'rIdAideaSettings', 'settings', 'settings.xml');
            $this->contentType($zip, 'settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml');
            $zip->addFromString('word/_rels/document.xml.rels', $this->relationships->saveXML());
            if ($this->contentTypes) $zip->addFromString('[Content_Types].xml', $this->contentTypes->saveXML());
        } finally { $zip->close(); }
    }

    private function tocFields(DOMXPath $xp): void
    {
        $key = static fn (string $text) => mb_strtoupper(trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text)));
        $targets = []; $entries = []; $id = 1;
        foreach ($xp->query('//w:bookmarkStart/@w:id') as $value) $id = max($id, (int) $value->value + 1);
        foreach ($xp->query('/w:document/w:body//w:p') as $index => $p) {
            if ($this->isToc($p, $xp)) { $entries[] = $p; continue; }
            $text = $this->text($p, $xp);
            if ($text !== '' && mb_strlen($text) < 250) $targets[$key($text)][] = ['node' => $p, 'index' => $index];
        }
        $last = -1;
        foreach ($entries as $entry) {
            $text = $this->text($entry, $xp);
            $heading = preg_replace('/(?:\.{2,}|\s)+[0-9ivxlcdm]+\s*$/iu', '', $text);
            $texts = iterator_to_array($xp->query('.//w:t', $entry));
            if (count($texts) > 1 && preg_match('/^(?:[0-9]+|[ivxlcdm]+)$/iu', trim($texts[count($texts) - 1]->textContent))) $heading = preg_replace('/\.{2,}\s*$/u', '', implode(' ', array_map(fn ($t) => $t->textContent, array_slice($texts, 0, -1))));
            if ($heading === $text) continue;
            $matches = $targets[$key($heading)] ?? [];
            if (!$matches && preg_match('/^CHAPTER\s+([1-5]|I|II|III|IV|V)\b/i', $heading, $chapter)) {
                $prefix = $key('CHAPTER '.$chapter[1]);
                foreach ($targets as $targetKey => $candidates) if ($targetKey === $prefix || str_starts_with($targetKey, $prefix.' ')) $matches = array_merge($matches, $candidates);
            }
            if (!$matches && $key($heading) === 'TITLE PAGE') {
                $cover = $xp->query('/w:document/w:body/w:p')->item(0);
                if ($cover) $matches[] = ['node' => $cover, 'index' => 0];
            }
            $match = null;
            foreach ($matches as $candidate) if ($candidate['index'] >= $last) { $match = $candidate; break; }
            if (!$match) continue;
            $target = $match['node']; $last = $match['index']; $name = '_AideaToc'.$match['index'];
            if (!$xp->query('./w:bookmarkStart[@w:name="'.$name.'"]', $target)->length) {
                $start = $target->ownerDocument->createElementNS(self::W, 'w:bookmarkStart'); $start->setAttributeNS(self::W, 'w:id', (string) $id); $start->setAttributeNS(self::W, 'w:name', $name);
                $end = $target->ownerDocument->createElementNS(self::W, 'w:bookmarkEnd'); $end->setAttributeNS(self::W, 'w:id', (string) $id++);
                $pr = $xp->query('./w:pPr', $target)->item(0); $target->insertBefore($start, $pr ? $pr->nextSibling : $target->firstChild); $target->appendChild($end);
            }
            // Existing native PAGEREF fields already update against their bookmarks.
            if ($xp->query('.//w:fldSimple | .//w:instrText', $entry)->length) continue;
            $texts = $xp->query('.//w:t', $entry); $lastText = $texts->item($texts->length - 1);
            if (!$lastText || !preg_match('/([0-9ivxlcdm]+)\s*$/iu', $lastText->textContent, $number)) continue;
            $lastText->textContent = preg_replace('/[0-9ivxlcdm]+\s*$/iu', '', $lastText->textContent);
            $field = $entry->ownerDocument->createElementNS(self::W, 'w:fldSimple'); $field->setAttributeNS(self::W, 'w:instr', ' PAGEREF '.$name.' \\h '); $field->setAttributeNS(self::W, 'w:dirty', 'true');
            $run = $entry->ownerDocument->createElementNS(self::W, 'w:r'); $t = $entry->ownerDocument->createElementNS(self::W, 'w:t'); $t->textContent = $number[1]; $run->appendChild($t); $field->appendChild($run); $entry->appendChild($field);
        }
    }

    private function numberedHeader(ZipArchive $zip, DOMElement $section, DOMXPath $xp): string
    {
        $ref = $xp->query('./w:headerReference[@w:type="default"]', $section)->item(0);
        if (!$ref) return 'rIdAideaPage';
        $id = $ref->getAttributeNS(self::R, 'id');
        if ($id === 'rIdAideaBlank') return 'rIdAideaPage';
        if (str_starts_with($id, 'rIdAideaPage')) return $id;
        foreach ($this->relationships->documentElement->childNodes as $relation) {
            if (!$relation instanceof DOMElement || $relation->getAttribute('Id') !== $id || $relation->getAttribute('TargetMode') === 'External') continue;
            $target = $relation->getAttribute('Target');
            if (str_contains($target, '..')) return 'rIdAideaPage';
            $path = str_starts_with($target, '/') ? ltrim($target, '/') : 'word/'.$target;
            $xml = $zip->getFromName($path); $header = $this->document($xml);
            if (!$header) return 'rIdAideaPage';
            if (preg_match('/\bPAGE\b/', $xml)) return $id;
            $hxp = new DOMXPath($header); $hxp->registerNamespace('w', self::W);
            if (!$hxp->query('//w:t[normalize-space(.) != ""] | //w:drawing | //w:pict', $header)->length) return 'rIdAideaPage';
            $p = $header->createElementNS(self::W, 'w:p'); $pr = $this->ensure($p, 'pPr'); $this->ensure($pr, 'jc')->setAttributeNS(self::W, 'w:val', 'right');
            $field = $this->ensure($p, 'fldSimple'); $field->setAttributeNS(self::W, 'w:instr', ' PAGE '); $run = $this->ensure($field, 'r'); $this->ensure($run, 't')->textContent = '1'; $header->documentElement->appendChild($p);
            $suffix = substr(hash('sha256', $id), 0, 10); $newId = 'rIdAideaPage'.$suffix;
            $this->part($zip, 'aideaPageHeader'.$suffix.'.xml', $header->saveXML(), $newId);
            return $newId;
        }
        return 'rIdAideaPage';
    }

    private function isToc(DOMElement $p, DOMXPath $xp): bool
    {
        return preg_match('/^TOC\d*$/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p)) || $xp->query('./w:pPr/w:tabs/w:tab[@w:leader="dot"]', $p)->length > 0;
    }

    private function text(DOMElement $p, DOMXPath $xp): string
    {
        return trim(implode('', array_map(fn ($t) => $t->textContent, iterator_to_array($xp->query('.//w:t', $p)))));
    }

    private function document(string|false $xml): ?DOMDocument
    {
        if (!$xml || stripos($xml, '<!DOCTYPE') !== false) return null;
        $doc = new DOMDocument;
        return @$doc->loadXML($xml, LIBXML_NONET) ? $doc : null;
    }

    private function ensure(DOMElement $parent, string $name, bool $first = false): DOMElement
    {
        foreach ($parent->childNodes as $child) if ($child instanceof DOMElement && $child->namespaceURI === self::W && $child->localName === $name) return $child;
        $node = $parent->ownerDocument->createElementNS(self::W, 'w:'.$name);
        if ($first) $parent->insertBefore($node, $parent->firstChild); else $parent->appendChild($node);
        return $node;
    }

    private function part(ZipArchive $zip, string $name, string $xml, string $id): void
    {
        $zip->addFromString('word/'.$name, $xml);
        $this->relationship($zip, $id, 'header', $name);
        $this->contentType($zip, $name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
    }

    private function relationship(ZipArchive $zip, string $id, string $type, string $target): void
    {
        $ns = 'http://schemas.openxmlformats.org/package/2006/relationships';
        $doc = $this->relationships;
        foreach ($doc->documentElement->childNodes as $node) if ($node instanceof DOMElement && ($node->getAttribute('Id') === $id || ($type === 'settings' && $node->getAttribute('Type') === self::R.'/settings'))) return;
        $node = $doc->createElementNS($ns, 'Relationship');
        foreach (['Id' => $id, 'Type' => self::R.'/'.$type, 'Target' => $target] as $key => $value) $node->setAttribute($key, $value);
        $doc->documentElement->appendChild($node);
    }

    private function contentType(ZipArchive $zip, string $name, string $type): void
    {
        $doc = $this->contentTypes;
        if (!$doc) return;
        foreach ($doc->documentElement->childNodes as $node) if ($node instanceof DOMElement && $node->getAttribute('PartName') === '/word/'.$name) return;
        $node = $doc->createElementNS('http://schemas.openxmlformats.org/package/2006/content-types', 'Override'); $node->setAttribute('PartName', '/word/'.$name); $node->setAttribute('ContentType', $type); $doc->documentElement->appendChild($node);
    }
}
