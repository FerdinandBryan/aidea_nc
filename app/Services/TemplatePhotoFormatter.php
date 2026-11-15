<?php

namespace App\Services;

use DOMElement;
use DOMXPath;

/** Fill an explicitly named template photograph slot with the student's existing picture. */
class TemplatePhotoFormatter
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function apply(DOMXPath $student, DOMXPath $reference): array
    {
        $result = ['warnings' => [], 'mapping' => []];
        $text = static fn (DOMElement $p, DOMXPath $xp) => trim(implode('', array_map(fn ($t) => $t->textContent, iterator_to_array($xp->query('.//w:t', $p)))));
        $normalize = static fn (string $value) => mb_strtolower(trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value)));
        $slots = [];
        foreach ($reference->query('/w:document/w:body/w:p') as $heading) {
            if ($text($heading, $reference) === '') continue;
            for ($node = $heading->nextSibling; $node; $node = $node->nextSibling) {
                if (!$node instanceof DOMElement) continue;
                if ($node->localName === 'p' && $text($node, $reference) === '') continue;
                if ($node->localName === 'tbl' && $reference->query('.//w:tc', $node)->length === 1 && preg_match('/\b(photo(?:graph)?|picture|image)\b/i', $text($node, $reference)) && !$reference->query('.//w:drawing | .//w:pict | .//w:object', $node)->length) $slots[$normalize($text($heading, $reference))][] = $node;
                break;
            }
        }
        if (!$slots) return $result;
        foreach (iterator_to_array($student->query('/w:document/w:body/w:p')) as $heading) {
            $matches = $slots[$normalize($text($heading, $student))] ?? [];
            if (!$matches) continue;
            if (count(array_unique(array_map(fn ($slot) => $slot->C14N(), $matches))) !== 1) {
                $result['warnings'][] = 'The template has ambiguous photo slots under this heading; review placement manually.';
                continue;
            }
            $slot = $matches[0];
            $width = (float) $reference->evaluate('string(.//w:tcW[@w:type="dxa"]/@w:w)', $slot);
            $height = (float) $reference->evaluate('string(.//w:trHeight/@w:val)', $slot);
            if ($width <= 0 || $height <= 0) {
                $result['warnings'][] = 'The template photo slot has no explicit dimensions; review photo placement manually.';
                continue;
            }
            $pictures = []; $containers = [];
            for ($node = $heading; $node; $node = $node->nextSibling) {
                if (!$node instanceof DOMElement) continue;
                $value = $text($node, $student);
                if ($node !== $heading && ($node->localName === 'sectPr' || isset($slots[$normalize($value)]) || $student->query('./w:pPr/w:outlineLvl[@w:val="0"]', $node)->length)) break;
                foreach ($student->query('.//w:drawing[.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"]] | .//w:pict[.//*[local-name()="imagedata"]]', $node) as $picture) {
                    $pictures[] = $picture; $containers[] = $node;
                }
            }
            if (count($pictures) !== 1) {
                $result['warnings'][] = count($pictures) ? 'This template section contains multiple pictures; identify the intended photo before placing it in the slot.' : 'No embedded photograph was found for this template slot.';
                continue;
            }
            $picture = $pictures[0]; $original = $containers[0];
            $extent = $student->query('.//*[local-name()="extent"]', $picture)->item(0);
            if (!$extent || (float) $extent->getAttribute('cx') <= 0 || (float) $extent->getAttribute('cy') <= 0 || ((float) $extent->getAttribute('cx') > $width * 635 * 2 && (float) $extent->getAttribute('cy') > $height * 635 * 2)) {
                $result['warnings'][] = 'The image cannot be confidently identified as the photo intended for this template slot. Its size and placement were preserved for review.';
                continue;
            }
            $copy = $student->document->importNode($slot, true);
            $cell = $student->query('.//w:tc', $copy)->item(0);
            foreach (iterator_to_array($cell->childNodes) as $child) if (!$child instanceof DOMElement || $child->localName !== 'tcPr') $cell->removeChild($child);
            $p = $student->document->createElementNS(self::W, 'w:p');
            $sourcePr = $reference->query('.//w:tc/w:p[1]/w:pPr', $slot)->item(0);
            if ($sourcePr) $p->appendChild($student->document->importNode($sourcePr, true));
            $scale = min($width * 635 / (float) $extent->getAttribute('cx'), $height * 635 / (float) $extent->getAttribute('cy'));
            $photoWidth = (float) $extent->getAttribute('cx') * $scale;
            $photoHeight = (float) $extent->getAttribute('cy') * $scale;
            $run = $student->document->createElementNS(self::W, 'w:r');
            $run->appendChild($picture); $p->appendChild($run); $cell->appendChild($p);
            // Floating pictures need an inline container inside the photo cell.
            foreach (iterator_to_array($student->query('./*[local-name()="anchor"]', $picture)) as $anchor) {
                $inline = $student->document->createElementNS($anchor->namespaceURI, 'wp:inline');
                foreach (['extent', 'effectExtent', 'docPr', 'cNvGraphicFramePr', 'graphic'] as $name) foreach (iterator_to_array($student->query('./*[local-name()="'.$name.'"]', $anchor)) as $child) $inline->appendChild($child);
                $picture->replaceChild($inline, $anchor);
            }
            foreach ($student->query('.//*[local-name()="extent" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"] | .//*[local-name()="pic"]//*[local-name()="xfrm"]/*[local-name()="ext"]', $picture) as $extent) {
                $extent->setAttribute('cx', (string) round($photoWidth)); $extent->setAttribute('cy', (string) round($photoHeight));
            }
            foreach ($student->query('.//*[local-name()="shape"]', $picture) as $shape) {
                $style = preg_replace('/(?:^|;)\s*(?:width|height|position|margin-left|margin-top)\s*:[^;]*/i', '', $shape->getAttribute('style'));
                $shape->setAttribute('style', trim($style, ';').';width:'.($width / 20).'pt;height:'.($height / 20).'pt');
            }
            $heading->parentNode->insertBefore($copy, $heading->nextSibling);
            if ($original !== $heading && $text($original, $student) === '' && !$student->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr | .//w:bookmarkStart | .//w:fldChar', $original)->length) $original->parentNode->removeChild($original);
            $result['mapping'][] = ['paragraph' => $text($heading, $student), 'template_paragraph' => $text($slot, $reference), 'match' => 'template-photo-slot'];
        }
        return $result;
    }
}
