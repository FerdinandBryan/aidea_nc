<?php

namespace App\Services;

use DOMElement;
use DOMXPath;

/** Fill an explicit CV photograph slot with the student's existing picture. */
class TemplateCvPhotoFormatter
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function apply(DOMXPath $student, DOMXPath $reference): array
    {
        $result = ['warnings' => [], 'mapping' => []];
        $text = static fn (DOMElement $p, DOMXPath $xp) => trim(implode('', array_map(fn ($t) => $t->textContent, iterator_to_array($xp->query('.//w:t', $p)))));
        $isCv = static fn (string $value) => (bool) preg_match('/^curriculum\s+vitae\s*[:.]?$/iu', $value);
        $slots = [];
        foreach ($reference->query('/w:document/w:body/w:p') as $heading) {
            if (!$isCv($text($heading, $reference))) continue;
            for ($node = $heading->nextSibling; $node; $node = $node->nextSibling) {
                if (!$node instanceof DOMElement) continue;
                if ($node->localName === 'p' && $text($node, $reference) === '') continue;
                if ($node->localName === 'tbl' && $reference->query('.//w:tc', $node)->length === 1 && preg_match('/\b(photo(?:graph)?|picture|image)\b/i', $text($node, $reference)) && !$reference->query('.//w:drawing | .//w:pict | .//w:object', $node)->length) $slots[] = $node;
                break;
            }
        }
        if (!$slots) return $result;
        $signatures = array_unique(array_map(fn ($slot) => $slot->C14N(), $slots));
        if (count($signatures) > 1) {
            $result['warnings'][] = 'CV photograph slots differ in the template; review photo placement manually.';
            return $result;
        }
        $slot = $slots[0];
        $width = (float) $reference->evaluate('string(.//w:tcW[@w:type="dxa"]/@w:w)', $slot);
        $height = (float) $reference->evaluate('string(.//w:trHeight/@w:val)', $slot);
        if ($width <= 0 || $height <= 0) {
            $result['warnings'][] = 'The CV photo slot has no explicit dimensions; review photo placement manually.';
            return $result;
        }
        foreach (iterator_to_array($student->query('/w:document/w:body/w:p')) as $heading) {
            if (!$isCv($text($heading, $student))) continue;
            $pictures = []; $containers = [];
            for ($node = $heading; $node; $node = $node->nextSibling) {
                if (!$node instanceof DOMElement) continue;
                $value = $text($node, $student);
                if ($node !== $heading && ($node->localName === 'sectPr' || $isCv($value) || preg_match('/^APPENDIX\s+[A-Z]\b/i', $value))) break;
                foreach ($student->query('.//w:drawing[.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"]] | .//w:pict[.//*[local-name()="imagedata"]]', $node) as $picture) {
                    $pictures[] = $picture; $containers[] = $node;
                }
            }
            if (count($pictures) !== 1) {
                $result['warnings'][] = count($pictures) ? 'The CV contains multiple pictures; identify each author photo before placing it in the template slot.' : 'No embedded photograph was found in this CV. Supply the author photo for the template slot.';
                continue;
            }
            $picture = $pictures[0]; $original = $containers[0];
            $extent = $student->query('.//*[local-name()="extent"]', $picture)->item(0);
            if ($extent && ((float) $extent->getAttribute('cx') > 3200400 || (float) $extent->getAttribute('cy') > 3200400)) {
                $result['warnings'][] = 'The CV contains a large embedded image, which may be the complete CV rather than a portrait. Its content and size were preserved; review it against the template instead of shrinking it into the photo slot.';
                continue;
            }
            $copy = $student->document->importNode($slot, true);
            $cell = $student->query('.//w:tc', $copy)->item(0);
            foreach (iterator_to_array($cell->childNodes) as $child) if (!$child instanceof DOMElement || $child->localName !== 'tcPr') $cell->removeChild($child);
            $p = $student->document->createElementNS(self::W, 'w:p');
            $pr = $student->document->createElementNS(self::W, 'w:pPr');
            $spacing = $student->document->createElementNS(self::W, 'w:spacing');
            foreach (['before' => 0, 'after' => 0, 'line' => 240, 'lineRule' => 'auto'] as $name => $value) $spacing->setAttributeNS(self::W, 'w:'.$name, (string) $value);
            $pr->appendChild($spacing); $p->appendChild($pr);
            $run = $student->document->createElementNS(self::W, 'w:r');
            $run->appendChild($picture); $p->appendChild($run); $cell->appendChild($p);
            // Floating pictures need an inline container inside the photo cell.
            foreach (iterator_to_array($student->query('./*[local-name()="anchor"]', $picture)) as $anchor) {
                $inline = $student->document->createElementNS($anchor->namespaceURI, 'wp:inline');
                foreach (['extent', 'effectExtent', 'docPr', 'cNvGraphicFramePr', 'graphic'] as $name) foreach (iterator_to_array($student->query('./*[local-name()="'.$name.'"]', $anchor)) as $child) $inline->appendChild($child);
                $picture->replaceChild($inline, $anchor);
            }
            foreach ($student->query('.//*[local-name()="extent" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"] | .//*[local-name()="pic"]//*[local-name()="xfrm"]/*[local-name()="ext"]', $picture) as $extent) {
                $extent->setAttribute('cx', (string) round($width * 635)); $extent->setAttribute('cy', (string) round($height * 635));
            }
            foreach ($student->query('.//*[local-name()="shape"]', $picture) as $shape) {
                $style = preg_replace('/(?:^|;)\s*(?:width|height|position|margin-left|margin-top)\s*:[^;]*/i', '', $shape->getAttribute('style'));
                $shape->setAttribute('style', trim($style, ';').';width:'.($width / 20).'pt;height:'.($height / 20).'pt');
            }
            $heading->parentNode->insertBefore($copy, $heading->nextSibling);
            if ($original !== $heading && $text($original, $student) === '' && !$student->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr | .//w:bookmarkStart | .//w:fldChar', $original)->length) $original->parentNode->removeChild($original);
            $result['mapping'][] = ['paragraph' => $text($heading, $student), 'template_paragraph' => $text($slot, $reference), 'match' => 'cv-photo-slot'];
        }
        return $result;
    }
}
