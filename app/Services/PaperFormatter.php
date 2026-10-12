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
            'margins' => [], 'width' => 12240, 'height' => 15840, 'headings' => [], 'cv' => [], 'heading_gap_lines' => 0, 'appendix_titles' => []];
        foreach ($rules as $rule) {
            if (!is_array($rule)) throw new InvalidArgumentException('The template contains an invalid rule.');
            $description = (string) ($rule['detail'] ?? $rule['name'] ?? '');
            if (preg_match('/\bAppendix\s+([A-Z])\s*[-–—.]\s*([^:\r\n]+)(?::|$)/iu', $description, $m)) {
                $letter = strtoupper($m[1]); $title = trim($m[2]);
                if (!array_key_exists($letter, $cfg['appendix_titles'])) $cfg['appendix_titles'][$letter] = $title;
                elseif ($cfg['appendix_titles'][$letter] !== $title) $cfg['appendix_titles'][$letter] = null;
            }
            $text = preg_replace('/[^\x00-\x7F]+/', ' ', (string) ($rule['detail'] ?? $rule['name'] ?? ''));
            if (preg_match('/(?:after\s+(?:each\s+|every\s+)?(?:heading|header|title)|(?:heading|header|title).*?before\s+(?:the\s+)?(?:explanation|definition|text))/i', $text) &&
                preg_match('/\b(two|one|\d+(?:\.\d+)?)\s+(?:blank\s+)?lines?\b/i', $text, $m)) {
                $cfg['heading_gap_lines'] = strtolower($m[1]) === 'two' ? 2 : (strtolower($m[1]) === 'one' ? 1 : (float) $m[1]);
                continue;
            }
            if (preg_match('/curriculum\s+vitae|\bCV\b/i', $text)) {
                if (preg_match('/\b(\d+(?:\.\d+)?)\s*(?:by|x)\s*(\d+(?:\.\d+)?)\s*(?:inch|in\b)/i', $text, $m)) {
                    $cfg['cv']['photo_width'] = (float) $m[1]; $cfg['cv']['photo_height'] = (float) $m[2];
                }
                if (preg_match('/single(?:[- ]+line)?[- ]*spac/i', $text)) $cfg['cv']['spacing'] = 1;
                elseif (preg_match('/double(?:[- ]+line)?[- ]*spac/i', $text)) $cfg['cv']['spacing'] = 2;
                elseif (preg_match('/\b(\d+(?:\.\d+)?)\s*(?:line\s*)?spac/i', $text, $m)) $cfg['cv']['spacing'] = (float) $m[1];
                if (preg_match('/one\s*\(1\)\s*page|one\s+page|1\s+page/i', $text)) $cfg['cv']['one_page'] = true;
                if (preg_match('/\b(left|right|center)[- ]aligned\b/i', $text, $m)) $cfg['cv']['alignment'] = strtolower($m[1]);
                continue;
            }
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
            if ($type === 'abstract-spacing' && is_numeric($value)) $cfg['abstract'] = (float) $value;
            if ($type === 'cv-spacing' && is_numeric($value)) $cfg['cv']['spacing'] = (float) $value;
            if ($type === 'heading-gap-lines' && is_numeric($value)) $cfg['heading_gap_lines'] = (float) $value;
            if ($type === 'paper') {
                $paper = strtolower(trim((string) $value));
                if (in_array($paper, ['letter', 'short', 'short bond'], true)) { $cfg['width'] = 12240; $cfg['height'] = 15840; }
                elseif ($paper === 'a4') { $cfg['width'] = 11906; $cfg['height'] = 16838; }
                elseif ($paper === 'legal') { $cfg['width'] = 12240; $cfg['height'] = 20160; }
                else throw new InvalidArgumentException('The admin template paper size must be letter, a4, or legal.');
            }
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
            ($cfg['abstract'] !== null && ($cfg['abstract'] <= 0 || $cfg['abstract'] > 5)) ||
            ($cfg['size'] !== null && ($cfg['size'] < 1 || $cfg['size'] > 100)) ||
            ($cfg['indentation'] !== null && ($cfg['indentation'] < 0 || $cfg['indentation'] > 5))) throw new InvalidArgumentException('The template has invalid formatting values.');
        foreach ($cfg['margins'] as $margin) if ($margin < 0 || $margin > 4) throw new InvalidArgumentException('The template has invalid margins.');
        if ($cfg['heading_gap_lines'] < 0 || $cfg['heading_gap_lines'] > 5) throw new InvalidArgumentException('The template has invalid heading spacing.');
        foreach (['photo_width', 'photo_height', 'spacing'] as $key) if (isset($cfg['cv'][$key]) && ($cfg['cv'][$key] <= 0 || $cfg['cv'][$key] > 5)) throw new InvalidArgumentException('The template has invalid Curriculum Vitae settings.');
        if (($cfg['margins']['left'] ?? 1) + ($cfg['margins']['right'] ?? 1) >= $cfg['width'] / 1440 ||
            ($cfg['margins']['top'] ?? 1) + ($cfg['margins']['bottom'] ?? 1) >= $cfg['height'] / 1440) throw new InvalidArgumentException('The template margins leave no printable area.');
        return $cfg;
    }

    public function format(string $path, array $rules): array
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
            foreach (iterator_to_array($xp->query('//w:body//w:p')) as $p) {
                if (str_starts_with($this->text($p), 'Needs attention:') && strtoupper($xp->evaluate('string(.//w:rPr/w:color/@w:val)', $p)) === 'FF0000') $p->parentNode->removeChild($p);
            }
            foreach (iterator_to_array($xp->query('//w:lastRenderedPageBreak')) as $old) $old->parentNode->removeChild($old);
            $this->splitChapterParagraphs($doc, $xp);
            $this->alignAppendixTitles($xp, $cfg);
            $zone = 'front'; $title = []; $paragraphs = 0; $cv = false; $appendices = false; $cvAuthors = 0;
            foreach (iterator_to_array($xp->query('//w:body//w:p')) as $p) {
                $cvText = $this->text($p);
                if (preg_match('/^APPENDI(?:X|CES)\b/i', $cvText)) $appendices = true;
                if (preg_match('/curriculum\s+vitae/i', $cvText) && mb_strlen($cvText) < 140) $cv = true;
                if ($appendices && strtoupper($cvText) === 'PERSONAL INFORMATION' && $cfg['cv']) $cv = true;
                if ($cv && $zone === 'front') $zone = 'body';
                if ($cv && !$xp->query('ancestor::w:txbxContent', $p)->length) {
                    $this->resizeCvPhoto($p, $cfg['cv'], $xp);
                    if (strtoupper($cvText) === 'PERSONAL INFORMATION') {
                        if ($cvAuthors++ > 0 && ($cfg['cv']['one_page'] ?? false)) $this->pageBreak($p, $xp);
                    }
                }
                // Drawing anchors and text boxes have their own geometry and typography.
                // Body spacing/indent changes can collapse or displace a Word diagram.
                if ($xp->query('ancestor::w:txbxContent | .//w:drawing | .//w:pict | .//w:object', $p)->length) continue;
                $text = $this->text($p); $upper = strtoupper(trim($text));
                $table = $xp->query('ancestor::w:tbl', $p)->length > 0;
                $firstText = $p->getElementsByTagNameNS(self::W, 't')->item(0)?->textContent ?? '';
                $chapter = !$table && ($this->isChapter($text) || $this->isChapter($firstText));
                $appendixHeader = !$table && $this->isAppendixHeader($p, $xp);
                $heading = $chapter || $appendixHeader || in_array($upper, ['ABSTRACT', 'APPROVAL SHEET', 'ACKNOWLEDGEMENT', 'ACKNOWLEDGEMENTS', 'TABLE OF CONTENTS', 'LIST OF TABLES', 'LIST OF FIGURES', 'LIST OF APPENDICES', 'REFERENCES', 'APPENDICES'], true);
                if ($heading) $zone = $upper === 'ABSTRACT' ? 'abstract' : ($upper === 'REFERENCES' ? 'references' : 'body');
                if ($zone === 'front' && !$table) $title[] = $p;
                if (!$table && $zone !== 'front' && $text === '' && !$xp->query('.//w:sectPr | .//w:fldChar | .//w:bookmarkStart | .//w:bookmarkEnd | .//w:br | ./w:pPr/w:pageBreakBefore', $p)->length) {
                    $p->parentNode?->removeChild($p); continue;
                }
                $pr = $this->ensure($p, 'pPr', true);
                $topicHeading = !$table && ($heading || ($zone !== 'front' && $this->isTopicHeading($p, $xp)));
                if (!$table) {
                    $paragraphs++;
                    $list = $xp->query('./w:numPr', $pr)->length > 0;
                    if ($zone !== 'front' && !$heading && !$cv && !preg_match('/\.{3,}/', $text)) {
                        $this->cleanLineStarts($p);
                        if ($list && !$cfg['alignment']) $this->attr($this->ensure($pr, 'jc'), 'val', 'left');
                    }
                    $line = $cv ? ($cfg['cv']['spacing'] ?? $cfg['spacing']) : ($zone === 'abstract' && !$heading ? ($cfg['abstract'] ?? $cfg['spacing']) : $cfg['spacing']);
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
                        if (!$list && !$cv) {
                            $ind = $this->ensure($pr, 'ind');
                            foreach (['left', 'right', 'start', 'end'] as $key) $this->attr($ind, $key, 0);
                            foreach (['leftChars', 'rightChars', 'startChars', 'endChars'] as $key) $ind->removeAttributeNS(self::W, $key);
                        }
                    }
                    if ($zone === 'front' && $this->isDate($text)) $this->centerTitleParagraph($p, $xp);
                    if (!$heading && $zone !== 'front' && !$cv && $cfg['alignment']) $this->attr($this->ensure($pr, 'jc'), 'val', $cfg['alignment']);
                    if ($cv && isset($cfg['cv']['alignment'])) $this->attr($this->ensure($pr, 'jc'), 'val', $cfg['cv']['alignment']);
                    if (!$heading && !$list && !$cv && $zone !== 'front' && $cfg['indentation'] !== null) {
                        $ind = $this->ensure($pr, 'ind'); $ind->removeAttributeNS(self::W, 'hanging'); $ind->removeAttributeNS(self::W, 'firstLineChars');
                        $this->attr($ind, 'firstLine', round($cfg['indentation'] * 1440));
                    }
                    if ($cfg['hanging'] && $zone === 'references' && !$heading) {
                        $ind = $this->ensure($pr, 'ind'); $ind->removeAttributeNS(self::W, 'firstLine'); $this->attr($ind, 'left', 720); $this->attr($ind, 'hanging', 720);
                    }
                }
                if ($topicHeading && !$cv) {
                    $this->attr($this->ensure($pr, 'keepNext'), 'val', 1);
                    $this->attr($this->ensure($pr, 'keepLines'), 'val', 1);
                    if (!$chapter) {
                        $gap = ($cfg['size'] ?? 12) * 20 * ($cfg['spacing'] ?? 1) * $cfg['heading_gap_lines'];
                        $this->attr($this->ensure($pr, 'spacing'), 'after', round($gap));
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
            $this->attachHeadingText($xp);
            $this->isolateSectionDividers($xp, $cfg);
            $this->attachFigureCaptions($xp);
            $this->layoutTitle($title, $cfg, $xp);
            $this->removeBlankPageBreaks($xp);
            $this->flowAppendixPictures($xp, $cfg);
            $this->attachAppendixAttachments($xp, $cfg);
            // The fixed copy is clean; issue highlights belong to the attention copy.
            foreach (iterator_to_array($xp->query('//w:highlight')) as $highlight) $highlight->parentNode->removeChild($highlight);
            $zip->addFromString('word/document.xml', $doc->saveXML());
            $stylesXml = $zip->getFromName('word/styles.xml');
            if ($stylesXml !== false) {
                $styles = new DOMDocument;
                if (stripos($stylesXml, '<!DOCTYPE') !== false || !@$styles->loadXML($stylesXml, LIBXML_NONET)) throw new InvalidArgumentException('The Word document contains invalid styles XML.');
                $styleHighlights = iterator_to_array($styles->getElementsByTagNameNS(self::W, 'highlight'));
                foreach ($styleHighlights as $highlight) $highlight->parentNode->removeChild($highlight);
                if ($styleHighlights) $zip->addFromString('word/styles.xml', $styles->saveXML());
            }
            $applied = []; $manual = []; $defaults = $this->settings([]);
            foreach ($rules as $rule) {
                $name = (string) ($rule['name'] ?? $rule['detail'] ?? 'Unnamed rule');
                $single = $this->settings([$rule]);
                if ($single !== $defaults || preg_match('/short bond|\bA4\b|8\.5.*11/i', (string) ($rule['detail'] ?? ''))) $applied[] = $name;
                else $manual[] = $name;
            }
            if ($cv && ($cfg['cv']['one_page'] ?? false)) $manual[] = 'Curriculum Vitae: verify that each author fits within the template page limit; content is not removed to force a fit.';
            foreach ($cfg['appendix_titles'] as $letter => $title) if ($title === null) $manual[] = 'Appendix '.$letter.': the template defines multiple titles; choose the applicable title manually.';
            return ['settings' => $cfg, 'paragraphs_processed' => $paragraphs,
                'applied_rules' => $applied, 'manual_review_rules' => $manual,
                'manual_review_required' => count($manual) > 0,
                'note' => 'Formatting rules recognized in the selected template were applied throughout the document. Content criteria and unrecognized descriptions still require review.'];
        } finally { $zip->close(); }
    }

    private function cleanLineStarts(DOMElement $p): void
    {
        $afterBreak = false;
        foreach (iterator_to_array($p->getElementsByTagNameNS(self::W, '*')) as $node) {
            if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') !== 'page') { $afterBreak = true; continue; }
            if (!$afterBreak) continue;
            if ($node->localName === 'tab') $node->parentNode->removeChild($node);
            if ($node->localName === 't') {
                $node->textContent = ltrim($node->textContent);
                if ($node->textContent !== '') $afterBreak = false;
            }
        }
    }

    private function attachHeadingText(DOMXPath $xp): void
    {
        foreach (iterator_to_array($xp->query('/w:document/w:body/w:p[w:pPr/w:keepNext[@w:val="1"]]')) as $heading) {
            $next = $heading->nextSibling; $moveBreak = false;
            if ($next instanceof DOMElement && $xp->query('.//w:drawing | .//w:pict | .//w:object', $next)->length) continue;
            while ($next instanceof DOMElement && $next->localName === 'p' && $this->text($next) === '') {
                if ($xp->query('.//w:sectPr | .//w:drawing | .//w:pict | .//w:fldChar', $next)->length) break;
                if ($xp->query('.//w:br[@w:type="page"] | ./w:pPr/w:pageBreakBefore[not(@w:val="0")]', $next)->length) $moveBreak = true;
                $following = $next->nextSibling; $next->parentNode->removeChild($next); $next = $following;
            }
            if (!$next instanceof DOMElement || $next->localName !== 'p' || $this->text($next) === '') continue;
            if ($this->isChapter($this->text($next)) || $this->isTopicHeading($next, $xp)) continue;
            foreach (iterator_to_array($xp->query('./w:pPr/w:pageBreakBefore', $next)) as $br) {
                if (!in_array($br->getAttributeNS(self::W, 'val'), ['0', 'false', 'off'], true)) $moveBreak = true;
                $br->parentNode->removeChild($br);
            }
            // A page break before the first body word belongs before its heading.
            foreach (iterator_to_array($xp->query('.//w:br | .//w:t', $next)) as $node) {
                if ($node->localName === 't' && trim($node->textContent) !== '') break;
                if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') {
                    $moveBreak = true; $node->parentNode->removeChild($node);
                }
            }
            // Also relocate a trailing break typed after the heading itself.
            $seenText = false;
            foreach (iterator_to_array($xp->query('.//w:br | .//w:t', $heading)) as $node) {
                if ($node->localName === 't' && trim($node->textContent) !== '') $seenText = true;
                if ($seenText && $node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') {
                    $moveBreak = true; $node->parentNode->removeChild($node);
                }
            }
            if ($moveBreak) $this->pageBreak($heading, $xp);
        }
    }

    private function alignAppendixTitles(DOMXPath $xp, array $cfg): void
    {
        foreach ($xp->query('/w:document/w:body/w:p') as $p) {
            if (!$this->isAppendixHeader($p, $xp) || !preg_match('/^APPENDIX\s+([A-Z])\b/i', $this->text($p), $m)) continue;
            $letter = strtoupper($m[1]);
            $separateTitle = AppendixTitleLocator::find($p, $xp);
            $sourceTitle = $separateTitle ? AppendixTitleLocator::text($separateTitle, $xp) : trim(preg_replace('/^APPENDIX\s+[A-Z]\s*[-:.]?\s*/i', '', $this->text($p)));
            $matches = array_keys(array_filter($cfg['appendix_titles'], fn ($name) => $name !== null && mb_strtolower(trim($name)) === mb_strtolower($sourceTitle)));
            if (count($matches) === 1 && preg_match('/curriculum\s+vitae/i', $sourceTitle)) $letter = $matches[0];
            $title = $cfg['appendix_titles'][$letter] ?? null;
            if (!$title) continue;
            $target = $p; $replacement = 'Appendix '.$letter.' - '.$title;
            if ($separateTitle) {
                $labelTexts = $p->getElementsByTagNameNS(self::W, 't');
                foreach ($labelTexts as $index => $text) $text->textContent = $index === 0 ? 'Appendix '.$letter : '';
                $target = $separateTitle; $replacement = $title;
            }
            $texts = $xp->query('.//w:t[not(ancestor::w:txbxContent)]', $target);
            foreach ($texts as $index => $text) $text->textContent = $index === 0 ? $replacement : '';
        }
    }

    private function flowAppendixPictures(DOMXPath $xp, array $cfg): void
    {
        $inAppendices = false; $cv = false;
        foreach ($xp->query('/w:document/w:body/w:p') as $p) {
            $text = $this->text($p);
            if (strtoupper($text) === 'APPENDICES' || $this->isAppendixHeader($p, $xp)) $inAppendices = true;
            if ($this->isAppendixHeader($p, $xp)) {
                preg_match('/^APPENDIX\s+([A-Z])/i', $text, $m);
                $cv = (bool) preg_match('/curriculum\s+vitae/i', $text.' '.($cfg['appendix_titles'][strtoupper($m[1])] ?? ''));
            }
            if (preg_match('/curriculum\s+vitae/i', $text) && mb_strlen($text) < 180) $cv = true;
            if (!$inAppendices || $cv) continue;
            foreach (iterator_to_array($xp->query('.//w:drawing/*[local-name()="anchor" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"]', $p)) as $anchor) {
                if (!$xp->query('.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"]', $anchor)->length) continue;
                $inline = $p->ownerDocument->createElementNS($anchor->namespaceURI, 'wp:inline');
                foreach (['distT', 'distB', 'distL', 'distR'] as $distance) $inline->setAttribute($distance, '0');
                foreach (iterator_to_array($anchor->childNodes) as $child) {
                    if ($child instanceof DOMElement && in_array($child->localName, ['extent', 'effectExtent', 'docPr', 'cNvGraphicFramePr', 'graphic'], true)) $inline->appendChild($child);
                }
                $anchor->parentNode->replaceChild($inline, $anchor);
            }
            $textOnLine = false;
            foreach (iterator_to_array($xp->query('.//w:t[not(ancestor::w:txbxContent)] | ./w:r/w:br | ./w:r/w:drawing', $p)) as $node) {
                if ($node->localName === 't' && trim($node->textContent) !== '') $textOnLine = true;
                elseif ($node->localName === 'br') $textOnLine = false;
                elseif ($node->localName === 'drawing' && $textOnLine && $xp->query('.//*[local-name()="pic"]', $node)->length) {
                    $node->parentNode->insertBefore($p->ownerDocument->createElementNS(self::W, 'w:br'), $node);
                    $textOnLine = false;
                }
            }
        }
    }

    private function attachAppendixAttachments(DOMXPath $xp, array $cfg): void
    {
        foreach ($xp->query('/w:document/w:body/w:p') as $heading) {
            if (!$this->isAppendixHeader($heading, $xp)) continue;
            $chain = [$heading]; $next = $heading->nextSibling; $attachment = null;
            while ($next instanceof DOMElement && $next->localName === 'p' && count($chain) < 8) {
                if ($this->isAppendixHeader($next, $xp) || $this->isChapter($this->text($next)) || $xp->query('.//w:sectPr', $next)->length) break;
                if ($xp->query('.//w:drawing | .//w:pict | .//w:object', $next)->length) { $attachment = $next; break; }
                if (mb_strlen($this->text($next)) > 180) break;
                $chain[] = $next; $next = $next->nextSibling;
            }
            if (!$attachment) continue;
            $reserved = 240; // A small separation between the label and attachment.
            foreach ($chain as $index => $p) {
                $pr = $this->ensure($p, 'pPr', true);
                if ($index > 0) {
                    foreach (iterator_to_array($xp->query('./w:pageBreakBefore', $pr)) as $break) $break->parentNode->removeChild($break);
                    foreach (iterator_to_array($xp->query('.//w:br[@w:type="page"]', $p)) as $break) $break->parentNode->removeChild($break);
                }
                if ($this->text($p) === '' && !$xp->query('.//w:bookmarkStart | .//w:bookmarkEnd | .//w:fldChar', $p)->length) { $p->parentNode->removeChild($p); continue; }
                $this->attr($this->ensure($pr, 'keepNext'), 'val', 1);
                $line = $xp->evaluate('string(./w:spacing/@w:line)', $pr);
                $textWidth = $cfg['width'] - (($cfg['margins']['left'] ?? 1) + ($cfg['margins']['right'] ?? 1)) * 1440;
                $lines = max(1, ceil(mb_strlen($this->text($p)) * ($cfg['size'] ?? 12) * 10 / $textWidth));
                $reserved += $lines * ($cfg['size'] ?? 12) * 20 * ($line !== '' ? (float) $line / 240 : ($cfg['spacing'] ?? 1)) * 1.2;
                $reserved += (float) $xp->evaluate('string(./w:spacing/@w:before)', $pr) + (float) $xp->evaluate('string(./w:spacing/@w:after)', $pr);
            }
            $pr = $this->ensure($attachment, 'pPr', true);
            $this->attr($this->ensure($pr, 'keepLines'), 'val', 1);
            $this->attr($this->ensure($pr, 'keepNext'), 'val', 0);
            $spacing = $this->ensure($pr, 'spacing');
            $this->attr($spacing, 'before', 0); $this->attr($spacing, 'after', 0);
            $this->attr($spacing, 'line', 240); $this->attr($spacing, 'lineRule', 'auto');
            foreach (['beforeLines', 'afterLines', 'beforeAutospacing', 'afterAutospacing'] as $key) $this->attr($spacing, $key, 0);
            foreach (iterator_to_array($xp->query('./w:pageBreakBefore', $pr)) as $break) $break->parentNode->removeChild($break);
            foreach (iterator_to_array($xp->query('./w:r/w:br[@w:type="page"]', $attachment)) as $break) $break->parentNode->removeChild($break);
            $section = $xp->query('.//w:sectPr | following::w:sectPr[1]', $heading)->item(0);
            $margin = function (string $side) use ($xp, $section): float {
                $value = $xp->evaluate('string(./w:pgMar/@w:'.$side.')', $section);
                return $value !== '' ? (float) $value : 1440;
            };
            $maxWidth = ($cfg['width'] - $margin('left') - $margin('right')) * 635;
            $maxHeight = max(1, $cfg['height'] - $margin('top') - $margin('bottom') - $reserved - 240) * 635 * .97;
            foreach ($xp->query('.//w:drawing', $attachment) as $drawing) {
                if (!$xp->query('.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"]', $drawing)->length) continue;
                $extent = $xp->query('.//*[local-name()="extent" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"]', $drawing)->item(0);
                if (!$extent) continue;
                $width = (float) $extent->getAttribute('cx'); $height = (float) $extent->getAttribute('cy');
                if ($width <= 0 || $height <= 0) continue;
                $scale = min(1, $maxWidth / $width, $maxHeight / $height);
                if ($scale >= 1) continue;
                foreach ($xp->query('.//*[local-name()="extent" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"] | .//*[local-name()="pic"]//*[local-name()="xfrm"]/*[local-name()="ext"]', $drawing) as $size) {
                    $size->setAttribute('cx', (string) round($width * $scale)); $size->setAttribute('cy', (string) round($height * $scale));
                }
            }
        }
    }

    private function isAppendixHeader(DOMElement $p, DOMXPath $xp): bool
    {
        if ($xp->query('.//w:tab', $p)->length || preg_match('/^TOC/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p))) return false;
        $text = $this->text($p);
        return mb_strlen($text) < 180 && !preg_match('/\.{3,}/', $text) && preg_match('/^APPENDIX\s+[A-Z](?:\s*[-:.]\s*[^!?]+)?$/i', $text);
    }

    private function removeBlankPageBreaks(DOMXPath $xp): void
    {
        foreach (iterator_to_array($xp->query('/w:document/w:body/w:p')) as $p) {
            if ($this->text($p) !== '' || $xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr | .//w:fldChar', $p)->length) continue;
            if (!$xp->query('.//w:br[@w:type="page"] | ./w:pPr/w:pageBreakBefore[not(@w:val="0")]', $p)->length) continue;
            $next = $p->nextSibling;
            while ($next instanceof DOMElement && $next->localName === 'p' && $this->text($next) === '' && !$xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr', $next)->length) $next = $next->nextSibling;
            if ($next instanceof DOMElement && $next->localName === 'p') {
                $this->pageBreak($next, $xp);
                $p->parentNode->removeChild($p);
            } elseif (!$next || ($next instanceof DOMElement && $next->localName === 'sectPr')) $p->parentNode->removeChild($p);
        }
        $first = $xp->query('/w:document/w:body/*[self::w:p or self::w:tbl]')->item(0);
        if ($first instanceof DOMElement && $first->localName === 'p') {
            foreach (iterator_to_array($xp->query('./w:pPr/w:pageBreakBefore', $first)) as $break) $break->parentNode->removeChild($break);
            foreach (iterator_to_array($xp->query('.//w:br[@w:type="page"] | .//w:t | .//w:drawing | .//w:pict | .//w:object', $first)) as $node) {
                if ($node->localName === 't' && trim($node->textContent) === '') continue;
                if ($node->localName !== 'br') break;
                $node->parentNode->removeChild($node);
            }
        }
        foreach ($xp->query('//w:sectPr/w:type[@w:val="oddPage" or @w:val="evenPage"]') as $type) $this->attr($type, 'val', 'nextPage');
    }

    private function isolateSectionDividers(DOMXPath $xp, array $cfg): void
    {
        foreach ($xp->query('/w:document/w:body/w:p') as $p) {
            if (!in_array(strtoupper($this->text($p)), ['REFERENCES', 'APPENDICES'], true)) continue;
            if (preg_match('/^TOC/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p))) continue;
            // Shared divider style requested for every admin template.
            foreach ($p->getElementsByTagNameNS(self::W, 't') as $text) $text->textContent = strtoupper($text->textContent);
            $this->centerTitleParagraph($p, $xp);
            foreach ($xp->query('.//w:r', $p) as $run) {
                $rPr = $this->ensure($run, 'rPr', true);
                foreach (['b', 'bCs'] as $key) $this->attr($this->ensure($rPr, $key), 'val', 1);
                foreach (['sz', 'szCs'] as $key) $this->attr($this->ensure($rPr, $key), 'val', 76);
            }
            $section = $xp->query('.//w:sectPr | following::w:sectPr[1]', $p)->item(0);
            $top = $xp->evaluate('string(./w:pgMar/@w:top)', $section);
            $bottom = $xp->evaluate('string(./w:pgMar/@w:bottom)', $section);
            $height = $cfg['height'] - ($top !== '' ? (float) $top : 1440) - ($bottom !== '' ? (float) $bottom : 1440);
            $spacing = $this->ensure($this->ensure($p, 'pPr', true), 'spacing');
            $this->attr($spacing, 'line', 912); $this->attr($spacing, 'lineRule', 'exact');
            $this->attr($spacing, 'before', max(0, round(($height - 912) / 2))); $this->attr($spacing, 'after', 0);
            foreach (['beforeLines', 'afterLines', 'beforeAutospacing', 'afterAutospacing'] as $key) $this->attr($spacing, $key, 0);
            $this->pageBreak($p, $xp);
            $this->attr($this->ensure($this->ensure($p, 'pPr', true), 'keepNext'), 'val', 0);
            $next = $p->nextSibling;
            while ($next instanceof DOMElement && $next->localName === 'p' && $this->text($next) === '' &&
                !$xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr', $next)->length) {
                $following = $next->nextSibling; $next->parentNode->removeChild($next); $next = $following;
            }
            if (!$next instanceof DOMElement || $next->localName === 'sectPr') continue;
            if ($next->localName === 'p') $this->pageBreak($next, $xp);
            elseif ($next->localName === 'tbl') {
                $break = $p->ownerDocument->createElementNS(self::W, 'w:p');
                $next->parentNode->insertBefore($break, $next);
                $this->pageBreak($break, $xp);
            }
        }
    }

    private function resizeCvPhoto(DOMElement $p, array $settings, DOMXPath $xp): void
    {
        if (!isset($settings['photo_width'], $settings['photo_height'])) return;
        foreach ($xp->query('.//w:drawing', $p) as $drawing) {
            // Resize actual pictures only, leaving charts and other drawings intact.
            $pictures = $xp->query('.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"]', $drawing);
            if (!$pictures->length) continue;
            foreach ($xp->query('.//*[local-name()="extent" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"]', $drawing) as $extent) {
                $extent->setAttribute('cx', (string) round($settings['photo_width'] * 914400));
                $extent->setAttribute('cy', (string) round($settings['photo_height'] * 914400));
            }
            foreach ($pictures as $picture) foreach ($xp->query('.//*[local-name()="xfrm"]/*[local-name()="ext"]', $picture) as $extent) {
                $extent->setAttribute('cx', (string) round($settings['photo_width'] * 914400));
                $extent->setAttribute('cy', (string) round($settings['photo_height'] * 914400));
            }
        }
    }

    private function attachFigureCaptions(DOMXPath $xp): void
    {
        foreach ($xp->query('/w:document/w:body/w:p') as $caption) {
            if (!preg_match('/^Figure\s*\d+(?:\.\d+)*\s*[.:-]/i', $this->text($caption))) continue;
            $figure = $caption->previousSibling; $spacers = [];
            while ($figure instanceof DOMElement && $figure->localName === 'p' && $this->text($figure) === '' &&
                !$xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr', $figure)->length) {
                $spacers[] = $figure; $figure = $figure->previousSibling;
            }
            if (!$figure instanceof DOMElement || !$xp->query('.//w:drawing | .//w:pict | .//w:object', $figure)->length) continue;
            foreach ($spacers as $spacer) $spacer->parentNode->removeChild($spacer);
            $this->attr($this->ensure($this->ensure($figure, 'pPr', true), 'keepNext'), 'val', 1);
            $pr = $this->ensure($caption, 'pPr', true);
            $this->attr($this->ensure($pr, 'keepLines'), 'val', 1);
            $this->attr($this->ensure($pr, 'keepNext'), 'val', 0);
            $this->attr($this->ensure($pr, 'pageBreakBefore'), 'val', 0);
            $ind = $this->ensure($pr, 'ind');
            foreach (['firstLine', 'hanging', 'left', 'right', 'start', 'end'] as $key) $this->attr($ind, $key, 0);
            foreach (['firstLineChars', 'hangingChars', 'leftChars', 'rightChars'] as $key) $ind->removeAttributeNS(self::W, $key);
            $this->attr($this->ensure($pr, 'spacing'), 'before', 0);
            foreach (iterator_to_array($xp->query('.//w:br[@w:type="page"]', $caption)) as $br) $br->parentNode->removeChild($br);
        }
    }

    private function text(DOMElement $p): string
    {
        $text = ''; foreach ($p->getElementsByTagNameNS(self::W, 't') as $t) $text .= $t->textContent;
        return trim(preg_replace('/[\x{200B}-\x{200D}\x{FEFF}]/u', '', $text));
    }

    private function isTopicHeading(DOMElement $p, DOMXPath $xp): bool
    {
        $text = $this->text($p);
        if ($text === '' || mb_strlen($text) > 140 || preg_match('/\.{3,}/', $text) || $xp->query('./w:pPr/w:numPr', $p)->length) return false;
        $style = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p);
        $outline = $xp->query('./w:pPr/w:outlineLvl', $p)->item(0);
        if (preg_match('/^Heading[ _-]?\d+$/i', $style) || ($outline && (int) $outline->getAttributeNS(self::W, 'val') < 9)) return true;
        if (preg_match('/^(Introduction|Statement of the Problem|Theoretical Framework|Conceptual Framework|Hypothes(?:is|es)|Scope and (?:Limitations|Delimitations)(?: of the Study)?|Significance of the Study|Definition of Terms|Research Design|Method of Research|Population.*Sampling.*|Research Instrument|Data Gathering Procedure|Data Analysis|Ethical Considerations|Summary of Findings|Conclusions|Recommendations|Synthesis.*)$/i', $text)) return true;
        if (preg_match('/[.!?;:]$/', $text)) return false;
        $runs = $xp->query('.//w:r[w:t[normalize-space(.) != ""]]', $p);
        if (!$runs->length) return false;
        foreach ($runs as $run) {
            $bold = $xp->query('./w:rPr/w:b', $run)->item(0);
            if (!$bold || in_array($bold->getAttributeNS(self::W, 'val'), ['0', 'false', 'off'], true)) return false;
        }
        return true;
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
        // A cover can omit the degree statement or the standalone "by" label.
        // Its date still belongs with the preceding cover content.
        if (!$date) return;
        $datePr = $this->ensure($date, 'pPr', true);
        $this->attr($this->ensure($datePr, 'keepNext'), 'val', 0);
        $this->attr($this->ensure($datePr, 'pageBreakBefore'), 'val', 0);
        $width = $cfg['width'] - (($cfg['margins']['left'] ?? 1) + ($cfg['margins']['right'] ?? 1)) * 1440;
        $height = $cfg['height'] - (($cfg['margins']['top'] ?? 1) + ($cfg['margins']['bottom'] ?? 1)) * 1440;
        $used = 0;
        foreach ($visible as $p) {
            $pr = $this->ensure($p, 'pPr', true);
            $sp = $this->ensure($pr, 'spacing');
            $this->attr($sp, 'before', 0); $this->attr($sp, 'after', 0);
            foreach (['beforeLines', 'afterLines', 'beforeAutospacing', 'afterAutospacing'] as $key) $this->attr($sp, $key, 0);
            $this->attr($this->ensure($pr, 'pageBreakBefore'), 'val', 0);
            $this->attr($this->ensure($pr, 'keepNext'), 'val', $p === $date ? 0 : 1);
            $this->attr($this->ensure($pr, 'keepLines'), 'val', 1);
            foreach (iterator_to_array($xp->query('.//w:br[@w:type="page"]', $p)) as $br) $br->parentNode->removeChild($br);
            $this->centerTitleParagraph($p, $xp);
            $lineCount = max(1, ceil(mb_strlen($this->text($p)) * ($cfg['size'] ?? 12) * 10 / $width));
            $lineCount += $xp->query('.//w:br[not(@w:type="page")]', $p)->length;
            $used += $lineCount * ($cfg['size'] ?? 12) * 20 * ($cfg['spacing'] ?? 1) * 1.2;
        }
        foreach ($title as $p) {
            if ($this->text($p) === '' && !$xp->query('.//w:drawing | .//w:pict | .//w:sectPr', $p)->length) $p->parentNode?->removeChild($p);
            if ($p === $date) break;
        }
        // Leave room for font-metric differences between Word and the preview;
        // the date must not overflow the cover because of decorative gaps.
        $extra = max(0, $height * .85 - $used);
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
