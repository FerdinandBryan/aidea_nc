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

    public function mark(string $original, array $settings, array $findings = [], bool $annotate = true): array
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

    private function child(DOMElement $parent, string $name, bool $first = false): DOMElement
    {
        foreach ($parent->childNodes as $child) if ($child instanceof DOMElement && $child->localName === $name && $child->namespaceURI === self::W) return $child;
        $child = $parent->ownerDocument->createElementNS(self::W, 'w:'.$name);
        $parent->insertBefore($child, $first ? $parent->firstChild : null); return $child;
    }
}
