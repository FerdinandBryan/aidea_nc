<?php

namespace App\Services;

use DOMElement;
use DOMXPath;

/** Copy compatible table formatting without replacing cells, text or relationships. */
class TemplateTableFormatter
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function apply(DOMXPath $student, DOMXPath $reference, array $studentContexts, array $referenceContexts): array
    {
        $result = ['warnings' => [], 'mapping' => []];
        $groups = [];
        foreach ($reference->query('/w:document/w:body/w:tbl') as $table) {
            if (!$this->compatible($table, $reference)) continue;
            $groups[$this->key($table, $reference, $referenceContexts)][] = $table;
        }
        foreach ($student->query('/w:document/w:body/w:tbl') as $target) {
            if (!$this->compatible($target, $student)) {
                $result['warnings'][] = 'A table contains merged cells, nested tables, fields or embedded objects; its layout requires review.';
                continue;
            }
            $sources = $groups[$this->key($target, $student, $studentContexts)] ?? [];
            $headerKey = $this->headerKey($target, $student);
            $sameHeaders = array_values(array_filter($sources, fn ($table) => $this->headerKey($table, $reference) === $headerKey));
            if ($sameHeaders) $sources = $sameHeaders;
            if (!$sources || count(array_unique(array_map(fn ($table) => $this->signature($table, $reference), $sources))) !== 1) {
                $result['warnings'][] = 'No unique compatible template table layout matched this chapter and column structure.';
                continue;
            }
            $source = $sources[0];
            $this->properties($source, $target, ['tblPr', 'tblGrid']);
            $sourceRows = iterator_to_array($reference->query('./w:tr', $source));
            $header = $reference->query('./w:trPr/w:tblHeader', $sourceRows[0])->length > 0;
            $bodyRows = array_slice($sourceRows, $header ? 1 : 0);
            // A header-only example does not establish the appearance of body rows.
            $uniformBody = $bodyRows && count(array_unique(array_map(fn ($row) => $this->rowSignature($row, $reference), $bodyRows))) === 1;
            foreach ($student->query('./w:tr', $target) as $index => $row) {
                $sample = $header && $index === 0 ? $sourceRows[0] : ($uniformBody ? $bodyRows[0] : null);
                if (!$sample) {
                    $result['warnings'][] = 'Template table body rows have no uniform formatting example; review the cell text formatting.';
                    continue;
                }
                // Copy repeat-header semantics, but not row heights that could clip text.
                foreach (iterator_to_array($student->query('./w:trPr/w:tblHeader', $row)) as $node) $node->parentNode->removeChild($node);
                if ($reference->query('./w:trPr/w:tblHeader', $sample)->length) {
                    $properties = $student->query('./w:trPr', $row)->item(0);
                    if (!$properties) { $properties = $row->ownerDocument->createElementNS(self::W, 'w:trPr'); $row->insertBefore($properties, $row->firstChild); }
                    $properties->appendChild($row->ownerDocument->importNode($reference->query('./w:trPr/w:tblHeader', $sample)->item(0), true));
                }
                $sourceCells = iterator_to_array($reference->query('./w:tc', $sample));
                foreach ($student->query('./w:tc', $row) as $column => $cell) {
                    $sampleCell = $sourceCells[$column];
                    $this->properties($sampleCell, $cell, ['tcPr']);
                    $paragraphs = iterator_to_array($reference->query('./w:p', $sampleCell));
                    if (!$paragraphs || count(array_unique(array_map(fn ($p) => $this->paragraphSignature($p, $reference), $paragraphs))) !== 1) continue;
                    $paragraph = $paragraphs[0];
                    foreach ($student->query('./w:p', $cell) as $targetParagraph) {
                        $this->properties($paragraph, $targetParagraph, ['pPr']);
                        $sampleRun = $reference->query('./w:r[w:t][1]', $paragraph)->item(0);
                        if (!$sampleRun) continue;
                        foreach ($student->query('./w:r[w:t]', $targetParagraph) as $run) $this->properties($sampleRun, $run, ['rPr']);
                    }
                }
            }
            $result['mapping'][] = ['paragraph' => 'Table', 'template_paragraph' => 'Compatible table in '.$this->key($source, $reference, $referenceContexts), 'match' => 'table-layout'];
        }
        return $result;
    }

    private function compatible(DOMElement $table, DOMXPath $xp): bool
    {
        if ($xp->query('.//w:gridSpan | .//w:vMerge | .//w:hMerge | .//w:tbl | .//w:drawing | .//w:pict | .//w:object | .//w:fldChar | .//w:fldSimple | .//w:sectPr | .//w:hyperlink | .//w:numPr', $table)->length) return false;
        $counts = [];
        foreach ($xp->query('./w:tr', $table) as $row) $counts[] = $xp->query('./w:tc', $row)->length;
        return $counts && min($counts) > 1 && count(array_unique($counts)) === 1;
    }

    private function key(DOMElement $table, DOMXPath $xp, array $contexts): string
    {
        $context = '';
        for ($p = $table->previousSibling; $p; $p = $p->previousSibling) {
            if ($p instanceof DOMElement && isset($contexts[spl_object_id($p)])) { $context = $contexts[spl_object_id($p)]; break; }
        }
        // Appendix and bibliography tables must not borrow a chapter's data table.
        for ($p = $table->previousSibling; $p; $p = $p->previousSibling) {
            if (!$p instanceof DOMElement || $p->localName !== 'p') continue;
            $text = trim($p->textContent);
            if (preg_match('/^CHAPTER\s/i', $text)) break;
            if (preg_match('/^(APPENDI(?:X|CES)\b|REFERENCES$)/i', $text)) { $context .= ':section:'.mb_strtolower(preg_replace('/\s+/u', ' ', $text)); break; }
        }
        return $context.':columns:'.$xp->query('./w:tr[1]/w:tc', $table)->length;
    }

    private function headerKey(DOMElement $table, DOMXPath $xp): string
    {
        $cells = [];
        foreach ($xp->query('./w:tr[1]/w:tc', $table) as $cell) $cells[] = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $cell->textContent)));
        return json_encode($cells);
    }

    private function signature(DOMElement $table, DOMXPath $xp): string
    {
        $parts = [];
        foreach ($xp->query('./w:tblPr | ./w:tblGrid', $table) as $node) $parts[] = $node->C14N();
        $rows = [];
        foreach ($xp->query('./w:tr', $table) as $row) $rows[] = $this->rowSignature($row, $xp);
        foreach (array_unique($rows) as $row) $parts[] = $row;
        return implode('|', $parts);
    }

    private function rowSignature(DOMElement $row, DOMXPath $xp): string
    {
        $parts = [];
        foreach ($xp->query('./w:trPr/w:tblHeader | ./w:tc/w:tcPr | ./w:tc/w:p/w:pPr | ./w:tc/w:p/w:r[w:t][1]/w:rPr', $row) as $node) $parts[] = $node->C14N();
        return implode('|', $parts);
    }

    private function paragraphSignature(DOMElement $p, DOMXPath $xp): string
    {
        $parts = [];
        foreach ($xp->query('./w:pPr | ./w:r[w:t][1]/w:rPr', $p) as $node) $parts[] = $node->C14N();
        return implode('|', $parts);
    }

    private function properties(DOMElement $source, DOMElement $target, array $names): void
    {
        foreach (array_reverse($names) as $name) {
            foreach (iterator_to_array($target->childNodes) as $node) if ($node instanceof DOMElement && $node->namespaceURI === self::W && $node->localName === $name) $target->removeChild($node);
            foreach ($source->childNodes as $node) if ($node instanceof DOMElement && $node->namespaceURI === self::W && $node->localName === $name) $target->insertBefore($target->ownerDocument->importNode($node, true), $target->firstChild);
        }
    }
}
