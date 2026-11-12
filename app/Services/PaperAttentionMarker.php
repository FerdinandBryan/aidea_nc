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

    public function resolutions(array $originalIssues, array $remainingIssues): array
    {
        $remainingTypes = array_column($remainingIssues, 'type');
        return array_map(function ($issue) use ($remainingTypes) {
            $supported = in_array($issue['type'], ['spacing', 'margin', 'appendix-title'], true);
            $issue['status'] = $supported && !in_array($issue['type'], $remainingTypes, true) ? 'corrected' : 'review';
            return $issue;
        }, $originalIssues);
    }

    public function mark(string $original, array $settings, array $findings = [], bool $annotate = true, array $templateHeadings = []): array
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
            $stylesXp = null; $stylesXml = $zip->getFromName('word/styles.xml');
            if ($stylesXml !== false && stripos($stylesXml, '<!DOCTYPE') === false) {
                $stylesDoc = new DOMDocument;
                if (@$stylesDoc->loadXML($stylesXml, LIBXML_NONET)) { $stylesXp = new DOMXPath($stylesDoc); $stylesXp->registerNamespace('w', self::W); }
            }
            $paragraphs = iterator_to_array($xp->query('//w:body//w:p'));
            $templateHeadingKeys = [];
            foreach ($templateHeadings as $heading) $templateHeadingKeys[mb_strtolower(preg_replace('/\s+/u', ' ', trim((string) $heading)))] = true;
            $notes = []; $issues = []; $abstract = false; $cv = false; $appendices = false;
            foreach ($paragraphs as $index => $p) {
                $text = ''; foreach ($xp->query('.//w:t', $p) as $t) $text .= $t->textContent;
                $text = trim($text); if ($text === '') continue;
                if (preg_match('/^APPENDI(?:X|CES)\b/i', $text)) $appendices = true;
                if ((preg_match('/curriculum\s+vitae/i', $text) && mb_strlen($text) < 140) || ($appendices && strtoupper($text) === 'PERSONAL INFORMATION' && !empty($settings['cv']))) $cv = true;
                $isHeading = strtoupper($text) === 'ABSTRACT';
                if ($isHeading) $abstract = true;
                elseif (preg_match('/^(CHAPTER\s|TABLE OF CONTENTS|LIST OF|ACKNOWLEDGEMENT|REFERENCES|APPENDICES)/i', $text)) $abstract = false;
                if ($xp->query('ancestor::w:tbl | ancestor::w:txbxContent | .//w:drawing | .//w:pict | .//w:object', $p)->length) continue;
                $target = $abstract && !$isHeading ? ($settings['abstract'] ?? $settings['spacing']) : $settings['spacing'];
                if ($cv) $target = $settings['cv']['spacing'] ?? $target;
                $headingKey = mb_strtolower(preg_replace('/\s+/u', ' ', $text));
                if ($target !== null && !isset($templateHeadingKeys[$headingKey])) {
                    $actual = $this->lineSpacing($p, $xp, $stylesXp);
                    if ($actual !== null && abs($actual - $target) > .02) {
                        $message = 'Line spacing is '.round($actual, 2).'; the selected admin template requires '.$target.'.';
                        $notes[$index][] = $message; $issues[] = ['paragraph' => $index + 1, 'type' => 'spacing', 'message' => $message];
                    }
                }
            }
            $sectionStart = 0;
            foreach ($xp->query('//w:sectPr') as $sectionIndex => $section) {
                $sectionEnd = count($paragraphs) - 1;
                $owner = $section->parentNode?->parentNode;
                if ($owner instanceof DOMElement && $owner->localName === 'p') $sectionEnd = array_search($owner, $paragraphs, true);
                $sectionFirst = null;
                for ($i = $sectionStart; $i <= $sectionEnd; $i++) if ($this->paragraphText($paragraphs[$i]) !== '') { $sectionFirst = $i; break; }
                $sectionStart = $sectionEnd + 1;
                $margin = $xp->query('./w:pgMar', $section)->item(0);
                if (!$margin) continue;
                foreach ($settings['margins'] as $side => $target) {
                    if (!$margin->hasAttributeNS(self::W, $side)) continue;
                    $actual = (float) $margin->getAttributeNS(self::W, $side) / 1440;
                    if (abs($actual - $target) <= .01) continue;
                    $message = 'Section '.($sectionIndex + 1).' '.$side.' margin is '.round($actual, 2).' inches; template requires '.$target.' inches.';
                    if ($sectionFirst !== null) $notes[$sectionFirst][] = $message;
                    $issues[] = ['paragraph' => ($sectionFirst ?? -1) + 1, 'type' => 'margin', 'message' => $message];
                }
            }
            foreach ($findings as $finding) {
                if (($finding['status'] ?? '') !== 'fail') continue;
                $index = (int) ($finding['paragraph'] ?? 0) - 1;
                $message = 'AI review (advisory): '.($finding['rule'] ?? 'Checklist rule').': '.$finding['explanation'];
                if ($index >= 0 && isset($paragraphs[$index])) $notes[$index][] = $message;
                else $message .= ' No exact paragraph was identified.';
                if (!empty($finding['suggestion'])) $message .= ' Suggestion: '.$finding['suggestion'];
                if (in_array($finding['measurement_type'] ?? '', ['spacing', 'margin'], true)) continue; // Already located by the structural checks above.
                $issues[] = ['paragraph' => max(0, $index + 1), 'type' => $finding['measurement_type'] ?? 'content', 'issue_kind' => $finding['issue_kind'] ?? null, 'message' => $message];
            }
            foreach ($paragraphs as $index => $p) {
                $text = $this->paragraphText($p);
                if ($xp->query('ancestor::w:tbl | .//w:tab', $p)->length || preg_match('/^TOC/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p))) continue;
                if (!preg_match('/^Appendix\s+([A-Z])(?:\s*[-:.]\s*(.+))?$/i', $text, $m)) continue;
                $letter = strtoupper($m[1]);
                $actual = trim($m[2] ?? '');
                $targetIndex = $index;
                $separateTitle = AppendixTitleLocator::find($p, $xp);
                if ($separateTitle) {
                    $actual = AppendixTitleLocator::text($separateTitle, $xp);
                    $targetIndex = array_search($separateTitle, $paragraphs, true);
                }
                $matches = array_keys(array_filter($settings['appendix_titles'] ?? [], fn ($name) => $name !== null && mb_strtolower(trim($name)) === mb_strtolower(trim($actual))));
                $expectedLetter = count($matches) === 1 && preg_match('/curriculum\s+vitae/i', $actual) ? $matches[0] : $letter;
                $expected = $settings['appendix_titles'][$expectedLetter] ?? null;
                if (!$expected) continue;
                if ($expectedLetter === $letter && mb_strtolower(trim($actual)) === mb_strtolower(trim($expected))) continue;
                $message = $expectedLetter !== $letter ? 'The selected template places "'.$expected.'" in Appendix '.$expectedLetter.', not Appendix '.$letter.'.' : 'Appendix '.$letter.' title should be "'.$expected.'" according to the selected admin template.';
                $notes[$targetIndex][] = $message;
                $issues[] = ['paragraph' => $targetIndex + 1, 'type' => 'appendix-title', 'message' => $message];
            }
            $headingKey = static fn (string $text) => mb_strtolower(trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text)));
            $templateHeadingKeys = [];
            foreach ($templateHeadings as $heading) $templateHeadingKeys[$headingKey((string) $heading)] = true;
            $seenHeadings = []; $headingScope = 'front';
            foreach ($paragraphs as $index => $paragraph) {
                $text = $this->paragraphText($paragraph);
                $style = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph);
                if (preg_match('/^TOC/i', $style) || $xp->query('./w:pPr/w:tabs/w:tab[@w:leader="dot"] | .//w:tab', $paragraph)->length || preg_match('/\.{3,}/', $text)) continue;
                $key = $headingKey($text);
                if (preg_match('/^CHAPTER\s+(?:\d+|[IVX]+|ONE|TWO|THREE|FOUR|FIVE)\b/i', $text) || preg_match('/^APPENDIX\s+[A-Z](?:\s*[-:.]|$)/i', $text)) $headingScope = $key;
                if ($key === '' || !isset($templateHeadingKeys[$key])) continue;
                $scopedKey = $headingScope.'|'.$key;
                if (!isset($seenHeadings[$scopedKey])) { $seenHeadings[$scopedKey] = $index + 1; continue; }
                $message = 'Duplicate heading: '.$text.'. The same heading already appears at paragraph '.$seenHeadings[$scopedKey].' in this section; capitalization does not make it a different heading. Review both sections before removing or merging content.';
                $issues[] = ['paragraph' => $index + 1, 'type' => 'content', 'issue_kind' => 'duplicate_heading', 'message' => $message];
                $notes[$index][] = $message;
            }
            $existingHeadingKeys = [];
            foreach ($paragraphs as $paragraph) {
                $style = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph);
                if (preg_match('/^TOC/i', $style) || $xp->query('./w:pPr/w:tabs/w:tab[@w:leader="dot"] | .//w:tab', $paragraph)->length) continue;
                $key = $headingKey($this->paragraphText($paragraph));
                if ($key !== '') $existingHeadingKeys[$key] = true;
            }
            foreach ($templateHeadings as $heading) {
                $heading = trim((string) $heading);
                $key = $headingKey($heading);
                if ($key === '' || isset($existingHeadingKeys[$key])) continue;
                $message = 'Admin template heading is missing: '.$heading.'.';
                $paragraphNumber = 0;
                if ($annotate) {
                    $placeholder = $doc->createElementNS(self::W, 'w:p');
                    $run = $doc->createElementNS(self::W, 'w:r');
                    $runProperties = $doc->createElementNS(self::W, 'w:rPr');
                    $highlight = $doc->createElementNS(self::W, 'w:highlight');
                    $highlight->setAttributeNS(self::W, 'w:val', 'yellow');
                    $runProperties->appendChild($highlight); $run->appendChild($runProperties);
                    $textNode = $doc->createElementNS(self::W, 'w:t');
                    $textNode->textContent = '[Missing template heading: '.$heading.']';
                    $run->appendChild($textNode); $placeholder->appendChild($run);
                    $body = $xp->query('/w:document/w:body')->item(0);
                    $sectionProperties = $body ? $xp->query('./w:sectPr', $body)->item(0) : null;
                    if (!$body) throw new InvalidArgumentException('The Word document has no body.');
                    $body->insertBefore($placeholder, $sectionProperties);
                    $paragraphNumber = count($paragraphs) + 1;
                    $paragraphs[] = $placeholder;
                    $notes[$paragraphNumber - 1][] = $message;
                }
                $issues[] = ['paragraph' => $paragraphNumber, 'type' => 'content', 'issue_kind' => 'missing_section', 'message' => $message];
                $existingHeadingKeys[$key] = true;
            }
            if (!$annotate) return ['issues' => $issues];
            foreach ($notes as $index => $messages) {
                $p = $paragraphs[$index];
                foreach (iterator_to_array($xp->query('.//w:r[w:t]', $p)) as $run) {
                    $pr = $this->child($run, 'rPr', true);
                    $highlight = $this->child($pr, 'highlight'); $highlight->setAttributeNS(self::W, 'w:val', 'yellow');
                }
            }
            $objects = $this->detectObjects($xp, $paragraphs);
            foreach ($objects as $object) $notes[$object['paragraph'] - 1] ??= [];
            // Bookmarks preserve exact locations without inserting text or shifting pages.
            $nextId = 0;
            foreach ($xp->query('//w:bookmarkStart') as $bookmark) $nextId = max($nextId, (int) $bookmark->getAttributeNS(self::W, 'id') + 1);
            $prefix = 'dvIssue_'.bin2hex(random_bytes(4)).'_'; $anchors = [];
            foreach (array_keys($notes) as $index) {
                $p = $paragraphs[$index]; $anchor = $prefix.($index + 1); $anchors[$index + 1] = $anchor;
                $start = $doc->createElementNS(self::W, 'w:bookmarkStart');
                $start->setAttributeNS(self::W, 'w:id', (string) $nextId); $start->setAttributeNS(self::W, 'w:name', $anchor);
                $pr = $xp->query('./w:pPr', $p)->item(0);
                $p->insertBefore($start, $pr ? $pr->nextSibling : $p->firstChild);
                $end = $p->appendChild($doc->createElementNS(self::W, 'w:bookmarkEnd')); $end->setAttributeNS(self::W, 'w:id', (string) $nextId++);
            }
            foreach ($issues as &$issue) $issue['anchor'] = $anchors[$issue['paragraph']] ?? null;
            unset($issue);
            foreach ($objects as &$object) $object['anchor'] = $anchors[$object['paragraph']] ?? null;
            unset($object);
            $zip->addFromString('word/document.xml', $doc->saveXML()); $zip->close(); $opened = false;
            return ['document_base64' => base64_encode(file_get_contents($path)), 'issues' => $issues, 'objects' => $objects];
        } finally { if ($opened) $zip->close(); @unlink($path); }
    }

    private function detectObjects(DOMXPath $xp, array $paragraphs): array
    {
        $objects = []; $matched = [];
        $caption = function (DOMElement $node, string $kind): ?DOMElement {
            if ($node->localName === 'p' && preg_match('/^'.$kind.'\s+\d+(?:[.:-]|\s|$)/i', $this->paragraphText($node))) return $node;
            foreach (['previousSibling', 'nextSibling'] as $direction) {
                $other = $node->$direction; $steps = 0;
                while ($other && $steps++ < 12) {
                    if ($other instanceof DOMElement) {
                        if ($other->localName !== 'p') break;
                        $text = $this->paragraphText($other);
                        if ($text !== '') { if (preg_match('/^'.$kind.'\s+\d+(?:[.:-]|\s|$)/i', $text)) return $other; break; }
                    }
                    $other = $other->$direction;
                }
            }
            return null;
        };
        foreach ($xp->query('//w:body//w:tbl | //w:body//w:p[w:r/w:drawing or w:r/w:pict]') as $node) {
            $table = $node->localName === 'tbl';
            $p = $table ? $xp->query('.//w:p', $node)->item(0) : $node;
            if (!$p) continue;
            $label = $caption($node, $table ? 'Table' : 'Figure');
            if ($label) $matched[array_search($label, $paragraphs, true)] = true;
            $type = $table ? 'table' : ($label ? 'figure' : 'image');
            $message = $table ? 'Word table detected.' : ($label ? 'Graphic with a nearby figure caption detected.' : 'Image or drawing detected; its use as a research figure is not confirmed. It may be a logo or decorative image.');
            $message .= $label ? ' Caption: '.$this->paragraphText($label) : ' No nearby '.($table ? 'table' : 'figure').' caption was identified. Review against the admin checklist.';
            $objects[] = ['paragraph' => array_search($p, $paragraphs, true) + 1, 'type' => $type, 'message' => $message];
        }
        foreach ($paragraphs as $index => $p) {
            if (isset($matched[$index]) || $xp->query('ancestor::w:tbl', $p)->length) continue;
            if (!preg_match('/^(Figure|Table)\s+\d+(?:[.:-]|\s|$)/i', $this->paragraphText($p), $match)) continue;
            $objects[] = ['paragraph' => $index + 1, 'type' => 'caption', 'message' => $match[1].' caption detected, but no adjacent '.(strtolower($match[1]) === 'table' ? 'Word table' : 'graphic').' was matched. Confirm whether the object is present or stored as an image. Caption: '.$this->paragraphText($p)];
        }
        return $objects;
    }

    private function paragraphText(DOMElement $p): string
    {
        $text = ''; foreach ($p->getElementsByTagNameNS(self::W, 't') as $t) $text .= $t->textContent;
        return trim($text);
    }

    private function lineSpacing(DOMElement $paragraph, DOMXPath $xp, ?DOMXPath $stylesXp): ?float
    {
        $check = function (?DOMXPath $query, ?DOMElement $properties): ?float {
            if (!$query || !$properties) return null;
            $spacing = $query->query('./w:spacing[@w:line]', $properties)->item(0);
            if (!$spacing || !in_array($spacing->getAttributeNS(self::W, 'lineRule'), ['', 'auto'], true)) return null;
            $line = $spacing->getAttributeNS(self::W, 'line');
            return is_numeric($line) ? (float) $line / 240 : null;
        };
        $paragraphProperties = $xp->query('./w:pPr', $paragraph)->item(0);
        $actual = $check($xp, $paragraphProperties instanceof DOMElement ? $paragraphProperties : null);
        if ($actual !== null) return $actual;
        if ($stylesXp) {
            $styleId = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph);
            $seen = [];
            while ($styleId !== '' && !isset($seen[$styleId])) {
                $seen[$styleId] = true; $style = null;
                foreach ($stylesXp->query('//w:style') as $candidate) {
                    if ($candidate instanceof DOMElement && $candidate->getAttributeNS(self::W, 'styleId') === $styleId) { $style = $candidate; break; }
                }
                if (!$style) break;
                $actual = $check($stylesXp, $stylesXp->query('./w:pPr', $style)->item(0));
                if ($actual !== null) return $actual;
                $styleId = $stylesXp->evaluate('string(./w:basedOn/@w:val)', $style);
            }
            $normal = $stylesXp->query('//w:style[@w:styleId="Normal"]/w:pPr')->item(0);
            $actual = $check($stylesXp, $normal instanceof DOMElement ? $normal : null);
            if ($actual !== null) return $actual;
            $defaults = $stylesXp->query('//w:docDefaults/w:pPrDefault/w:pPr')->item(0);
            $actual = $check($stylesXp, $defaults instanceof DOMElement ? $defaults : null);
            if ($actual !== null) return $actual;
        }
        return null;
    }

    private function child(DOMElement $parent, string $name, bool $first = false): DOMElement
    {
        foreach ($parent->childNodes as $child) if ($child instanceof DOMElement && $child->localName === $name && $child->namespaceURI === self::W) return $child;
        $child = $parent->ownerDocument->createElementNS(self::W, 'w:'.$name);
        $parent->insertBefore($child, $first ? $parent->firstChild : null); return $child;
    }
}
