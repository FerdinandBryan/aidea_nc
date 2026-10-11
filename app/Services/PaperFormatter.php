<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMXPath;
use InvalidArgumentException;
use ZipArchive;

/** Updates the DOCX package in place without rebuilding tables, images or text. */
class PaperFormatter
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function missingExtensions(): array
    {
        $missing = [];
        if (!class_exists(ZipArchive::class)) $missing[] = 'zip';
        if (!class_exists(DOMDocument::class)) $missing[] = 'dom';
        if (!function_exists('mb_strlen')) $missing[] = 'mbstring';
        return $missing;
    }

    public function settings(array $rules): array
    {
        $cfg = ['font' => null, 'size' => null, 'spacing' => null, 'abstract' => null,
            'alignment' => null, 'indentation' => null, 'hanging' => false,
            'margins' => [], 'width' => 12240, 'height' => 15840, 'headings' => []];
        foreach ($rules as $rule) {
            if (!is_array($rule)) throw new InvalidArgumentException('The template contains an invalid rule.');
            $text = preg_replace('/[^\x00-\x7F]+/', ' ', (string) ($rule['detail'] ?? $rule['name'] ?? ''));
            if (preg_match('/\bword\s+(REFERENCES|APPENDICES)\b/i', $text, $m)) {
                $heading = ['center' => (bool) preg_match('/cent(?:er|re)/i', $text), 'bold' => (bool) preg_match('/\bbold\b/i', $text)];
                if (preg_match('/font size\s*(\d+(?:\.\d+)?)/i', $text, $size)) $heading['size'] = (float) $size[1];
                $cfg['headings'][strtoupper($m[1])] = $heading;
                continue;
            }
            if (preg_match('/\b(Times New Roman|Arial|Calibri|Cambria|Georgia|Verdana)\b/i', $text, $m)) $cfg['font'] = ucwords(strtolower($m[1]));
            if (preg_match('/font size\b.*?(?:\bis\s+|[:=]?\s*)(\d+(?:\.\d+)?)/i', $text, $m) || preg_match('/\b(\d+(?:\.\d+)?)\s*(?:pt|point)\b/i', $text, $m)) $cfg['size'] = (float) $m[1];
            $spacing = null;
            if (preg_match('/double(?:[- ]+line)?[- ]*spac/i', $text)) $spacing = 2;
            elseif (preg_match('/single(?:[- ]+line)?[- ]*spac/i', $text)) $spacing = 1;
            elseif (preg_match('/\b(\d+(?:\.\d+)?)\s*(?:line\s*)?spac/i', $text, $m)) $spacing = (float) $m[1];
            if ($spacing !== null) $cfg[preg_match('/abstract/i', $text) ? 'abstract' : 'spacing'] = $spacing;
            if (preg_match('/margin/i', $text)) {
                if (preg_match('/\b(\d+(?:\.\d+)?)[- ]inch\s+margins?/i', $text, $m)) $cfg['margins'] = array_fill_keys(['top', 'bottom', 'left', 'right'], (float) $m[1]);
                foreach (['top', 'bottom', 'left', 'right'] as $side) {
                    if (preg_match('/'.$side.'\s*[:=\-]?\s*(\d+(?:\.\d+)?)/i', $text, $m)) $cfg['margins'][$side] = (float) $m[1];
                }
                if (preg_match('/top\s*and\s*bottom\s*[:=\-]?\s*(\d+(?:\.\d+)?)/i', $text, $m)) $cfg['margins']['top'] = $cfg['margins']['bottom'] = (float) $m[1];
            }
            if (preg_match('/\bA4\b/i', $text)) { $cfg['width'] = 11906; $cfg['height'] = 16838; }
            if (preg_match('/short bond|8\.5\s*(?:"|inches)?\s*(?:by|x)\s*11/i', $text)) { $cfg['width'] = 12240; $cfg['height'] = 15840; }
            if (!preg_match('/heading|title|abstract|references|appendices|table|figure/i', $text)) {
                if (preg_match('/\b(justified|justify|left[- ]aligned|right[- ]aligned|center[- ]aligned)\b/i', $text, $m)) $cfg['alignment'] = str_starts_with(strtolower($m[1]), 'just') ? 'both' : explode('-', str_replace(' ', '-', strtolower($m[1])))[0];
                if (preg_match('/(?:first[- ]line\s+indent(?:ation)?|indent(?:ation)?)\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(?:inch|in\b|")/i', $text, $m)) $cfg['indentation'] = (float) $m[1];
            }
            if (preg_match('/hanging inden/i', $text)) $cfg['hanging'] = true;
        }
        // Machine-readable template values override prose.
        foreach ($rules as $rule) {
            if (!array_key_exists('value', $rule) || $rule['value'] === null) continue;
            $type = strtolower((string) ($rule['type'] ?? ''));
            $value = $rule['value'];
            if (in_array($type, ['spacing', 'indentation', 'size'], true) && is_numeric($value)) $cfg[$type] = (float) $value;
            if ($type === 'font' && is_string($value)) $cfg['font'] = $value;
            if ($type === 'alignment') {
                $value = strtolower(trim((string) $value));
                if (in_array($value, ['justify', 'justified'], true)) $value = 'both';
                if (in_array($value, ['both', 'left', 'right', 'center'], true)) $cfg['alignment'] = $value;
            }
            if ($type === 'margin') foreach (['top', 'bottom', 'left', 'right'] as $side) {
                $number = is_array($value) ? ($value[$side] ?? null) : $value;
                if (is_numeric($number)) $cfg['margins'][$side] = (float) $number;
            }
        }
        if (($cfg['spacing'] !== null && ($cfg['spacing'] <= 0 || $cfg['spacing'] > 5)) ||
            ($cfg['size'] !== null && ($cfg['size'] < 1 || $cfg['size'] > 100)) ||
            ($cfg['indentation'] !== null && ($cfg['indentation'] < 0 || $cfg['indentation'] > 5))) throw new InvalidArgumentException('The template has invalid formatting values.');
        foreach ($cfg['margins'] as $margin) if ($margin < 0 || $margin > 4) throw new InvalidArgumentException('The template has invalid margins.');
        if (($cfg['margins']['left'] ?? 1) + ($cfg['margins']['right'] ?? 1) >= $cfg['width'] / 1440 ||
            ($cfg['margins']['top'] ?? 1) + ($cfg['margins']['bottom'] ?? 1) >= $cfg['height'] / 1440) throw new InvalidArgumentException('The template margins leave no printable area.');
        return $cfg;
    }

    public function format(string $path, array $rules): void
    {
        $cfg = $this->settings($rules);
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) throw new InvalidArgumentException('Upload a valid Word (.docx) document.');
        try {
            $expanded = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $expanded += $stat['size'];
                if ($expanded > 100 * 1024 * 1024 || $zip->numFiles > 10000) throw new InvalidArgumentException('The Word document is too large to process.');
            }
            $documentStat = $zip->statName('word/document.xml');
            if ($documentStat && $documentStat['size'] > 10 * 1024 * 1024) throw new InvalidArgumentException('The document text is too large to process.');
            $xml = $zip->getFromName('word/document.xml');
            if ($xml === false || $zip->locateName('[Content_Types].xml') === false) throw new InvalidArgumentException('Upload a valid Word (.docx) document.');
            $doc = new DOMDocument;
            $doc->preserveWhiteSpace = false;
            if (stripos($xml, '<!DOCTYPE') !== false || !@$doc->loadXML($xml, LIBXML_NONET)) throw new InvalidArgumentException('The Word document contains invalid XML.');
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $body = $xp->query('/w:document/w:body')->item(0);
            if (!$body instanceof DOMElement) throw new InvalidArgumentException('The Word document has no body.');
            foreach (iterator_to_array($xp->query('//w:lastRenderedPageBreak')) as $old) $old->parentNode->removeChild($old);
            $this->splitChapterParagraphs($doc, $xp);
            $zone = 'front'; $title = [];
            foreach (iterator_to_array($xp->query('//w:body//w:p')) as $p) {
                $text = $this->text($p); $upper = strtoupper(trim($text));
                $table = $xp->query('ancestor::w:tbl', $p)->length > 0;
                $firstText = $p->getElementsByTagNameNS(self::W, 't')->item(0)?->textContent ?? '';
                $chapter = !$table && ($this->isChapter($text) || $this->isChapter($firstText));
                $heading = $chapter || in_array($upper, ['ABSTRACT', 'APPROVAL SHEET', 'ACKNOWLEDGEMENT', 'ACKNOWLEDGEMENTS', 'TABLE OF CONTENTS', 'LIST OF TABLES', 'LIST OF FIGURES', 'LIST OF APPENDICES', 'REFERENCES', 'APPENDICES'], true);
                if ($heading) $zone = $upper === 'ABSTRACT' ? 'abstract' : ($upper === 'REFERENCES' ? 'references' : 'body');
                if ($zone === 'front' && !$table) $title[] = $p;
                $pr = $this->ensure($p, 'pPr', true);
                if (!$table) {
                    $line = $zone === 'abstract' && !$heading ? ($cfg['abstract'] ?? $cfg['spacing']) : $cfg['spacing'];
                    if ($line !== null) {
                        $sp = $this->ensure($pr, 'spacing'); $this->attr($sp, 'line', round($line * 240)); $this->attr($sp, 'lineRule', 'auto');
                        // Old paragraph gaps and document grids must not expand
                        // the template's line spacing or shorten printable pages.
                        foreach (['before', 'after', 'beforeLines', 'afterLines'] as $key) $this->attr($sp, $key, 0);
                        foreach (['beforeAutospacing', 'afterAutospacing'] as $key) $this->attr($sp, $key, 0);
                        $this->attr($this->ensure($pr, 'snapToGrid'), 'val', 0);
                    }
                    if (!$heading && $zone !== 'front' && $zone !== 'references' && $text !== '') {
                        // Let body paragraphs flow onto the next page rather
                        // than moving entire groups because of inherited styles.
                        $this->attr($this->ensure($pr, 'keepNext'), 'val', 0);
                        $this->attr($this->ensure($pr, 'keepLines'), 'val', 0);
                        $ind = $this->ensure($pr, 'ind');
                        foreach (['left', 'right', 'start', 'end'] as $key) $this->attr($ind, $key, 0);
                        foreach (['leftChars', 'rightChars', 'startChars', 'endChars'] as $key) $ind->removeAttributeNS(self::W, $key);
                    }
                    if ($zone === 'front' && $this->isDate($text)) $this->centerTitleParagraph($p, $xp);
                    if (!$heading && $zone !== 'front' && $cfg['alignment']) $this->attr($this->ensure($pr, 'jc'), 'val', $cfg['alignment']);
                    if (!$heading && $zone !== 'front' && $cfg['indentation'] !== null) {
                        $ind = $this->ensure($pr, 'ind'); $ind->removeAttributeNS(self::W, 'hanging'); $ind->removeAttributeNS(self::W, 'firstLineChars');
                        $this->attr($ind, 'firstLine', round($cfg['indentation'] * 1440));
                    }
                    if ($cfg['hanging'] && $zone === 'references' && !$heading) {
                        $ind = $this->ensure($pr, 'ind'); $ind->removeAttributeNS(self::W, 'firstLine'); $this->attr($ind, 'left', 720); $this->attr($ind, 'hanging', 720);
                    }
                }
                if ($chapter) $this->pageBreak($p, $xp);
                $special = $cfg['headings'][$upper] ?? [];
                if ($special['center'] ?? false) $this->attr($this->ensure($pr, 'jc'), 'val', 'center');
                foreach ($xp->query('.//w:r', $p) as $run) {
                    $rp = $this->ensure($run, 'rPr', true);
                    if ($cfg['font']) {
                        $font = $this->ensure($rp, 'rFonts');
                        foreach (['asciiTheme', 'hAnsiTheme', 'csTheme', 'eastAsiaTheme'] as $key) $font->removeAttributeNS(self::W, $key);
                        foreach (['ascii', 'hAnsi', 'cs', 'eastAsia'] as $key) $this->attr($font, $key, $cfg['font']);
                    }
                    $size = $special['size'] ?? $cfg['size'];
                    if ($size !== null) foreach (['sz', 'szCs'] as $key) $this->attr($this->ensure($rp, $key), 'val', round($size * 2));
                    if ($special['bold'] ?? false) $this->attr($this->ensure($rp, 'b'), 'val', 1);
                }
            }
            $sections = iterator_to_array($xp->query('//w:sectPr'));
            if (!$sections) $sections[] = $this->ensure($body, 'sectPr');
            foreach ($sections as $section) {
                $size = $this->ensure($section, 'pgSz'); $this->attr($size, 'w', $cfg['width']); $this->attr($size, 'h', $cfg['height']); $this->attr($size, 'orient', 'portrait');
                $margins = $this->ensure($section, 'pgMar');
                foreach ($cfg['margins'] as $side => $inch) $this->attr($margins, $side, round($inch * 1440));
            }
            $this->layoutTitle($title, $cfg, $xp);
            $zip->addFromString('word/document.xml', $doc->saveXML());
        } finally { $zip->close(); }
    }

    private function text(DOMElement $p): string
    {
        $text = ''; foreach ($p->getElementsByTagNameNS(self::W, 't') as $t) $text .= $t->textContent;
        return trim(preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $text));
    }

    private function isChapter(string $text): bool
    {
        return (bool) preg_match('/^CHAPTER\s*(?:[1-5]|I|II|III|IV|V|ONE|TWO|THREE|FOUR|FIVE)\s*[:.\-]?$/i', trim($text));
    }

    private function splitChapterParagraphs(DOMDocument $doc, DOMXPath $xp): void
    {
        foreach (iterator_to_array($xp->query('//w:body//w:p[not(ancestor::w:tbl)]')) as $p) {
            if ($this->isChapter($this->text($p))) continue;
            foreach (iterator_to_array($xp->query('./w:r/w:t', $p)) as $t) {
                if (!$this->isChapter($t->textContent)) continue;
                if ($p->getElementsByTagNameNS(self::W, 't')->item(0) === $t) break;
                $run = $t->parentNode; $split = $doc->createElementNS(self::W, 'w:p');
                $pr = $xp->query('./w:pPr', $p)->item(0); if ($pr) $split->appendChild($pr->cloneNode(true));
                $p->parentNode->insertBefore($split, $p->nextSibling);
                while ($run) { $next = $run->nextSibling; $split->appendChild($run); $run = $next; }
                break;
            }
        }
    }

    private function pageBreak(DOMElement $p, DOMXPath $xp): void
    {
        $pr = $this->ensure($p, 'pPr', true);
        foreach (iterator_to_array($xp->query('./w:pageBreakBefore', $pr)) as $old) $old->parentNode->removeChild($old);
        foreach (iterator_to_array($xp->query('.//w:br[@w:type="page"] | .//w:lastRenderedPageBreak', $p)) as $old) $old->parentNode->removeChild($old);
        $run = $p->ownerDocument->createElementNS(self::W, 'w:r');
        $br = $p->ownerDocument->createElementNS(self::W, 'w:br'); $this->attr($br, 'type', 'page'); $run->appendChild($br);
        $p->insertBefore($run, $pr->nextSibling);
    }

    private function layoutTitle(array $title, array $cfg, DOMXPath $xp): void
    {
        $partial = $by = $date = null; $visible = [];
        foreach ($title as $p) {
            $text = $this->text($p);
            if ($text !== '') $visible[] = $p;
            if (preg_match('/in partial fulfi[l]?lment/i', $text)) $partial = $p;
            if (preg_match('/^by$/i', $text)) $by = $p;
            if ($this->isDate($text)) { $date = $p; break; }
        }
        if (!$partial || !$by || !$date) return;
        $datePr = $this->ensure($date, 'pPr', true);
        foreach (iterator_to_array($xp->query('./w:keepNext | ./w:pageBreakBefore', $datePr)) as $old) $old->parentNode->removeChild($old);
        $width = $cfg['width'] - (($cfg['margins']['left'] ?? 1) + ($cfg['margins']['right'] ?? 1)) * 1440;
        $height = $cfg['height'] - (($cfg['margins']['top'] ?? 1) + ($cfg['margins']['bottom'] ?? 1)) * 1440;
        $used = 0;
        foreach ($visible as $p) {
            $sp = $this->ensure($this->ensure($p, 'pPr', true), 'spacing');
            $this->attr($sp, 'before', 0); $this->attr($sp, 'after', 0);
            $sp->removeAttributeNS(self::W, 'beforeAutospacing'); $sp->removeAttributeNS(self::W, 'afterAutospacing');
            $this->centerTitleParagraph($p, $xp);
            $lineCount = max(1, ceil(mb_strlen($this->text($p)) * ($cfg['size'] ?? 12) * 10 / $width));
            $lineCount += $xp->query('.//w:br[not(@w:type="page")]', $p)->length;
            $used += $lineCount * ($cfg['size'] ?? 12) * 20 * ($cfg['spacing'] ?? 1) * 1.2;
        }
        foreach ($title as $p) {
            if ($this->text($p) === '' && !$xp->query('.//w:drawing | .//w:pict | .//w:sectPr', $p)->length) $p->parentNode?->removeChild($p);
            if ($p === $date) break;
        }
        $extra = max(0, $height * .92 - $used);
        $thesis = null; $firstAuthor = null;
        foreach ($visible as $index => $p) {
            if (preg_match('/^A Thesis$/i', $this->text($p))) $thesis = $p;
            if ($p === $by && isset($visible[$index + 1]) && $visible[$index + 1] !== $date) $firstAuthor = $visible[$index + 1];
        }
        // Match the reference's five blocks: title, thesis statement, degree
        // statement, "by", authors, then the date at the bottom of the cover.
        $groups = [[$thesis, .25], [$partial, .24], [$by, .24], [$firstAuthor, .10], [$date, .17]];
        $total = array_sum(array_map(fn ($group) => $group[0] ? $group[1] : 0, $groups));
        foreach ($groups as [$p, $fraction]) if ($p) $this->attr($this->ensure($this->ensure($p, 'pPr', true), 'spacing'), 'before', round($extra * $fraction / $total));
    }

    private function isDate(string $text): bool
    {
        return (bool) preg_match('/^(January|February|March|April|May|June|July|August|September|October|November|December)\b.*\d{4}\.?$/i', trim($text));
    }

    private function centerTitleParagraph(DOMElement $p, DOMXPath $xp): void
    {
        $pr = $this->ensure($p, 'pPr', true);
        $this->attr($this->ensure($pr, 'jc'), 'val', 'center');
        // Explicit zeros also override indentation inherited from a Word style.
        $ind = $this->ensure($pr, 'ind');
        foreach (['left', 'right', 'start', 'end', 'firstLine', 'hanging'] as $key) $this->attr($ind, $key, 0);
        foreach (['leftChars', 'rightChars', 'startChars', 'endChars', 'firstLineChars', 'hangingChars'] as $key) $ind->removeAttributeNS(self::W, $key);
        foreach (iterator_to_array($xp->query('./w:tabs | ./w:numPr', $pr)) as $old) $old->parentNode->removeChild($old);
        foreach (iterator_to_array($xp->query('.//w:tab', $p)) as $tab) $tab->parentNode->removeChild($tab);
        $texts = $p->getElementsByTagNameNS(self::W, 't');
        if ($texts->length) {
            $texts->item(0)->textContent = ltrim($texts->item(0)->textContent);
            $texts->item($texts->length - 1)->textContent = rtrim($texts->item($texts->length - 1)->textContent);
        }
    }

    private function ensure(DOMElement $parent, string $name, bool $first = false): DOMElement
    {
        foreach ($parent->childNodes as $child) if ($child instanceof DOMElement && $child->namespaceURI === self::W && $child->localName === $name) return $child;
        $child = $parent->ownerDocument->createElementNS(self::W, 'w:'.$name);
        $orders = [
            'pPr' => ['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','pBdr','shd','tabs','snapToGrid','spacing','ind','contextualSpacing','jc','outlineLvl','rPr','sectPr'],
            'rPr' => ['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','color','spacing','sz','szCs','highlight','u','vertAlign','lang'],
            'sectPr' => ['headerReference','footerReference','type','pgSz','pgMar','pgNumType','cols','vAlign','titlePg','docGrid'],
        ];
        $ref = $first ? $parent->firstChild : null;
        $order = $orders[$parent->localName] ?? [];
        $index = array_search($name, $order, true);
        if (!$first && $index !== false) foreach ($parent->childNodes as $sibling) {
            $position = $sibling instanceof DOMElement ? array_search($sibling->localName, $order, true) : false;
            if ($position !== false && $position > $index) { $ref = $sibling; break; }
        }
        $parent->insertBefore($child, $ref); return $child;
    }

    private function attr(DOMElement $element, string $name, mixed $value): void
    {
        $element->setAttributeNS(self::W, 'w:'.$name, (string) $value);
    }
}
