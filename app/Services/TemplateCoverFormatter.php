<?php

namespace App\Services;

use DOMElement;
use DOMXPath;

/** Fill paragraph-based template cover blocks without assigning content by row number. */
class TemplateCoverFormatter
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function apply(DOMXPath $student, DOMXPath $reference, array $studentRoles, array $referenceRoles): array
    {
        $result = ['applied' => false, 'processed' => 0, 'warnings' => [], 'mapping' => []];
        $target = $this->cover($student, $studentRoles);
        $source = $this->cover($reference, $referenceRoles);
        if (!$source || !$target) return $result;
        $sourceGroups = $this->groups($source, $reference);
        $targetGroups = $this->groups($target, $student);
        // A single title needs normal paragraph formatting, not cover reconstruction.
        if (count($sourceGroups) < 3 || count($targetGroups) < 3) return $result;
        foreach (array_merge($source, $target) as $p) {
            $xp = $p->ownerDocument === $student->document ? $student : $reference;
            if ($xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:fldChar | .//w:fldSimple | .//w:sectPr | .//w:hyperlink | .//w:footnoteReference | .//w:endnoteReference | .//w:br[@w:type="page"] | ./w:pPr/w:numPr', $p)->length) {
                $result['warnings'][] = 'The cover contains graphics, fields or section layout requiring review; its content was preserved.';
                return $result;
            }
        }

        $anchors = [];
        foreach ($targetGroups as $i => $group) {
            $matches = [];
            foreach ($sourceGroups as $j => $candidate) {
                if (array_intersect($group['keys'], $candidate['keys'])) $matches[] = $j;
            }
            if (count($matches) === 1) $anchors[$i] = $matches[0];
        }
        $assignments = []; $last = -1;
        foreach ($targetGroups as $i => $group) {
            $next = count($sourceGroups);
            foreach ($anchors as $anchorIndex => $sourceIndex) if ($anchorIndex > $i) { $next = $sourceIndex; break; }
            if (isset($anchors[$i])) $chosen = $anchors[$i];
            else {
                $candidates = [];
                for ($j = $last + 1; $j < $next; $j++) {
                    if ($sourceGroups[$j]['format'] === $group['format']) $candidates[] = $j;
                }
                $chosen = $candidates[0] ?? null;
                if ($chosen === null && $next - $last === 2) $chosen = $last + 1;
            }
            if ($chosen === null || $chosen <= $last || $chosen >= count($sourceGroups)) {
                $result['warnings'][] = 'The cover blocks could not be matched without moving or removing student content. Review the title-page fields against the template.';
                return $result;
            }
            $assignments[$chosen] = $group; $last = $chosen;
        }

        $replacements = [];
        foreach ($assignments as $index => $group) {
            $slots = $sourceGroups[$index]['paragraphs'];
            $lines = [];
            foreach ($group['paragraphs'] as $p) $lines = array_merge($lines, $this->lines($p, $student));
            if (count($slots) === 1) {
                $replacements[spl_object_id($slots[0])] = $lines;
            } else {
                foreach ($slots as $slotIndex => $slot) $replacements[spl_object_id($slot)] = isset($lines[$slotIndex]) ? [$lines[$slotIndex]] : [];
                // Extra authors/lines remain in the same block using the last slot's style.
                if (count($lines) > count($slots)) $replacements[spl_object_id($slots[count($slots) - 1])] = array_slice($lines, count($slots) - 1);
            }
            $result['mapping'][] = ['paragraph' => implode(' ', $lines), 'template_paragraph' => $this->text($slots[0], $reference), 'match' => 'cover-block'];
        }

        $insertBefore = $target[0]; $parent = $insertBefore->parentNode;
        foreach ($source as $p) {
            $copy = $student->document->importNode($p, true);
            foreach (iterator_to_array($student->query('.//w:bookmarkStart | .//w:bookmarkEnd | .//w:commentRangeStart | .//w:commentRangeEnd | .//w:commentReference', $copy)) as $bookmark) $bookmark->parentNode->removeChild($bookmark);
            $id = spl_object_id($p);
            if (array_key_exists($id, $replacements)) $this->fill($copy, $replacements[$id], $student);
            preg_match_all('/\[[^\[\]\r\n]+\]/u', $this->text($copy, $student), $fields);
            foreach ($fields[0] as $field) $result['warnings'][] = 'Unfilled template cover field: '.$field.'. Supply this value before using the final paper.';
            $parent->insertBefore($copy, $insertBefore);
            $result['processed']++;
        }
        foreach ($target as $p) $p->parentNode->removeChild($p);
        $result['applied'] = true;
        $result['warnings'] = array_values(array_unique($result['warnings']));
        return $result;
    }

    private function cover(DOMXPath $xp, array $roles): array
    {
        $last = null;
        foreach ($roles as $role => $paragraphs) if (str_starts_with($role, 'cover:')) $last = $paragraphs[count($paragraphs) - 1];
        if (!$last || $last->parentNode->localName !== 'body') return [];
        $paragraphs = [];
        foreach ($last->parentNode->childNodes as $node) {
            if (!$node instanceof DOMElement) continue;
            if ($node->namespaceURI !== self::W || $node->localName !== 'p') return [];
            $paragraphs[] = $node;
            if ($node->isSameNode($last)) break;
        }
        for ($next = $last->nextSibling; $next; $next = $next->nextSibling) {
            if (!$next instanceof DOMElement) continue;
            if ($next->localName !== 'p' || $this->text($next, $xp) !== '' || $xp->query('.//w:br | .//w:sectPr | .//w:drawing | .//w:pict | .//w:object', $next)->length) break;
            $paragraphs[] = $next;
        }
        return $paragraphs;
    }

    private function groups(array $paragraphs, DOMXPath $xp): array
    {
        $groups = []; $new = true;
        foreach ($paragraphs as $p) {
            $text = $this->text($p, $xp);
            if ($text === '') { $new = true; continue; }
            $bold = $xp->query('./w:r[w:t[normalize-space(.) != ""]][1]/w:rPr/w:b | ./w:pPr/w:rPr/w:b', $p)->item(0);
            $isBold = $bold && !in_array($bold->getAttributeNS(self::W, 'val'), ['0', 'false', 'off'], true);
            $align = $xp->evaluate('string(./w:pPr/w:jc/@w:val)', $p);
            $format = ($isBold ? 'bold' : 'plain').':'.$align;
            $index = count($groups) - 1;
            if ($new || $index < 0 || $groups[$index]['format'] !== $format) { $groups[] = ['paragraphs' => [], 'keys' => [], 'format' => $format]; $index++; }
            $groups[$index]['paragraphs'][] = $p;
            if (!str_contains($text, '[')) $groups[$index]['keys'][] = trim(mb_strtolower(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text)));
            $new = false;
        }
        return $groups;
    }

    private function lines(DOMElement $p, DOMXPath $xp): array
    {
        $lines = []; $line = '';
        foreach ($xp->query('.//w:t | .//w:br | .//w:cr', $p) as $node) {
            if ($node->localName === 't') $line .= $node->textContent;
            elseif ($line !== '') { $lines[] = trim($line); $line = ''; }
        }
        if (trim($line) !== '') $lines[] = trim($line);
        return $lines;
    }

    private function text(DOMElement $p, DOMXPath $xp): string
    {
        return trim(implode('', array_map(fn ($node) => $node->textContent, iterator_to_array($xp->query('.//w:t', $p)))));
    }

    private function fill(DOMElement $p, array $lines, DOMXPath $xp): void
    {
        $runProperties = $xp->query('./w:r[w:t][1]/w:rPr', $p)->item(0)?->cloneNode(true);
        foreach (iterator_to_array($p->childNodes) as $child) if (!$child instanceof DOMElement || $child->localName !== 'pPr') $p->removeChild($child);
        foreach ($lines as $index => $line) {
            $run = $p->ownerDocument->createElementNS(self::W, 'w:r');
            if ($runProperties) $run->appendChild($runProperties->cloneNode(true));
            if ($index) $run->appendChild($p->ownerDocument->createElementNS(self::W, 'w:br'));
            $text = $p->ownerDocument->createElementNS(self::W, 'w:t'); $text->textContent = $line;
            $run->appendChild($text); $p->appendChild($run);
        }
    }
}
