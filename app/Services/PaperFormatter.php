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
    private array $referenceToggleCache = [];
    private array $sectionBodyCache = [];
    private array $referenceSignatureCache = [];


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
                if (preg_match('/(?:first[- ]line\b.*?\bindent(?:ed|ation)?|\bindent(?:ed|ation)?\b)\D{0,40}(\d+(?:\.\d+)?)\s*(?:inch|in\b|")/i', $text, $m)) $cfg['indentation'] = (float) $m[1];
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
            if ($type === 'page-size' && is_array($value) && is_numeric($value['width'] ?? null) && is_numeric($value['height'] ?? null)) {
                $cfg['width'] = (int) $value['width']; $cfg['height'] = (int) $value['height'];
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

    public function templateSettings(array $rules, ?string $referencePath = null): array
    {
        $source = $referencePath ? $this->referenceRules($referencePath) : $rules;
        $cfg = $this->settings($source); $pageDefined = false;
        foreach ($source as $rule) if (in_array(strtolower($rule['type'] ?? ''), ['paper', 'page-size'], true) || preg_match('/short bond|paper size|8\.5.*11|\bA4\b/i', $rule['detail'] ?? '')) $pageDefined = true;
        if (!$pageDefined) { $cfg['width'] = null; $cfg['height'] = null; }
        return $cfg;
    }

    /** Rules-only templates change only explicit admin settings; no thesis layout defaults. */
    public function formatFromTemplateRules(string $path, array $rules): array
    {
        $cfg = $this->settings($rules); $zip = new ZipArchive;
        if ($zip->open($path) !== true) throw new InvalidArgumentException('Upload a valid Word document.');
        $processed = 0;
        try {
            $xml = $zip->getFromName('word/document.xml'); $doc = new DOMDocument;
            if (!$xml || stripos($xml, '<!DOCTYPE') !== false || !@$doc->loadXML($xml, LIBXML_NONET)) throw new InvalidArgumentException('The Word document contains invalid XML.');
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $abstract = false; $cv = false;
            foreach ($xp->query('/w:document/w:body//w:p[not(ancestor::w:txbxContent)]') as $p) {
                if ($this->text($p) === '' || $xp->query('.//w:drawing | .//w:pict | .//w:object', $p)->length) continue;
                $heading = preg_match('/^Heading[ _-]?\d+$/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p)) || $xp->query('./w:pPr/w:outlineLvl[@w:val < 9]', $p)->length;
                $name = mb_strtoupper($this->text($p));
                if ($heading) { $abstract = false; $cv = false; }
                if ($cfg['abstract'] !== null && $name === 'ABSTRACT') { $abstract = true; $heading = true; }
                if (isset($cfg['cv']['spacing']) && $name === 'CURRICULUM VITAE') { $cv = true; $heading = true; }
                $line = $abstract ? $cfg['abstract'] : ($cv ? $cfg['cv']['spacing'] : $cfg['spacing']);
                $pr = $this->ensure($p, 'pPr', true);
                if ($line !== null && !$heading) {
                    $sp = $this->ensure($pr, 'spacing'); $this->attr($sp, 'line', round($line * 240)); $this->attr($sp, 'lineRule', 'auto');
                }
                if ($cfg['alignment'] !== null && !$heading) $this->attr($this->ensure($pr, 'jc'), 'val', $cfg['alignment']);
                if ($cfg['indentation'] !== null && !$heading) {
                    $ind = $this->ensure($pr, 'ind'); $this->attr($ind, 'firstLine', round($cfg['indentation'] * 1440));
                    foreach (['hanging', 'firstLineChars', 'hangingChars'] as $key) $ind->removeAttributeNS(self::W, $key);
                }
                foreach ($xp->query('.//w:r[w:t]', $p) as $run) {
                    if ($cfg['font'] === null && $cfg['size'] === null) continue;
                    $rp = $this->ensure($run, 'rPr', true);
                    if ($cfg['font'] !== null) {
                        $font = $this->ensure($rp, 'rFonts');
                        foreach (['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'csTheme'] as $key) $font->removeAttributeNS(self::W, $key);
                        foreach (['ascii', 'hAnsi', 'eastAsia', 'cs'] as $key) $this->attr($font, $key, $cfg['font']);
                    }
                    if ($cfg['size'] !== null) foreach (['sz', 'szCs'] as $key) $this->attr($this->ensure($rp, $key), 'val', round($cfg['size'] * 2));
                }
                $processed++;
            }
            $explicitPage = false;
            foreach ($rules as $rule) if (in_array(strtolower($rule['type'] ?? ''), ['paper', 'page-size'], true) || preg_match('/short bond|paper size|8\.5.*11|\bA4\b/i', $rule['detail'] ?? '')) $explicitPage = true;
            if ($explicitPage || $cfg['margins']) {
                $sections = iterator_to_array($xp->query('//w:sectPr'));
                if (!$sections) $sections[] = $this->ensure($xp->query('/w:document/w:body')->item(0), 'sectPr');
                foreach ($sections as $section) {
                    if ($explicitPage) { $size = $this->ensure($section, 'pgSz'); $this->attr($size, 'w', $cfg['width']); $this->attr($size, 'h', $cfg['height']); }
                    if ($cfg['margins']) foreach ($cfg['margins'] as $side => $inch) $this->attr($this->ensure($section, 'pgMar'), $side, round($inch * 1440));
                }
            }
            $zip->addFromString('word/document.xml', $doc->saveXML());
        } finally { $zip->close(); }
        $this->removeFixedCopyHighlights($path);
        if (!$explicitPage) { $cfg['width'] = null; $cfg['height'] = null; }
        $applied = []; $manual = ['Only explicit settings in this template were applied. Section layout, objects and unsupported prose requirements need a DOCX reference or manual review.'];
        foreach ($rules as $rule) {
            $single = $this->settings([$rule]); $supported = false;
            foreach (['font', 'size', 'spacing', 'alignment', 'indentation', 'abstract'] as $key) if ($single[$key] !== null) $supported = true;
            if ($single['margins'] || isset($single['cv']['spacing']) || in_array(strtolower($rule['type'] ?? ''), ['paper', 'page-size'], true) || preg_match('/short bond|paper size|8\.5.*11|\bA4\b/i', $rule['detail'] ?? '')) $supported = true;
            $name = $rule['name'] ?? $rule['detail'] ?? $rule['type'] ?? 'Admin setting';
            if ($supported) $applied[] = $name; else $manual[] = 'Manual template requirement: '.$name;
        }
        return ['settings' => $cfg, 'formatting_source' => 'explicit-admin-rules', 'paragraphs_processed' => $processed,
            'applied_rules' => $applied, 'manual_review_rules' => $manual,
            'manual_review_required' => true, 'note' => 'No default thesis font, paper size, headings, cover layout or appendix pages were added.'];
    }

    public function formatUsingReference(string $path, string $referencePath, array $rules = []): array
    {
        $this->referenceToggleCache = [];
        $this->sectionBodyCache = [];
        $this->referenceSignatureCache = [];
        $referenceRules = $this->referenceRules($referencePath);
        // A reference document must not pass through the checklist-only layout,
        // which imposes chapter breaks, cover positioning and appendix typography.
        $result = $this->applyReferenceFormatting($path, $referencePath, $referenceRules);
        $this->removeFixedCopyHighlights($path);
        $settings = $this->templateSettings($referenceRules); $spacingMatches = [];
        foreach ($result['mapping'] as $match) if (isset($match['expected_spacing'])) {
            $key = mb_strtolower(preg_replace('/\s+/u', ' ', trim($match['paragraph'])));
            $spacingMatches[$key][] = $match['expected_spacing'];
        }
        $settings['paragraph_spacing'] = [];
        foreach ($spacingMatches as $key => $values) if (count(array_unique($values)) === 1) $settings['paragraph_spacing'][$key] = $values[0];
        if ($result['multiple_sections']) $settings['margins'] = [];
        return ['settings' => $settings, 'formatting_source' => 'selected-docx-reference',
            'paragraphs_processed' => $result['processed'],
            'applied_rules' => ['Selected DOCX paragraph styles', 'Selected DOCX page layout'],
            'manual_review_rules' => $result['warnings'],
            'manual_review_required' => count($result['warnings']) > 0,
            'template_mapping' => $result['mapping'],
            'note' => 'Formatting was copied from the selected DOCX template. Matched appendix labels, titles and order may be corrected; body text and embedded objects were preserved. Unmatched structures are listed for review.'];
    }

    public function referenceHeadings(string $path): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) throw new InvalidArgumentException('The admin reference template is not a valid Word document.');
        try {
            $xml = $zip->getFromName('word/document.xml');
            if ($xml === false || stripos($xml, '<!DOCTYPE') !== false) throw new InvalidArgumentException('The admin reference template is not a valid Word document.');
            $doc = new DOMDocument;
            if (!@$doc->loadXML($xml, LIBXML_NONET)) throw new InvalidArgumentException('The admin reference template contains invalid document XML.');
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $headings = [];
            foreach ($this->referenceParagraphRoles($xp, $this->packageStyles($zip)) as $role => $paragraphs) {
                if ($role !== 'chapter' && !str_starts_with($role, 'section:') && !str_starts_with($role, 'topic')) continue;
                foreach ($paragraphs as $paragraph) {
                    $text = $this->text($paragraph);
                    $key = mb_strtolower(preg_replace('/\s+/u', ' ', $text));
                    if ($key !== '' && !isset($headings[$key])) $headings[$key] = $text;
                }
            }
            return array_values($headings);
        } finally { $zip->close(); }
    }

    private function applyReferenceFormatting(string $path, string $referencePath, array $referenceRules): array
    {
        $studentZip = new ZipArchive; $referenceZip = new ZipArchive;
        if ($studentZip->open($path) !== true || $referenceZip->open($referencePath) !== true) {
            if ($studentZip->status === ZipArchive::ER_OK) $studentZip->close();
            throw new InvalidArgumentException('The admin reference template is not a valid Word document.');
        }
        try {
            $studentXml = $studentZip->getFromName('word/document.xml');
            $referenceXml = $referenceZip->getFromName('word/document.xml');
            if ($studentXml === false || $referenceXml === false || stripos($referenceXml, '<!DOCTYPE') !== false) {
                throw new InvalidArgumentException('The admin reference template is not a valid Word document.');
            }
            $studentDoc = new DOMDocument; $referenceDoc = new DOMDocument;
            if (!@$studentDoc->loadXML($studentXml, LIBXML_NONET) || !@$referenceDoc->loadXML($referenceXml, LIBXML_NONET)) {
                throw new InvalidArgumentException('The admin reference template contains invalid document XML.');
            }
            $studentXp = new DOMXPath($studentDoc); $studentXp->registerNamespace('w', self::W);
            $referenceXp = new DOMXPath($referenceDoc); $referenceXp->registerNamespace('w', self::W);
            $referenceStylesXp = $this->packageStyles($referenceZip);
            $referenceRoles = $this->referenceParagraphRoles($referenceXp, $referenceStylesXp);
            $this->normalizeCombinedChapterTitles($studentXp, $referenceXp, $referenceRoles['chapter'] ?? []);
            $studentRoles = $this->referenceParagraphRoles($studentXp, $this->packageStyles($studentZip));
            if ($this->joinSplitIndexEntries($studentXp, $studentRoles)) $studentRoles = $this->referenceParagraphRoles($studentXp, $this->packageStyles($studentZip));
            // Matching supplies formatting, never missing content or appendix pages.
            $appendixLabels = $this->alignAppendixLabels($referenceRoles, $studentRoles, $referenceXp, $studentXp);
            $formFooters = $this->appendixFormFooters($referenceRoles, $studentRoles, $referenceXp, $studentXp);
            $formStarts = [];
            foreach ($referenceRoles['appendix:title'] ?? [] as $title) {
                for ($next = $title->nextSibling; $next; $next = $next->nextSibling) {
                    if (!$next instanceof DOMElement) continue;
                    // A form can place a photograph table between its title and fields.
                    if ($next->localName === 'tbl') continue;
                    if ($next->localName !== 'p') break;
                    if ($this->text($next) === '') continue;
                    $key = 'appendix:heading:'.mb_strtolower(preg_replace('/\s+/u', ' ', $this->text($next)));
                    if (in_array($next, $referenceRoles[$key] ?? [], true)) $formStarts[$key] = true;
                    break;
                }
            }
            $cover = (new TemplateCoverFormatter)->apply($studentXp, $referenceXp, $studentRoles, $referenceRoles);
            if ($cover['applied']) {
                foreach (array_keys($studentRoles) as $role) if (str_starts_with($role, 'cover:')) unset($studentRoles[$role]);
            }
            $referenceContexts = $this->paragraphChapterContexts($referenceXp);
            $studentContexts = $this->paragraphChapterContexts($studentXp);
            $referenceHeadings = []; $scopedHeadings = [];
            foreach ($referenceRoles as $referenceRole => $referenceParagraphs) {
                if ($referenceRole !== 'chapter' && !str_starts_with($referenceRole, 'section:') && !str_starts_with($referenceRole, 'topic')) continue;
                foreach ($referenceParagraphs as $referenceParagraph) {
                    $keys = $this->referenceHeadingKeys($this->text($referenceParagraph));
                    if ($referenceRole === 'chapter') {
                        $keys = array_merge($keys, $this->referenceHeadingKeys($this->paragraphFirstLine($referenceParagraph)));
                        $continuation = $this->chapterContinuation($referenceParagraph);
                        if ($continuation !== '') $keys = array_merge($keys, $this->referenceHeadingKeys($continuation));
                        $keys = array_unique($keys);
                    }
                    foreach ($keys as $key) {
                        if (!array_key_exists($key, $referenceHeadings)) $referenceHeadings[$key] = $referenceParagraph;
                        elseif ($referenceHeadings[$key] !== $referenceParagraph) $referenceHeadings[$key] = null;
                        $chapter = $referenceContexts[spl_object_id($referenceParagraph)] ?? '';
                        if (!array_key_exists($key, $scopedHeadings[$chapter] ?? [])) $scopedHeadings[$chapter][$key] = $referenceParagraph;
                        elseif ($scopedHeadings[$chapter][$key] !== $referenceParagraph) $scopedHeadings[$chapter][$key] = null;
                    }
                }
            }
            $studentRoles = $this->templateDrivenStudentRoles($studentRoles, $referenceRoles, $scopedHeadings, $studentContexts, $referenceContexts);
            $sectionBodies = $this->referenceSectionBodies($referenceXp, $referenceHeadings, $referenceRoles['body'] ?? []);
            $scopedBodies = [];
            foreach ($scopedHeadings as $context => $headings) $scopedBodies[$context] = $this->referenceSectionBodies($referenceXp, $headings, array_values(array_filter($referenceRoles['body'] ?? [], fn ($p) => ($referenceContexts[spl_object_id($p)] ?? '') === $context)));
            $headingProfiles = $this->headingProfiles($referenceHeadings);
            $scopedProfiles = []; $repeatedHeadings = [];
            foreach ($scopedHeadings as $chapter => $headings) {
                $scopedProfiles[$chapter] = $this->headingProfiles($headings);
                $examples = [];
                foreach ($headings as $heading) {
                    if ($heading && preg_match('/^\[[^\[\]\r\n]+\]$/u', $this->text($heading)) && $this->isTopicHeading($heading, $referenceXp)) $examples[spl_object_id($heading)] = $heading;
                }
                if (count($examples) >= 2 && count(array_unique(array_map(fn ($example) => $this->referenceFormatSignature($example, $referenceXp), $examples))) === 1) $repeatedHeadings[$chapter] = reset($examples);
            }
            $paragraphProperties = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'widowControl', 'pBdr', 'shd', 'tabs', 'bidi', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'jc', 'textDirection', 'outlineLvl', 'rPr'];
            $runProperties = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'color', 'spacing', 'sz', 'szCs', 'u', 'vertAlign', 'lang'];
            $referenceIndent = $this->settings($referenceRules)['indentation'];
            $processed = $cover['processed']; $warnings = $cover['warnings']; $mapping = $cover['mapping']; $sectionMatches = [];
            $warnings = array_merge($warnings, $appendixLabels['warnings']);
            $mapping = array_merge($mapping, $appendixLabels['mapping']);
            foreach ($referenceRoles as $role => $paragraphs) {
                if (str_starts_with($role, 'section:') && !isset($studentRoles[$role])) {
                    $warnings[] = 'Missing template section: '.substr($role, strlen('section:')).'. Add its content to the paper; formatting does not invent missing sections.';
                }
            }
            $roleSourceCache = [];
            foreach ($studentRoles as $role => $paragraphs) {
                $roleSources = $referenceRoles[$role] ?? [];
                foreach ($paragraphs as $index => $target) {
                    $chapter = $studentContexts[spl_object_id($target)] ?? '';
                    $matchingHeadings = $scopedHeadings[$chapter] ?? ($chapter === '' ? $referenceHeadings : []);
                    $matchingProfiles = $scopedProfiles[$chapter] ?? ($chapter === '' ? $headingProfiles : []);
                    $sourceCacheKey = $role.':'.$chapter;
                    if (!isset($roleSourceCache[$sourceCacheKey])) {
                        $sources = $roleSources;
                        if ($chapter !== '' && ($role === 'chapter' || $role === 'body' || str_starts_with($role, 'topic'))) $sources = array_values(array_filter($sources, fn ($candidate) => ($referenceContexts[spl_object_id($candidate)] ?? '') === $chapter));
                        $uniform = $sources && count(array_unique(array_map(fn ($candidate) => $this->referenceFormatSignature($candidate, $referenceXp), $sources))) === 1;
                        $roleSourceCache[$sourceCacheKey] = [$sources, $uniform];
                    }
                    [$sources, $uniformSources] = $roleSourceCache[$sourceCacheKey];
                    $appendixHeading = $role === 'appendix:title' || str_starts_with($role, 'appendix:heading:');
                    if ($studentXp->query('ancestor::w:tbl', $target)->length) continue; // Table formatting has its own matcher.
                    if ((!$appendixHeading && $studentXp->query('.//w:drawing | .//w:pict | .//w:object', $target)->length)) {
                        $warnings[] = 'Embedded-object layout was preserved and requires review against the selected template.';
                        continue;
                    }
                    $targetText = mb_strtolower(preg_replace('/\s+/u', ' ', $this->text($target)));
                    $footer = $formFooters[spl_object_id($target)] ?? null;
                    $source = $appendixLabels['sources'][spl_object_id($target)] ?? $footer['source'] ?? null; $matchedText = false; $matchedWords = false; $matchedExample = false;
                    $indexEntry = (str_starts_with($role, 'index:') && str_ends_with($role, ':entry')) || $role === 'contents:entry';
                    if (!$source && $indexEntry) {
                        $key = $this->indexEntryKey($target);
                        $exactEntries = array_values(array_filter($sources, fn ($candidate) => $this->indexEntryKey($candidate) === $key));
                        if ($exactEntries && count(array_unique(array_map(fn ($candidate) => $this->referenceFormatSignature($candidate, $referenceXp), $exactEntries))) === 1) { $source = $exactEntries[0]; $matchedText = true; }
                        if (!$source) {
                            $style = $studentXp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $target);
                            if (preg_match('/^TOC[ _-]?\d+$/i', $style)) {
                                $sameLevel = array_values(array_filter($sources, fn ($candidate) => strcasecmp($referenceXp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $candidate), $style) === 0));
                                if ($sameLevel && count(array_unique(array_map(fn ($candidate) => $this->referenceFormatSignature($candidate, $referenceXp), $sameLevel))) === 1) $source = $sameLevel[0];
                            }
                        }
                        if (!$source) {
                            $sameWords = array_values(array_filter($sources, fn ($candidate) => $this->headingWords($this->indexEntryKey($candidate)) === $this->headingWords($key)));
                            if ($sameWords && count(array_unique(array_map(fn ($candidate) => $this->referenceFormatSignature($candidate, $referenceXp), $sameWords))) === 1) $source = $sameWords[0];
                        }
                        if (!$source) {
                            $entryHeadings = [];
                            foreach ($sources as $candidate) $entryHeadings[$this->indexEntryKey($candidate)] = $candidate;
                            $source = $this->similarReferenceHeading($key, $this->headingProfiles($entryHeadings));
                        }
                        if (!$source) {
                            $examples = array_values(array_filter($sources, fn ($candidate) => (bool) preg_match('/\[[^\]]+\]/u', $this->indexEntryKey($candidate))));
                            if ($examples && count(array_unique(array_map(fn ($candidate) => $this->referenceFormatSignature($candidate, $referenceXp), $examples))) === 1) $source = $examples[0];
                        }
                        if (!$source && str_contains($role, ':chapter:')) {
                            $ordinaryEntries = array_values(array_filter($sources, fn ($candidate) => $this->chapterKey($this->indexEntryKey($candidate)) === ''));
                            if ($ordinaryEntries && count(array_unique(array_map(fn ($candidate) => $this->referenceFormatSignature($candidate, $referenceXp), $ordinaryEntries))) === 1) $source = $ordinaryEntries[0];
                        }
                    }
                    if (!$source && $role === 'chapter') $source = $matchingHeadings[$chapter] ?? null;
                    if (!$source && !$indexEntry && isset($matchingHeadings[$targetText])) {
                        $source = $matchingHeadings[$targetText]; $matchedText = true;
                    } elseif (!$source) {
                        foreach ($sources as $candidate) {
                            if (mb_strtolower(preg_replace('/\s+/u', ' ', $this->text($candidate))) === $targetText) {
                                $source = $candidate; $matchedText = true; break;
                            }
                        }
                    }
                    if (!$source && ($role === 'chapter' || str_starts_with($role, 'topic') || str_starts_with($role, 'section:'))) {
                        $source = $this->similarReferenceHeading($targetText, $matchingProfiles);
                        $matchedWords = $source !== null;
                    }
                    if (!$source && str_starts_with($role, 'topic') && $this->isReferenceTopicHeading($target, $studentXp) && isset($repeatedHeadings[$chapter])) {
                        $source = $repeatedHeadings[$chapter]; $matchedExample = true;
                    }
                    if (!$source && $role === 'body') $source = $this->sectionBodySource($target, $scopedBodies[$chapter] ?? ($chapter === '' ? $sectionBodies : []), $matchingProfiles, $chapter);
                    if (!$source && $sources) {
                        if ($uniformSources) $source = $sources[0];
                    }
                    if (!$source) {
                        $warnings[] = 'No template paragraph matched: '.mb_substr($this->text($target), 0, 100);
                        continue;
                    }
                    $targetSection = $studentXp->query('.//w:sectPr | following::w:sectPr[1]', $target)->item(0);
                    $sourceSection = $referenceXp->query('.//w:sectPr | following::w:sectPr[1]', $source)->item(0);
                    if ($targetSection && $sourceSection) {
                        $id = spl_object_id($targetSection);
                        $sectionMatches[$id]['target'] = $targetSection;
                        $sectionMatches[$id]['sources'][spl_object_id($sourceSection)] = $sourceSection;
                    }
                    // Citation emphasis identifies titles within an entry, not the whole entry.
                    $entryRunProperties = $role === 'references:entry' ? array_values(array_diff($runProperties, ['b', 'bCs', 'i', 'iCs', 'u'])) : $runProperties;
                    $this->copyReferenceParagraph($source, $target, $referenceXp, $studentXp, $paragraphProperties, $entryRunProperties, $referenceStylesXp);
                    if ($indexEntry) {
                        // TOC properties often live in TOC1/TOC2 styles, not document.xml.
                        foreach (['tabs', 'spacing', 'ind', 'jc'] as $name) {
                            if ($referenceXp->query('./w:pPr/w:'.$name, $source)->length) continue;
                            $inherited = $this->inheritedParagraphProperty($source, $referenceXp, $referenceStylesXp, $name);
                            if ($inherited) {
                                $pr = $this->ensure($target, 'pPr', true);
                                $pr->replaceChild($studentDoc->importNode($inherited, true), $this->ensure($pr, $name));
                            }
                        }
                        $this->normalizeIndexLeader($source, $target, $referenceXp, $studentXp, $referenceStylesXp);
                    }
                    // Column labels can use a sequence of default tabs rather than
                    // explicit tab stops. Copy that sequence only for identical,
                    // plain-text labels; never replace entry titles or page values.
                    if (str_starts_with($role, 'index:') && str_ends_with($role, ':columns') && $this->text($source) === $this->text($target)
                        && !$referenceXp->query('./*[not(self::w:pPr or self::w:r)] | ./w:r/*[not(self::w:rPr or self::w:t or self::w:tab)]', $source)->length
                        && !$studentXp->query('./*[not(self::w:pPr or self::w:r)] | ./w:r/*[not(self::w:rPr or self::w:t or self::w:tab)]', $target)->length) {
                        foreach (iterator_to_array($studentXp->query('./w:r', $target)) as $run) $target->removeChild($run);
                        foreach ($referenceXp->query('./w:r', $source) as $run) $target->appendChild($studentDoc->importNode($run, true));
                    }
                    foreach (['keepNext', 'keepLines', 'pageBreakBefore', 'outlineLvl'] as $propertyName) {
                        if ($referenceXp->query('./w:pPr/w:'.$propertyName, $source)->length) continue;
                        $inherited = $this->inheritedParagraphProperty($source, $referenceXp, $referenceStylesXp, $propertyName);
                        if ($inherited) {
                            $pr = $this->ensure($target, 'pPr', true);
                            $pr->replaceChild($studentDoc->importNode($inherited, true), $this->ensure($pr, $propertyName));
                        }
                    }
                    $reusedFirstEntry = $role === 'references:entry' && $index > 0 && $source === ($sources[0] ?? null) && !$matchedText;
                    $reusedIndexExample = $indexEntry && $index > 0 && !$matchedText;
                    $startsPage = !$reusedFirstEntry && !$reusedIndexExample && $this->referenceStartsPage($source, $referenceXp);
                    if ($reusedIndexExample) {
                        // A template's sample entry can begin a TOC page. Reusing
                        // its appearance must not repeat that boundary for every row.
                        $this->attr($this->ensure($this->ensure($target, 'pPr', true), 'pageBreakBefore'), 'val', 0);
                        foreach (iterator_to_array($studentXp->query('.//w:br[@w:type="page"] | .//w:lastRenderedPageBreak', $target)) as $marker) $marker->parentNode->removeChild($marker);
                    }
                    if ($index > 0 && isset($formStarts[$role]) && count($sources) === 1) $startsPage = true;
                    if ($role === 'references:entry' && $index > 0 && !$startsPage) {
                        // A template's first entry may follow its own divider page.
                        // That boundary must not repeat for every citation or survive a reformat.
                        $this->attr($this->ensure($this->ensure($target, 'pPr', true), 'pageBreakBefore'), 'val', 0);
                        foreach (iterator_to_array($studentXp->query('.//w:br | .//w:t', $target)) as $node) {
                            if ($node->localName === 't' && trim($node->textContent) !== '') break;
                            if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') $node->parentNode->removeChild($node);
                        }
                    }
                    $continuation = $this->chapterContinuation($source);
                    $isContinuation = $continuation !== '' && $targetText === mb_strtolower(preg_replace('/\s+/u', ' ', $continuation));
                    if ($isContinuation) {
                        // A line inside the template's combined heading is not a second page start.
                        $pr = $this->ensure($target, 'pPr', true);
                        $this->attr($this->ensure($pr, 'pageBreakBefore'), 'val', 0);
                        $spacing = $this->ensure($pr, 'spacing');
                        $this->attr($spacing, 'before', 0); $this->attr($spacing, 'beforeLines', 0);
                    } elseif ($startsPage) {
                        $this->attr($this->ensure($this->ensure($target, 'pPr', true), 'pageBreakBefore'), 'val', 1);
                    }
                    $before = $studentXp->query('./w:pPr/w:pageBreakBefore', $target)->item(0);
                    if ($before && !in_array(strtolower($before->getAttributeNS(self::W, 'val')), ['0', 'false', 'off'], true)) $this->materializePageStart($target, $studentXp);
                    if (!$indexEntry && !($footer['continuation'] ?? false)) $this->copyReferenceHeadingGap($source, $target, $referenceXp, $studentXp, $referenceStylesXp);
                    $mapping[] = ['paragraph' => $this->text($target), 'template_paragraph' => $this->text($source), 'match' => $matchedText ? 'heading-text' : ($matchedWords ? 'heading-words' : ($matchedExample ? 'chapter-heading-example' : 'structure'))];
                    $sourceSpacing = $referenceXp->query('./w:pPr/w:spacing', $source)->item(0) ?? $this->inheritedParagraphProperty($source, $referenceXp, $referenceStylesXp, 'spacing');
                    if ($sourceSpacing && in_array($sourceSpacing->getAttributeNS(self::W, 'lineRule'), ['', 'auto'], true) && is_numeric($sourceSpacing->getAttributeNS(self::W, 'line'))) $mapping[count($mapping) - 1]['expected_spacing'] = (float) $sourceSpacing->getAttributeNS(self::W, 'line') / 240;
                    if ($role === 'body' && $referenceIndent !== null && !$referenceXp->query('./w:pPr/w:ind', $source)->length) {
                        $indent = $this->ensure($this->ensure($target, 'pPr', true), 'ind');
                        foreach (['hanging', 'hangingChars', 'firstLineChars'] as $key) $indent->removeAttributeNS(self::W, $key);
                        $inheritedIndent = $this->inheritedParagraphProperty($source, $referenceXp, $referenceStylesXp, 'ind');
                        $firstLine = $inheritedIndent?->getAttributeNS(self::W, 'firstLine');
                        $this->attr($indent, 'firstLine', is_numeric($firstLine) ? $firstLine : round($referenceIndent * 1440));
                    }
                    $processed++;
                }
            }
            $tables = (new TemplateTableFormatter)->apply($studentXp, $referenceXp, $studentContexts, $referenceContexts);
            $warnings = array_merge($warnings, $tables['warnings']); $mapping = array_merge($mapping, $tables['mapping']);
            $photos = (new TemplatePhotoFormatter)->apply($studentXp, $referenceXp);
            $warnings = array_merge($warnings, $photos['warnings']); $mapping = array_merge($mapping, $photos['mapping']);
            if ($studentXp->query('//w:drawing | //w:pict | //w:tbl | //w:object')->length) $warnings[] = 'Pictures and tables keep their existing layout unless an unambiguous template match supplies their placement. Review scanned pages and unmatched objects against the selected template.';
            $referenceSection = $referenceXp->query('//w:sectPr')->item($referenceXp->query('//w:sectPr')->length - 1);
            if ($referenceSection instanceof DOMElement) {
                $studentSections = iterator_to_array($studentXp->query('//w:sectPr'));
                if (!$studentSections) $studentSections[] = $this->ensure($studentDoc->documentElement->getElementsByTagNameNS(self::W, 'body')->item(0), 'sectPr');
                if ($referenceXp->query('//w:sectPr')->length > 1) $warnings[] = 'The template has multiple sections. Only uniquely matched section geometry was copied; ambiguous layouts and section-specific headers or footers require review.';
                if ($referenceXp->query('//w:headerReference | //w:footerReference')->length) $warnings[] = 'Existing headers and footers were preserved. Compare them with the template headers and footers.';
                foreach ($studentSections as $section) {
                    $layoutSource = $referenceSection;
                    if ($referenceXp->query('//w:sectPr')->length > 1) {
                        $matches = $sectionMatches[spl_object_id($section)]['sources'] ?? [];
                        $layouts = [];
                        foreach ($matches as $matchedSection) {
                            $parts = [];
                            foreach (['pgSz', 'pgMar', 'pgBorders', 'cols', 'vAlign', 'docGrid'] as $propertyName) {
                                $property = $referenceXp->query('./w:'.$propertyName, $matchedSection)->item(0);
                                $parts[] = $property ? $property->C14N() : '';
                            }
                            $layouts[implode('|', $parts)] = $matchedSection;
                        }
                        if (count($layouts) !== 1) {
                            $warnings[] = 'The paper section does not uniquely match one template section. Its page geometry was preserved for review instead of applying an unrelated section layout.';
                            continue;
                        }
                        $layoutSource = reset($layouts);
                    }
                    foreach (['pgSz', 'pgMar', 'pgBorders', 'cols', 'vAlign', 'docGrid'] as $name) {
                        $property = $referenceXp->query('./w:'.$name, $layoutSource)->item(0);
                        if (!$property) {
                            if (in_array($name, ['pgSz', 'pgMar'], true)) $warnings[] = 'The template does not specify '.($name === 'pgSz' ? 'paper size' : 'page margins').'; the original value was preserved for review.';
                            continue;
                        }
                        foreach (iterator_to_array($studentXp->query('./w:'.$name, $section)) as $old) $section->removeChild($old);
                        $section->replaceChild($studentDoc->importNode($property, true), $this->ensure($section, $name));
                    }
                }
            } else $warnings[] = 'The template has no explicit page geometry; the original document layout was preserved for review.';
            $studentZip->addFromString('word/document.xml', $studentDoc->saveXML());

            $referenceStylesXml = $referenceZip->getFromName('word/styles.xml');
            if ($referenceStylesXml !== false && stripos($referenceStylesXml, '<!DOCTYPE') === false) {
                $referenceStyles = new DOMDocument;
                if (@$referenceStyles->loadXML($referenceStylesXml, LIBXML_NONET) && $referenceStyles->documentElement?->namespaceURI === self::W) {
                    $studentStylesXml = $studentZip->getFromName('word/styles.xml');
                    $studentStyles = new DOMDocument;
                    $hasStudentStyles = $studentStylesXml !== false && stripos($studentStylesXml, '<!DOCTYPE') === false && @$studentStyles->loadXML($studentStylesXml, LIBXML_NONET) && $studentStyles->documentElement?->localName === 'styles' && $studentStyles->documentElement?->namespaceURI === self::W;
                    if ($hasStudentStyles) {
                        $studentStylesXp = new DOMXPath($studentStyles); $studentStylesXp->registerNamespace('w', self::W);
                        $referenceStylesXp = new DOMXPath($referenceStyles); $referenceStylesXp->registerNamespace('w', self::W);
                        $referenceDefaults = $referenceStylesXp->query('/w:styles/w:docDefaults')->item(0);
                        $studentDefaults = $studentStylesXp->query('/w:styles/w:docDefaults')->item(0);
                        if ($referenceDefaults) {
                            $copy = $studentStyles->importNode($referenceDefaults, true);
                            if ($studentDefaults) $studentDefaults->parentNode->replaceChild($copy, $studentDefaults);
                            else $studentStyles->documentElement->insertBefore($copy, $studentStyles->documentElement->firstChild);
                        }
                        foreach ($referenceStylesXp->query('/w:styles/w:style[@w:styleId]') as $referenceStyle) {
                            $styleId = $referenceStyle->getAttributeNS(self::W, 'styleId');
                            $existing = null;
                            foreach ($studentStylesXp->query('/w:styles/w:style[@w:styleId]') as $studentStyle) {
                                if ($studentStyle->getAttributeNS(self::W, 'styleId') === $styleId) { $existing = $studentStyle; break; }
                            }
                            $copy = $studentStyles->importNode($referenceStyle, true);
                            if ($existing) $existing->parentNode->replaceChild($copy, $existing);
                            else $studentStyles->documentElement->appendChild($copy);
                        }
                    } else {
                        $studentStyles = $referenceStyles;
                    }
                    $studentZip->addFromString('word/styles.xml', $studentStyles->saveXML());
                }
            }
            return ['processed' => $processed, 'warnings' => array_values(array_unique($warnings)), 'mapping' => $mapping, 'multiple_sections' => $referenceXp->query('//w:sectPr')->length > 1];
        } finally { $studentZip->close(); $referenceZip->close(); }
    }
    /** Blank paragraphs are layout in a Word template, outside the heading's pPr. */
    private function copyReferenceHeadingGap(DOMElement $source, DOMElement $target, DOMXPath $referenceXp, DOMXPath $studentXp, ?DOMXPath $stylesXp = null): void
    {
        $isBlank = function ($node, DOMXPath $xp): bool {
            return $node instanceof DOMElement && $node->namespaceURI === self::W && $node->localName === 'p'
                && $this->text($node) === ''
                && !$xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:br | .//w:sectPr | .//w:fldChar | .//w:bookmarkStart | .//w:bookmarkEnd | ./w:pPr/w:pageBreakBefore', $node)->length;
        };
        $previousElement = static function ($node) {
            $previous = $node->previousSibling;
            while ($previous && !$previous instanceof DOMElement) $previous = $previous->previousSibling;
            return $previous;
        };
        $blanks = []; $previous = $previousElement($source);
        while ($isBlank($previous, $referenceXp)) {
            array_unshift($blanks, $previous);
            $previous = $previousElement($previous);
        }
        // Do not reproduce leading page padding as a section gap.
        if (!$previous instanceof DOMElement) return;
        $previousTarget = $previousElement($target);
        while ($isBlank($previousTarget, $studentXp)) {
            $remove = $previousTarget; $previousTarget = $previousElement($remove);
            $remove->parentNode->removeChild($remove);
        }
        if (!$blanks) {
            // The template's actual paragraph gap takes precedence over its prompts.
            $inherited = $this->inheritedParagraphProperty($source, $referenceXp, $stylesXp, 'spacing');
            if ($referenceXp->query('./w:pPr/w:spacing[@w:before or @w:beforeLines]', $source)->length || ($inherited && ($inherited->hasAttributeNS(self::W, 'before') || $inherited->hasAttributeNS(self::W, 'beforeLines')))) return;
            $instruction = $this->text($previous);
            if (preg_match('/\b(one|two|three|four|five|\d+)\s*(?:\(\s*\d+\s*\))?\s+blank\s+lines?\s+before\s+(?:(?:the|next|each|every)\s+)*(?:section\s+)?(?:heading|header|title)\b/i', $instruction, $match)) {
                $words = ['one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5];
                $lines = $words[strtolower($match[1])] ?? (int) $match[1];
                if ($lines >= 0 && $lines <= 5) {
                    $spacing = $this->ensure($this->ensure($target, 'pPr', true), 'spacing');
                    $this->attr($spacing, 'before', 0);
                    $this->attr($spacing, 'beforeLines', $lines * 100);
                    $this->attr($spacing, 'beforeAutospacing', 0);
                }
            }
            return;
        }
        foreach ($blanks as $blank) $target->parentNode->insertBefore($target->ownerDocument->importNode($blank, true), $target);
    }

    private function referenceParagraphRoles(DOMXPath $xp, ?DOMXPath $stylesXp = null): array
    {
        $roles = []; $zone = 'cover'; $coverIndex = 0; $appendixTitlePending = false; $appendixSection = ''; $tocChapter = '';
        foreach ($xp->query('/w:document/w:body//w:p[not(ancestor::w:txbxContent)]') as $paragraph) {
            if (!$paragraph instanceof DOMElement) continue;
            $text = $this->text($paragraph);
            if ($text === '') continue;
            $upper = strtoupper($text);
            $outline = $xp->query('./w:pPr/w:outlineLvl', $paragraph)->item(0) ?? $this->inheritedParagraphProperty($paragraph, $xp, $stylesXp, 'outlineLvl');
            $styleLevel = $outline instanceof DOMElement ? $outline->getAttributeNS(self::W, 'val') : null;
            $tocChapterEntry = $zone === 'index:TABLE OF CONTENTS' && $this->isChapterParagraph($paragraph)
                && !preg_match('/^CHAPTER\s+(?:[0-9]+|[A-Z]+)\s*[:.\-]?$/i', $this->paragraphFirstLine($paragraph))
                && !preg_match('/^Heading[ _-]?\d+$/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph))
                && !(is_numeric($styleLevel) && (int) $styleLevel < 9);
            if ($tocChapterEntry) { $tocChapter = $this->chapterKey($this->paragraphFirstLine($paragraph)); $role = $zone.':'.$tocChapter.':entry'; }
            elseif ($this->isChapterParagraph($paragraph)) { $role = 'chapter'; $zone = 'body'; }
            elseif (in_array($upper, ['ABSTRACT', 'APPROVAL SHEET', 'ACKNOWLEDGEMENT', 'ACKNOWLEDGEMENTS', 'TABLE OF CONTENTS', 'LIST OF TABLES', 'LIST OF FIGURES', 'LIST OF APPENDICES', 'REFERENCES', 'APPENDICES'], true)) {
                $role = 'section:'.$upper;
                $zone = match ($upper) { 'ABSTRACT' => 'abstract', 'REFERENCES' => 'references', 'APPENDICES' => 'appendices', 'TABLE OF CONTENTS', 'LIST OF TABLES', 'LIST OF FIGURES', 'LIST OF APPENDICES' => 'index:'.$upper, default => 'body' };
                $appendixTitlePending = false; $tocChapter = '';
            } elseif (str_starts_with($zone, 'index:')) {
                // Each index has its own template column headings and entry layout.
                $isColumnHeader = (bool) preg_match('/^(?:(?:Table|Figure|Appendix)\s*)?Page$/iu', preg_replace('/\s+/u', ' ', $text));
                $role = $zone.($isColumnHeader ? ':columns' : (($zone === 'index:TABLE OF CONTENTS' && $tocChapter !== '') ? ':'.$tocChapter.':entry' : ':entry'));
            } elseif ($xp->query('./w:pPr/w:tabs/w:tab[@w:leader="dot"]', $paragraph)->length || preg_match('/^TOC\d*$/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph))) {
                $role = 'contents:entry';
            } elseif ($this->isAppendixHeader($paragraph, $xp)) {
                $role = 'appendix:label'; $zone = 'appendices';
                $appendixSection = '';
                $appendixTitlePending = (bool) preg_match('/^APPENDIX\s+[A-Z]$/i', $text);
            } elseif ($zone === 'appendices' && $appendixTitlePending && !$xp->query('ancestor::w:tbl', $paragraph)->length) {
                $role = 'appendix:title'; $appendixTitlePending = false;
            } elseif ($zone === 'appendices') {
                // Form values are often short lines. Only actual heading formatting
                // establishes a subsection; values inherit that subsection's sample.
                if ($this->isTopicHeading($paragraph, $xp) || (is_numeric($styleLevel) && (int) $styleLevel < 9)) {
                    $appendixSection = mb_strtolower(preg_replace('/\s+/u', ' ', $text));
                    $role = 'appendix:heading:'.$appendixSection;
                } else $role = 'appendix:body:'.$appendixSection;
            } elseif ($zone === 'references') {
                // Format captions in an instructional template are not bibliography entries.
                // Keep the zone intact even for a short URL, bold entry or Heading-style entry.
                $role = preg_match('/^\[[^\[\]\r\n]+\]$/u', $text) && $this->isTopicHeading($paragraph, $xp) ? 'references:guide' : 'references:entry';
            } elseif (is_numeric($styleLevel) && (int) $styleLevel < 9) {
                $role = 'topic:'.((int) $styleLevel + 1); $zone = 'body';
            } elseif ($zone === 'cover' && !preg_match('/^Heading[ _-]?\d+$/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph))) $role = 'cover:'.($coverIndex++);
            elseif ($this->isReferenceTopicHeading($paragraph, $xp)) {
                $style = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph);
                $outline = $xp->evaluate('string(./w:pPr/w:outlineLvl/@w:val)', $paragraph);
                $level = preg_match('/heading[ _-]?(\d+)/i', $style, $match) ? $match[1] : (is_numeric($outline) && $outline < 9 ? (string) ((int) $outline + 1) : '');
                $role = $level !== '' ? 'topic:'.$level : (preg_match('/\p{L}/u', $text) && $text === mb_strtoupper($text) ? 'topic:uppercase' : 'topic');
                if ($zone !== 'appendices') $zone = 'body';
            } elseif ($zone === 'abstract') $role = 'abstract:body';
            elseif ($zone === 'references') $role = 'references:entry';
            else $role = 'body';
            $roles[$role][] = $paragraph;
        }
        return $roles;
    }

    /** Labels belong to the template title, not to the student's existing letter. */
    private function alignAppendixLabels(array $referenceRoles, array $studentRoles, DOMXPath $referenceXp, DOMXPath $studentXp): array
    {
        $normalize = static fn (string $text) => mb_strtolower(trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text)));
        $blocks = function (array $roles, DOMXPath $xp) use ($normalize): array {
            $titles = [];
            foreach ($roles['appendix:title'] ?? [] as $title) $titles[spl_object_id($title)] = $title;
            $blocks = [];
            foreach ($roles['appendix:label'] ?? [] as $label) {
                for ($next = $label->nextSibling; $next; $next = $next->nextSibling) {
                    if (!$next instanceof DOMElement) continue;
                    if ($next->localName !== 'p') break;
                    if ($this->text($next) === '') continue;
                    if (isset($titles[spl_object_id($next)])) $blocks[] = ['label' => $label, 'title' => $normalize($this->text($next)), 'title_node' => $next];
                    break;
                }
            }
            return $blocks;
        };
        $reference = []; $referenceEntries = [];
        foreach ($blocks($referenceRoles, $referenceXp) as $ordinal => $block) {
            $key = $block['title'];
            $description = '';
            for ($node = $block['title_node']->nextSibling; $node; $node = $node->nextSibling) {
                if ($node instanceof DOMElement && in_array($node, $referenceRoles['appendix:label'] ?? [], true)) break;
                if ($node instanceof DOMElement && $node->localName === 'p') $description .= ' '.$this->text($node);
                if (mb_strlen($description) > 2000) break;
            }
            $block['description'] = $description;
            $entry = [...$block, 'ordinal' => $ordinal]; $referenceEntries[] = $entry;
            $reference[$key] = array_key_exists($key, $reference) ? null : $entry;
        }
        $student = $blocks($studentRoles, $studentXp); $proposals = []; $warnings = []; $mapping = []; $sources = []; $matches = [];
        foreach ($student as $block) {
            $match = $reference[$block['title']] ?? null;
            if (!$match && strlen($block['title']) >= 20) {
                $scores = [];
                foreach ($reference as $key => $candidate) {
                    if (!$candidate || str_contains($this->text($candidate['title_node']), '[')) continue;
                    $scores[$key] = levenshtein($block['title'], $key) / max(strlen($block['title']), strlen($key));
                }
                asort($scores); $keys = array_keys($scores);
                if ($keys && $scores[$keys[0]] <= 0.16 && (!isset($keys[1]) || $scores[$keys[1]] - $scores[$keys[0]] >= 0.08)) $match = $reference[$keys[0]];
            }
            if (!$match) {
                $words = $this->headingWords($block['title']); $candidates = [];
                if (count($words) >= 3) foreach ($reference as $candidate) {
                    if (!$candidate || str_contains($this->text($candidate['title_node']), '[')) continue;
                    $titleWords = $this->headingWords($candidate['title']);
                    $descriptionWords = $this->headingWords($candidate['title'].' '.$candidate['description']);
                    if (array_intersect($words, $titleWords) && !array_diff($words, $descriptionWords)) $candidates[] = $candidate;
                }
                if (count($candidates) === 1) $match = $candidates[0];
            }
            if (!$match) {
                // A short title can identify an entry through a distinctive word,
                // provided no other template entry or description uses that word.
                $words = $this->headingWords($block['title']); $shortMatches = [];
                if (count($words) <= 2) foreach ($words as $word) {
                    if (mb_strlen($word) < 5) continue;
                    $owners = [];
                    foreach ($reference as $candidate) {
                        if (!$candidate || str_contains($this->text($candidate['title_node']), '[')) continue;
                        if (in_array($word, $this->headingWords($candidate['title'].' '.$candidate['description']), true)) $owners[] = $candidate;
                    }
                    if (count($owners) === 1 && in_array($word, $this->headingWords($owners[0]['title']), true)) $shortMatches[$owners[0]['ordinal']] = $owners[0];
                }
                if (count($shortMatches) === 1) $match = reset($shortMatches);
            }
            if (!$match) {
                // Optional supporting-document slots accept the student's actual title.
                // The current letter can identify such a slot, but never a named document.
                foreach ($referenceEntries as $candidate) {
                    if ($candidate && str_contains($this->text($candidate['title_node']), '[')
                        && $normalize($this->text($candidate['label'])) === $normalize($this->text($block['label']))) {
                        $match = $candidate; break;
                    }
                }
            }
            $id = spl_object_id($block['label']);
            if ($match) {
                $proposals[$id] = $this->text($match['label']); $matches[$id] = $match;
                $sources[$id] = $match['label'];
                $sources[spl_object_id($block['title_node'])] = $match['title_node'];
            }
        }
        // Keep existing optional-slot assignments, then fill unused template slots
        // with additional documents in their original order. Do not invent slots.
        $used = array_column($matches, 'ordinal'); $available = [];
        foreach ($referenceEntries as $candidate) {
            if ($candidate && str_contains($this->text($candidate['title_node']), '[') && !in_array($candidate['ordinal'], $used, true)) $available[] = $candidate;
        }
        foreach ($student as $block) {
            $id = spl_object_id($block['label']);
            if (isset($matches[$id])) continue;
            $match = array_shift($available);
            if (!$match) {
                $warnings[] = 'Unmatched appendix: '.$this->text($block['label']).' — '.$this->text($block['title_node']).'. No matching named entry or unused optional template slot is available; its content and label were preserved.';
                continue;
            }
            $matches[$id] = $match; $proposals[$id] = $this->text($match['label']);
            $sources[$id] = $match['label']; $sources[spl_object_id($block['title_node'])] = $match['title_node'];
            $mapping[] = ['paragraph' => $this->text($block['title_node']), 'template_paragraph' => $this->text($match['title_node']), 'match' => 'appendix-optional-slot', 'template_label' => $this->text($match['label'])];
        }
        // Calculate all destinations before editing, so swapped labels are safe.
        do {
            $destinations = []; $blocked = [];
            foreach ($studentRoles['appendix:label'] ?? [] as $label) {
                $key = $normalize($proposals[spl_object_id($label)] ?? $this->text($label));
                $destinations[$key][] = $label;
            }
            foreach ($destinations as $labels) {
                if (count($labels) < 2) continue;
                foreach ($labels as $label) {
                    $id = spl_object_id($label);
                    if (isset($proposals[$id]) && $normalize($proposals[$id]) !== $normalize($this->text($label))) $blocked[] = $id;
                }
            }
            foreach ($blocked as $id) unset($proposals[$id]);
            if ($blocked) $warnings[] = 'Appendix labels require review: some title-based corrections would leave duplicate labels. Resolve unmatched or repeated appendix titles before renumbering those appendices.';
        } while ($blocked);
        foreach ($student as $block) {
            $label = $block['label']; $destination = $proposals[spl_object_id($label)] ?? null;
            if ($destination === null) continue;
            $match = $matches[spl_object_id($label)];
            if (!str_contains($this->text($match['title_node']), '[') && $this->text($block['title_node']) !== $this->text($match['title_node'])) {
                $oldTitle = $this->text($block['title_node']);
                foreach (iterator_to_array($studentXp->query('.//w:t', $block['title_node'])) as $index => $node) $node->textContent = $index === 0 ? $this->text($match['title_node']) : '';
                $mapping[] = ['paragraph' => $this->text($block['title_node']), 'template_paragraph' => $this->text($match['title_node']), 'match' => 'appendix-template-title', 'previous_title' => $oldTitle];
            }
            if ($normalize($destination) === $normalize($this->text($label))) continue;
            $old = $this->text($label); $nodes = iterator_to_array($studentXp->query('.//w:t', $label));
            foreach ($nodes as $index => $node) $node->textContent = $index === 0 ? $destination : '';
            $mapping[] = ['paragraph' => $destination, 'template_paragraph' => $destination, 'match' => 'appendix-title-label', 'previous_label' => $old, 'appendix_title' => $block['title']];
        }
        $this->orderMatchedAppendices($studentRoles['appendix:label'] ?? [], $matches, $proposals, $warnings, $mapping);
        if ($mapping) $warnings[] = 'Appendix labels were corrected by matching their titles to the template. Review appendix cross-references and the list of appendices; those text references were preserved.';
        return ['warnings' => array_values(array_unique($warnings)), 'mapping' => $mapping, 'sources' => $sources, 'template_entries' => $referenceEntries];
    }

    /** Move whole appendix blocks, including tables and images; unmatched blocks retain their slots. */
    private function orderMatchedAppendices(array $labels, array $matches, array $proposals, array &$warnings, array &$mapping): void
    {
        if (count($labels) < 2) return;
        $parent = $labels[0]->parentNode; $groups = []; $slots = [];
        foreach ($labels as $index => $label) {
            if ($label->parentNode !== $parent) { $warnings[] = 'Appendix order requires review because labels are nested in different document containers.'; return; }
            $id = spl_object_id($label);
            if (isset($matches[$id], $proposals[$id])) $slots[] = $index;
            $groups[$index] = [];
            for ($node = $label; $node && $node !== ($labels[$index + 1] ?? null); $node = $node->nextSibling) {
                if ($node instanceof DOMElement && $node->localName === 'sectPr') break;
                $groups[$index][] = $node;
            }
        }
        $ordered = $slots;
        usort($ordered, fn ($a, $b) => $matches[spl_object_id($labels[$a])]['ordinal'] <=> $matches[spl_object_id($labels[$b])]['ordinal']);
        if ($ordered === $slots) return;
        $anchors = [];
        foreach ($slots as $slot) {
            $anchors[$slot] = $parent->ownerDocument->createComment('appendix position');
            $parent->insertBefore($anchors[$slot], $labels[$slot]);
        }
        foreach ($slots as $slot) foreach ($groups[$slot] as $node) $parent->removeChild($node);
        foreach ($slots as $position => $slot) {
            foreach ($groups[$ordered[$position]] as $node) $parent->insertBefore($node, $anchors[$slot]);
            $parent->removeChild($anchors[$slot]);
        }
        $mapping[] = ['paragraph' => 'Appendix order', 'template_paragraph' => 'Selected template appendix order', 'match' => 'appendix-block-order'];
    }

    /** Match a template form's placeholder name plus literal role, without naming the role in code. */
    private function appendixFormFooters(array $referenceRoles, array $studentRoles, DOMXPath $referenceXp, DOMXPath $studentXp): array
    {
        $samples = [];
        foreach ($referenceRoles as $role => $paragraphs) {
            if (!str_starts_with($role, 'appendix:body:') && !str_starts_with($role, 'appendix:heading:')) continue;
            foreach ($paragraphs as $paragraph) {
                $lines = [''];
                foreach ($referenceXp->query('.//w:t | .//w:br | .//w:cr', $paragraph) as $node) {
                    if ($node->localName === 't') $lines[count($lines) - 1] .= $node->textContent;
                    else $lines[] = '';
                }
                $lines = array_values(array_filter(array_map('trim', $lines), fn ($line) => $line !== ''));
                if (count($lines) !== 2 || !preg_match('/^\[[^\[\]]+\]$/u', $lines[0]) || str_contains($lines[1], '[') || mb_strlen($lines[1]) < 5) continue;
                $key = mb_strtolower($lines[1]);
                $samples[$key] = array_key_exists($key, $samples) ? null : $paragraph;
            }
        }
        $matches = [];
        foreach ($studentRoles as $role => $paragraphs) {
            if (!str_starts_with($role, 'appendix:body:') && !str_starts_with($role, 'appendix:heading:')) continue;
            foreach ($paragraphs as $paragraph) {
                $text = mb_strtolower($this->text($paragraph));
                foreach ($samples as $label => $source) {
                    if (!$source || !preg_match('/^'.preg_quote($label, '/').'(?:\s|:|$)/u', $text)) continue;
                    $matches[spl_object_id($paragraph)] = ['source' => $source, 'continuation' => true];
                    for ($previous = $paragraph->previousSibling; $previous; $previous = $previous->previousSibling) {
                        if (!$previous instanceof DOMElement || $previous->localName !== 'p') break;
                        if ($studentXp->query('.//w:drawing | .//w:pict | .//w:object', $previous)->length) break;
                        $previousText = $this->text($previous);
                        if ($previousText === '') continue;
                        $headingRole = 'appendix:heading:'.mb_strtolower(preg_replace('/\s+/u', ' ', $previousText));
                        if (!str_contains($previousText, ':') && !isset($referenceRoles[$headingRole])) $matches[spl_object_id($previous)] = ['source' => $source, 'continuation' => false];
                        break;
                    }
                }
            }
        }
        return $matches;
    }

    /** Student font, bold, italic and Heading styles are not evidence of template roles. */
    private function templateDrivenStudentRoles(array $studentRoles, array $referenceRoles, array $headings, array $studentContexts, array $referenceContexts): array
    {
        $result = []; $referenceRoleByNode = [];
        foreach ($referenceRoles as $role => $nodes) foreach ($nodes as $node) $referenceRoleByNode[spl_object_id($node)] = $role;
        foreach ($studentRoles as $role => $nodes) foreach ($nodes as $node) {
            $chosen = $role;
            // Cover, indexes, bibliography and appendix form fields have their own
            // template matchers. Reclassify only chapter prose and topic headings.
            if ($role === 'body' || str_starts_with($role, 'topic')) {
                $context = $studentContexts[spl_object_id($node)] ?? '';
                $text = trim(preg_replace('/\s+/u', ' ', $this->text($node)));
                $source = $headings[$context][mb_strtolower($text)] ?? null;
                if ($source) $chosen = $referenceRoleByNode[spl_object_id($source)] ?? $role;
                elseif (str_starts_with($role, 'topic') && (mb_strlen($text) > 140 || preg_match('/[.!?;]$/u', $text))) {
                    $bodyExamples = array_filter($referenceRoles['body'] ?? [], fn ($candidate) => ($referenceContexts[spl_object_id($candidate)] ?? '') === $context);
                    if ($bodyExamples) $chosen = 'body';
                }
            }
            $result[$chosen][] = $node;
        }
        return $result;
    }

    private function referenceHeadingKeys(string $text): array
    {
        $normalize = static fn (string $value) => mb_strtolower(trim(preg_replace('/\s+/u', ' ', $value)));
        $keys = [$normalize($text)];
        $chapter = $this->chapterKey($text);
        if ($chapter !== '') $keys[] = $chapter;
        // Optional research-type annotations belong to the template, not the student's title.
        if (!str_contains($text, '[')) {
            $withoutAnnotations = preg_replace('/\([^()]*\)/u', '', $text);
            foreach (preg_split('/\s+or\s+/iu', $withoutAnnotations) as $alternative) {
                $key = $normalize($alternative);
                if ($key !== '') $keys[] = $key;
            }
        }
        return array_values(array_unique($keys));
    }

    private function packageStyles(ZipArchive $zip): ?DOMXPath
    {
        $xml = $zip->getFromName('word/styles.xml');
        if ($xml === false || stripos($xml, '<!DOCTYPE') !== false) return null;
        $doc = new DOMDocument;
        if (!@$doc->loadXML($xml, LIBXML_NONET) || $doc->documentElement?->namespaceURI !== self::W) return null;
        $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
        return $xp;
    }

    private function paragraphChapterContexts(DOMXPath $xp): array
    {
        $contexts = []; $chapter = '';
        $chapterNodes = [];
        foreach ($this->referenceParagraphRoles($xp)['chapter'] ?? [] as $node) $chapterNodes[spl_object_id($node)] = true;
        foreach ($xp->query('/w:document/w:body//w:p[not(ancestor::w:txbxContent)]') as $paragraph) {
            if (isset($chapterNodes[spl_object_id($paragraph)])) $chapter = $this->chapterKey($this->paragraphFirstLine($paragraph));
            $contexts[spl_object_id($paragraph)] = $chapter;
        }
        return $contexts;
    }

    private function headingWords(string $text): array
    {
        preg_match_all('/\p{L}+/u', mb_strtolower($text), $matches);
        $words = [];
        foreach ($matches[0] as $word) {
            if (in_array($word, ['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to'], true)) continue;
            if (mb_strlen($word) > 4) $word = preg_replace('/ies$/', 'y', $word);
            if (mb_strlen($word) > 4) $word = preg_replace('/(?:ed|s)$/', '', $word);
            $words[$word] = true;
        }
        return array_keys($words);
    }

    private function headingProfiles(array $headings): array
    {
        $profiles = [];
        foreach ($headings as $key => $heading) {
            if (!$heading || str_contains($key, '[')) continue;
            $words = $this->headingWords($key);
            if (count($words) >= 3) $profiles[] = ['source' => $heading, 'words' => $words];
        }
        return $profiles;
    }

    private function similarReferenceHeading(string $text, array $profiles): ?DOMElement
    {
        if (mb_strlen($text) > 140 || str_contains($text, '[')) return null;
        $words = $this->headingWords($text);
        if (count($words) < 3) return null;
        $scores = []; $sources = [];
        foreach ($profiles as $profile) {
            $intersection = count(array_intersect($words, $profile['words']));
            $union = count(array_unique(array_merge($words, $profile['words'])));
            $score = $union ? $intersection / $union : 0;
            $id = spl_object_id($profile['source']);
            $scores[$id] = max($scores[$id] ?? 0, $score); $sources[$id] = $profile['source'];
        }
        arsort($scores);
        $ids = array_keys($scores);
        if (!$ids || $scores[$ids[0]] < 0.8 || (isset($ids[1]) && $scores[$ids[0]] - $scores[$ids[1]] < 0.15)) return null;
        return $sources[$ids[0]];
    }

    private function referenceFormatSignature(DOMElement $paragraph, DOMXPath $xp): string
    {
        $id = spl_object_id($paragraph);
        if (isset($this->referenceSignatureCache[$id])) return $this->referenceSignatureCache[$id];
        $parts = [];
        foreach ($xp->query('./w:pPr | ./w:r[.//w:t][1]/w:rPr', $paragraph) as $property) $parts[] = $property->C14N();
        return $this->referenceSignatureCache[$id] = implode('|', $parts);
    }

    private function inheritedParagraphProperty(DOMElement $paragraph, DOMXPath $xp, ?DOMXPath $styles, string $name): ?DOMElement
    {
        if (!$styles) return null;
        $id = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph);
        if ($id === '') $id = $styles->evaluate('string(/w:styles/w:style[@w:type="paragraph" and (@w:default="1" or @w:default="true")]/@w:styleId)');
        $seen = [];
        while ($id !== '' && !isset($seen[$id])) {
            $seen[$id] = true; $style = null;
            foreach ($styles->query('/w:styles/w:style') as $candidate) {
                if ($candidate->getAttributeNS(self::W, 'styleId') === $id) { $style = $candidate; break; }
            }
            if (!$style) break;
            $property = $styles->query('./w:pPr/w:'.$name, $style)->item(0);
            if ($property instanceof DOMElement) return $property;
            $id = $styles->evaluate('string(./w:basedOn/@w:val)', $style);
        }
        $property = $styles->query('/w:styles/w:docDefaults/w:pPrDefault/w:pPr/w:'.$name)->item(0);
        return $property instanceof DOMElement ? $property : null;
    }

    private function referenceSectionBodies(DOMXPath $xp, array $headings, array $bodyParagraphs): array
    {
        $bodyNodes = []; $headingKeys = []; $sources = []; $currentKeys = [];
        foreach ($bodyParagraphs as $paragraph) $bodyNodes[spl_object_id($paragraph)] = true;
        foreach ($headings as $key => $heading) if ($heading) $headingKeys[spl_object_id($heading)][] = $key;
        foreach ($xp->query('/w:document/w:body/w:p') as $paragraph) {
            $id = spl_object_id($paragraph);
            if (isset($headingKeys[$id])) $currentKeys = $headingKeys[$id];
            elseif ($currentKeys && isset($bodyNodes[$id]) && !$xp->query('.//w:drawing | .//w:pict | .//w:object', $paragraph)->length) {
                foreach ($currentKeys as $key) $sources[$key] = $paragraph;
                $currentKeys = [];
            }
        }
        return $sources;
    }

    private function sectionBodySource(DOMElement $target, array $sources, array $headingProfiles = [], string $context = ''): ?DOMElement
    {
        $targetId = spl_object_id($target);
        for ($previous = $target->previousSibling; $previous; $previous = $previous->previousSibling) {
            if (!$previous instanceof DOMElement || $previous->localName !== 'p') continue;
            $previousId = spl_object_id($previous);
            if (array_key_exists($previousId, $this->sectionBodyCache[$context] ?? [])) return $this->sectionBodyCache[$context][$targetId] = $this->sectionBodyCache[$context][$previousId];
            $key = mb_strtolower(preg_replace('/\s+/u', ' ', $this->text($previous)));
            foreach ($this->referenceHeadingKeys($this->paragraphFirstLine($previous)) as $headingKey) if (isset($sources[$headingKey])) return $this->sectionBodyCache[$context][$targetId] = $sources[$headingKey];
            if ($this->isChapterParagraph($previous)) break;
            $heading = $this->similarReferenceHeading($key, $headingProfiles);
            if ($heading) {
                $sourceKey = mb_strtolower(preg_replace('/\s+/u', ' ', $this->text($heading)));
                return $this->sectionBodyCache[$context][$targetId] = $sources[$sourceKey] ?? null;
            }
        }
        return $this->sectionBodyCache[$context][$targetId] = null;
    }

    private function normalizeCombinedChapterTitles(DOMXPath $student, DOMXPath $reference, array $chapters): void
    {
        $sources = [];
        foreach ($chapters as $chapter) $sources[$this->chapterKey($this->paragraphFirstLine($chapter))][] = $chapter;
        foreach ($this->referenceParagraphRoles($student)['chapter'] ?? [] as $target) {
            $text = $this->text($target);
            if (!$this->isChapter($text) || $student->query('.//w:tab | .//w:br | .//w:cr | .//w:fldChar | .//w:fldSimple | .//w:drawing | .//w:pict | .//w:hyperlink | .//w:bookmarkStart', $target)->length
                || !preg_match('/^(CHAPTER\s+(?:[0-9]+|[A-Z]+))\s*[:.\-]?\s+(.+)$/iu', $text, $parts)) continue;
            $matches = $sources[$this->chapterKey($parts[1])] ?? [];
            if (count($matches) !== 1) continue;
            $source = $matches[0];
            $sourceLine = $this->paragraphFirstLine($source);
            $broken = $reference->query('.//w:br | .//w:cr', $source)->length && $this->chapterKey($sourceLine) !== '' && $this->text($source) !== $sourceLine;
            $separate = false;
            if (!$broken && preg_match('/^CHAPTER\s+(?:[0-9]+|[A-Z]+)\s*[:.\-]?$/i', $sourceLine)) {
                for ($next = $source->nextSibling; $next; $next = $next->nextSibling) {
                    if (!$next instanceof DOMElement) continue;
                    if ($next->localName !== 'p') break;
                    if ($this->text($next) === '') continue;
                    $separate = $this->isReferenceTopicHeading($next, $reference) && !$this->isChapterParagraph($next);
                    break;
                }
            }
            if (!$broken && !$separate) continue;
            // Only plain chapter-label/title runs are rebuilt. Complex fields stay intact.
            if ($student->query('./*[not(self::w:pPr or self::w:r)] | ./w:r/*[not(self::w:rPr or self::w:t)]', $target)->length) continue;
            $runProperties = $student->query('./w:r[w:t][1]/w:rPr', $target)->item(0);
            $makeRun = function ($value) use ($target, $runProperties) {
                $run = $target->ownerDocument->createElementNS(self::W, 'w:r');
                if ($runProperties) $run->appendChild($runProperties->cloneNode(true));
                $t = $target->ownerDocument->createElementNS(self::W, 'w:t'); $t->appendChild($target->ownerDocument->createTextNode($value)); $run->appendChild($t); return $run;
            };
            foreach (iterator_to_array($student->query('./w:r', $target)) as $run) $target->removeChild($run);
            $target->appendChild($makeRun($parts[1]));
            if ($separate) {
                $title = $target->ownerDocument->createElementNS(self::W, 'w:p');
                $pr = $student->query('./w:pPr', $target)->item(0); if ($pr) $title->appendChild($pr->cloneNode(true));
                foreach (iterator_to_array($student->query('./w:pPr/w:sectPr', $target)) as $section) $section->parentNode->removeChild($section);
                $title->appendChild($makeRun($parts[2])); $target->parentNode->insertBefore($title, $target->nextSibling);
            } else {
                $run = $target->ownerDocument->createElementNS(self::W, 'w:r'); $run->appendChild($target->ownerDocument->createElementNS(self::W, 'w:br')); $target->appendChild($run); $target->appendChild($makeRun($parts[2]));
            }
        }
    }

    private function isChapterParagraph(DOMElement $paragraph): bool
    {
        if ($paragraph->getElementsByTagNameNS(self::W, 'tab')->length) return false;
        foreach ($paragraph->getElementsByTagNameNS(self::W, 'pStyle') as $style) if (preg_match('/^TOC/i', $style->getAttributeNS(self::W, 'val'))) return false;
        if ($this->isChapter($this->text($paragraph))) return true;
        return $this->isChapter($this->paragraphFirstLine($paragraph));
    }

    private function paragraphFirstLine(DOMElement $paragraph): string
    {
        // Word can store a chapter label and its title in one paragraph with a line break.
        $firstLine = '';
        foreach ($paragraph->getElementsByTagNameNS(self::W, '*') as $node) {
            if ($node->localName === 'br' || $node->localName === 'cr') {
                if ($firstLine !== '') break;
                continue;
            }
            if ($node->localName === 't') $firstLine .= $node->textContent;
        }
        return trim($firstLine);
    }

    private function chapterContinuation(DOMElement $paragraph): string
    {
        $firstLine = $this->paragraphFirstLine($paragraph);
        return $this->isChapter($firstLine) ? trim(mb_substr($this->text($paragraph), mb_strlen($firstLine))) : '';
    }

    private function referenceStartsPage(DOMElement $source, DOMXPath $xp): bool
    {
        foreach ($xp->query('.//w:br | .//w:t', $source) as $node) {
            if ($node->localName === 't' && trim($node->textContent) !== '') break;
            if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') return true;
        }
        for ($previous = $source->previousSibling; $previous; $previous = $previous->previousSibling) {
            if (!$previous instanceof DOMElement) continue;
            if ($previous->localName !== 'p') return false;
            if ($xp->query('./w:pPr/w:sectPr', $previous)->length) {
                // A section boundary is stored on the paragraph ending the prior section.
                $nextSection = $xp->query('following::w:sectPr[1]', $previous)->item(0);
                $type = $nextSection ? $xp->evaluate('string(./w:type/@w:val)', $nextSection) : '';
                return !in_array($type, ['continuous', 'nextColumn'], true);
            }
            foreach (array_reverse(iterator_to_array($xp->query('.//w:br | .//w:t', $previous))) as $node) {
                if ($node->localName === 't' && trim($node->textContent) !== '') return false;
                if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') return true;
            }
            if ($xp->query('.//w:drawing | .//w:pict | .//w:object', $previous)->length) return false;
        }
        return false;
    }

    private function materializePageStart(DOMElement $paragraph, DOMXPath $xp): void
    {
        // docx-preview does not split on pageBreakBefore. Use an equivalent
        // leading run break so Word, preview and download share the boundary.
        $pr = $this->ensure($paragraph, 'pPr', true);
        $this->attr($this->ensure($pr, 'pageBreakBefore'), 'val', 0);
        foreach ($xp->query('.//w:br | .//w:t', $paragraph) as $node) {
            if ($node->localName === 't' && trim($node->textContent) !== '') break;
            if ($node->localName === 'br' && $node->getAttributeNS(self::W, 'type') === 'page') return;
        }
        $run = $paragraph->ownerDocument->createElementNS(self::W, 'w:r');
        $break = $paragraph->ownerDocument->createElementNS(self::W, 'w:br');
        $this->attr($break, 'type', 'page'); $run->appendChild($break);
        $paragraph->insertBefore($run, $pr->nextSibling);
    }

    private function isReferenceTopicHeading(DOMElement $paragraph, DOMXPath $xp): bool
    {
        if ($this->isTopicHeading($paragraph, $xp)) return true;
        $text = $this->text($paragraph);
        if (str_starts_with($text, '[')) return false;
        if ($text === '' || mb_strlen($text) > 140 || preg_match('/[.!?;:]$/u', $text) || $xp->query('./w:pPr/w:numPr', $paragraph)->length) return false;
        return (bool) preg_match('/\p{L}/u', $text);
    }

    private function joinSplitIndexEntries(DOMXPath $xp, array $roles): bool
    {
        $changed = false;
        $leader = '/(?:\.{2,}|[\x{2024}-\x{2026}])/u';
        foreach ($roles as $role => $paragraphs) {
            if (!str_starts_with($role, 'index:') || !str_ends_with($role, ':entry')) continue;
            foreach ($paragraphs as $first) {
                if (!$first->parentNode || $this->isChapterParagraph($first)) continue;
                $text = trim($this->text($first));
                $next = $first->nextSibling;
                while ($next && !$next instanceof DOMElement) $next = $next->nextSibling;
                if (!$next instanceof DOMElement || $next->localName !== 'p' || !in_array($next, $paragraphs, true)) continue;
                $nextText = trim($this->text($next));
                $pageOnly = preg_match('/^(?:[0-9]+|[ivxlcdm]+)$/iu', $nextText);
                $splitPage = preg_match($leader, $text) && !preg_match('/(?:[0-9]+|[ivxlcdm]+)$/iu', $text) && $pageOnly;
                $splitTitle = in_array($role, ['index:LIST OF TABLES:entry', 'index:LIST OF FIGURES:entry'], true) && !preg_match($leader, $text) && preg_match('/^(?:\p{Ll}|[0-9])/u', $nextText) && preg_match($leader, $nextText) && preg_match('/(?:[0-9]+|[ivxlcdm]+)$/iu', $nextText);
                if (!$splitPage && !$splitTitle) continue;
                foreach ([$first, $next] as $node) if ($xp->query('./*[not(self::w:pPr or self::w:r)] | ./w:r/*[not(self::w:rPr or self::w:t or self::w:tab or self::w:br)] | ./w:pPr/w:sectPr', $node)->length) continue 2;
                $space = $first->ownerDocument->createElementNS(self::W, 'w:r');
                $t = $first->ownerDocument->createElementNS(self::W, 'w:t'); $t->setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); $t->appendChild($first->ownerDocument->createTextNode(' ')); $space->appendChild($t); $first->appendChild($space);
                foreach (iterator_to_array($xp->query('./w:r', $next)) as $run) $first->appendChild($run);
                $next->parentNode->removeChild($next); $changed = true;
            }
        }
        return $changed;
    }

    private function indexEntryKey(DOMElement $paragraph): string
    {
        $xp = new DOMXPath($paragraph->ownerDocument); $xp->registerNamespace('w', self::W);
        $text = '';
        foreach ($xp->query('.//w:t | .//w:tab | .//w:br', $paragraph) as $node) $text .= $node->localName === 't' ? $node->textContent : ' ';
        $text = str_replace(["\u{2026}", "\u{2025}", "\u{2024}"], ['...', '..', '.'], $text);
        $text = preg_replace('/(?:\.{2,}|\s)\s*(?:[0-9]+|[ivxlcdm]+)\s*$/iu', '', $text);
        return mb_strtolower(trim(preg_replace('/[^\p{L}\p{N}\[\]]+/u', ' ', $text)));
    }

    private function normalizeIndexLeader(DOMElement $source, DOMElement $target, DOMXPath $referenceXp, DOMXPath $studentXp, ?DOMXPath $referenceStyles = null): void
    {
        // Replace typed dots only where the selected template supplies a real
        // right-aligned dotted tab. Field-based indexes remain untouched.
        $tabs = $referenceXp->query('./w:pPr/w:tabs', $source)->item(0) ?? $this->inheritedParagraphProperty($source, $referenceXp, $referenceStyles, 'tabs');
        $dottedRight = false;
        if ($tabs) foreach ($tabs->childNodes as $tab) if ($tab instanceof DOMElement && $tab->localName === 'tab' && $tab->getAttributeNS(self::W, 'val') === 'right' && $tab->getAttributeNS(self::W, 'leader') === 'dot') $dottedRight = true;
        if (!$dottedRight
            || $studentXp->query('./*[not(self::w:pPr or self::w:r)] | ./w:r/*[not(self::w:rPr or self::w:t or self::w:tab or self::w:br)]', $target)->length
            || $studentXp->query('.//w:br[@w:type="page" or @w:type="column"]', $target)->length) return;
        $text = '';
        foreach ($studentXp->query('./w:r/w:t | ./w:r/w:tab | ./w:r/w:br', $target) as $node) $text .= $node->localName === 't' ? $node->textContent : ($node->localName === 'tab' ? "\t" : "\n");
        $text = str_replace(["\u{2026}", "\u{2025}", "\u{2024}"], ['...', '..', '.'], $text);
        if (!preg_match('/^(.+?)(?:\.{3,}|[\t\n])\s*(\d+|[ivxlcdm]+)\s*$/isu', $text, $parts)) return;
        $title = trim(preg_replace('/\s+/u', ' ', $parts[1]));
        $style = $studentXp->query('./w:r[w:t][1]/w:rPr', $target)->item(0);
        $run = $target->ownerDocument->createElementNS(self::W, 'w:r');
        if ($style) $run->appendChild($style->cloneNode(true));
        foreach ([$title, null, $parts[2]] as $value) {
            $node = $target->ownerDocument->createElementNS(self::W, $value === null ? 'w:tab' : 'w:t');
            if ($value !== null) $node->appendChild($target->ownerDocument->createTextNode($value));
            $run->appendChild($node);
        }
        foreach (iterator_to_array($studentXp->query('./w:r', $target)) as $old) $target->removeChild($old);
        $target->appendChild($run);
    }

    private function copyReferenceParagraph(DOMElement $source, DOMElement $target, DOMXPath $referenceXp, DOMXPath $studentXp, array $paragraphProperties, array $runProperties, ?DOMXPath $referenceStyles = null): void
    {
        $sourcePr = $referenceXp->query('./w:pPr', $source)->item(0);
        $targetPr = $studentXp->query('./w:pPr', $target)->item(0);
        if ($sourcePr || $targetPr) {
            $targetPr ??= $this->ensure($target, 'pPr', true);
            foreach ($paragraphProperties as $name) {
                foreach (iterator_to_array($studentXp->query('./w:'.$name, $targetPr)) as $old) $old->parentNode->removeChild($old);
                $targetProperty = $this->ensure($targetPr, $name);
                if ($sourcePr) {
                    $copy = $referenceXp->query('./w:'.$name, $sourcePr)->item(0);
                    if ($copy) $targetPr->replaceChild($target->ownerDocument->importNode($copy, true), $targetProperty);
                    else $targetPr->removeChild($targetProperty);
                } else {
                    $targetPr->removeChild($targetProperty);
                }
            }
        }
        $sourceRun = $referenceXp->query('(./w:r[.//w:t] | ./w:hyperlink/w:r[w:t])[1]', $source)->item(0);
        $sourceRunPr = $sourceRun instanceof DOMElement ? $referenceXp->query('./w:rPr', $sourceRun)->item(0) : null;
        foreach ($studentXp->query('./w:r[.//w:t] | ./w:hyperlink/w:r[w:t]', $target) as $run) {
            if (!$run instanceof DOMElement) continue;
            $targetRunPr = $studentXp->query('./w:rPr', $run)->item(0);
            if (!$sourceRunPr && !$targetRunPr && !in_array('i', $runProperties, true)) continue;
            $targetRunPr ??= $this->ensure($run, 'rPr', true);
            foreach ($runProperties as $name) {
                foreach (iterator_to_array($studentXp->query('./w:'.$name, $targetRunPr)) as $old) $old->parentNode->removeChild($old);
                $targetProperty = $this->ensure($targetRunPr, $name);
                if ($sourceRunPr) {
                    $copy = $referenceXp->query('./w:'.$name, $sourceRunPr)->item(0);
                    if ($copy) $targetRunPr->replaceChild($run->ownerDocument->importNode($copy, true), $targetProperty);
                    else $targetRunPr->removeChild($targetProperty);
                } else {
                    $targetRunPr->removeChild($targetProperty);
                }
            }
            // Absence of w:i does not cancel an italic inherited from a retained
            // student default style. Materialize the template's effective value.
            foreach (['i', 'iCs'] as $toggle) if (in_array($toggle, $runProperties, true)) {
                $value = $this->referenceRunToggle($source, $sourceRun instanceof DOMElement ? $sourceRun : null, $referenceXp, $referenceStyles, $toggle);
                $this->attr($this->ensure($targetRunPr, $toggle), 'val', $value ? 1 : 0);
            }
        }
    }

    private function referenceRunToggle(DOMElement $paragraph, ?DOMElement $run, DOMXPath $xp, ?DOMXPath $styles, string $name): bool
    {
        $cacheKey = spl_object_id($paragraph).':'.($run ? $run->getNodePath() : '').':'.$name;
        if (array_key_exists($cacheKey, $this->referenceToggleCache)) return $this->referenceToggleCache[$cacheKey];
        $enabled = false;
        $on = static fn ($node) => !in_array(strtolower($node->getAttributeNS(self::W, 'val')), ['0', 'false', 'off'], true);
        if ($styles) {
            $default = $styles->query('/w:styles/w:docDefaults/w:rPrDefault/w:rPr/w:'.$name)->item(0);
            if ($default) $enabled = $on($default);
            $paragraphStyle = $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $paragraph);
            if ($paragraphStyle === '') $paragraphStyle = $styles->evaluate('string(/w:styles/w:style[@w:type="paragraph" and (@w:default="1" or @w:default="true")]/@w:styleId)');
            $runStyle = $run ? $xp->evaluate('string(./w:rPr/w:rStyle/@w:val)', $run) : '';
            foreach ([$paragraphStyle, $runStyle] as $id) {
                $chain = []; $seen = [];
                while ($id !== '' && !isset($seen[$id])) {
                    $seen[$id] = true; $style = null;
                    foreach ($styles->query('/w:styles/w:style') as $candidate) if ($candidate->getAttributeNS(self::W, 'styleId') === $id) { $style = $candidate; break; }
                    if (!$style) break;
                    $chain[] = $style;
                    $id = $styles->evaluate('string(./w:basedOn/@w:val)', $style);
                }
                // In a style hierarchy italic is a toggle; direct run formatting
                // below is an absolute on/off value.
                foreach (array_reverse($chain) as $style) {
                    $property = $styles->query('./w:rPr/w:'.$name, $style)->item(0);
                    if ($property && $on($property)) $enabled = !$enabled;
                }
            }
        }
        $direct = $run ? $xp->query('./w:rPr/w:'.$name, $run)->item(0) : null;
        return $this->referenceToggleCache[$cacheKey] = $direct ? $on($direct) : $enabled;
    }

    private function referenceRules(string $path): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) throw new InvalidArgumentException('The admin reference template is not a valid Word document.');
        try {
            $xml = $zip->getFromName('word/document.xml');
            if ($xml === false || stripos($xml, '<!DOCTYPE') !== false) throw new InvalidArgumentException('The admin reference template is not a valid Word document.');
            $doc = new DOMDocument;
            if (!@$doc->loadXML($xml, LIBXML_NONET)) throw new InvalidArgumentException('The admin reference template contains invalid document XML.');
            $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
            $stylesXp = null; $stylesXml = $zip->getFromName('word/styles.xml');
            if ($stylesXml !== false && stripos($stylesXml, '<!DOCTYPE') === false) {
                $styles = new DOMDocument;
                if (@$styles->loadXML($stylesXml, LIBXML_NONET)) { $stylesXp = new DOMXPath($styles); $stylesXp->registerNamespace('w', self::W); }
            }

            $candidates = []; $afterChapter = [];
            $chapterSeen = false;
            foreach ($xp->query('/w:document/w:body/w:p') as $paragraph) {
                if (!$paragraph instanceof DOMElement) continue;
                $text = $this->text($paragraph);
                if ($this->isChapterParagraph($paragraph)) { $chapterSeen = true; continue; }
                if ($text === '' || $this->isReferenceTopicHeading($paragraph, $xp)) continue;
                $candidates[] = $paragraph;
                if ($chapterSeen) $afterChapter[] = $paragraph;
            }
            $bodyParagraph = $afterChapter[0] ?? $candidates[0] ?? null;
            $direct = static function (?DOMElement $parent, string $name): ?DOMElement {
                if (!$parent) return null;
                foreach ($parent->childNodes as $child) if ($child instanceof DOMElement && $child->namespaceURI === self::W && $child->localName === $name) return $child;
                return null;
            };
            $paragraphProperties = $bodyParagraph ? $xp->query('./w:pPr', $bodyParagraph)->item(0) : null;
            $firstRun = $bodyParagraph ? $xp->query('./w:r[.//w:t][1]', $bodyParagraph)->item(0) : null;
            $runProperties = $direct($firstRun instanceof DOMElement ? $firstRun : null, 'rPr');
            $styleChain = static function (?DOMXPath $styleXPath, ?DOMElement $properties, string $referenceName) use ($direct): array {
                if (!$styleXPath || !$properties) return [];
                $reference = $direct($properties, $referenceName);
                $styleId = $reference?->getAttributeNS(self::W, 'val') ?? '';
                $styles = []; $seen = [];
                while ($styleId !== '' && !isset($seen[$styleId])) {
                    $seen[$styleId] = true; $style = null;
                    foreach ($styleXPath->query('//w:style') as $candidate) {
                        if ($candidate instanceof DOMElement && $candidate->getAttributeNS(self::W, 'styleId') === $styleId) { $style = $candidate; break; }
                    }
                    if (!$style) break;
                    $styles[] = $style;
                    $basedOn = $direct($style, 'basedOn');
                    $styleId = $basedOn?->getAttributeNS(self::W, 'val') ?? '';
                }
                return $styles;
            };
            $paragraphStyles = $styleChain($stylesXp, $paragraphProperties instanceof DOMElement ? $paragraphProperties : null, 'pStyle');
            $runStyles = $styleChain($stylesXp, $runProperties, 'rStyle');
            $paragraphStyleProperties = array_values(array_filter(array_map(fn ($style) => $direct($style, 'pPr'), $paragraphStyles)));
            $paragraphStyleRuns = array_values(array_filter(array_map(fn ($style) => $direct($style, 'rPr'), $paragraphStyles)));
            $runStyleRuns = array_values(array_filter(array_map(fn ($style) => $direct($style, 'rPr'), $runStyles)));
            $normalParagraph = $stylesXp?->query('//w:style[@w:styleId="Normal"]/w:pPr')->item(0);
            $defaultParagraph = $stylesXp?->query('//w:docDefaults/w:pPrDefault/w:pPr')->item(0);
            $normalRun = $stylesXp?->query('//w:style[@w:styleId="Normal"]/w:rPr')->item(0);
            $defaultRun = $stylesXp?->query('//w:docDefaults/w:rPrDefault/w:rPr')->item(0);
            $rules = [];

            foreach (array_merge([$runProperties], $runStyleRuns, $paragraphStyleRuns, [$normalRun, $defaultRun]) as $properties) {
                if (!$properties) continue;
                $propertyXPath = $properties->ownerDocument === $doc ? $xp : $stylesXp;
                $font = $propertyXPath->evaluate('string(./w:rFonts/@w:ascii | ./w:rFonts/@w:hAnsi)', $properties);
                if ($font !== '') { $rules[] = ['type' => 'font', 'value' => $font]; break; }
            }
            $fontSize = null;
            foreach (array_merge([$runProperties], $runStyleRuns, $paragraphStyleRuns, [$normalRun, $defaultRun]) as $properties) {
                if (!$properties) continue;
                $propertyXPath = $properties->ownerDocument === $doc ? $xp : $stylesXp;
                $value = $propertyXPath->evaluate('string(./w:sz/@w:val)', $properties);
                if (is_numeric($value) && (float) $value > 0) { $fontSize = (float) $value / 2; break; }
            }
            if ($fontSize !== null) $rules[] = ['type' => 'size', 'value' => $fontSize];

            foreach (array_merge([$paragraphProperties], $paragraphStyleProperties, [$normalParagraph, $defaultParagraph]) as $properties) {
                if (!$properties) continue;
                $propertyXPath = $properties->ownerDocument === $doc ? $xp : $stylesXp;
                $spacing = $propertyXPath->query('./w:spacing[@w:line]', $properties)->item(0);
                if ($spacing) {
                    $line = (float) $spacing->getAttributeNS(self::W, 'line');
                    $lineRule = $spacing->getAttributeNS(self::W, 'lineRule');
                    if ($line > 0) {
                        $multiplier = $lineRule === 'exact' && $fontSize ? $line / ($fontSize * 20) : $line / 240;
                        if ($multiplier > 0 && $multiplier <= 5) $rules[] = ['type' => 'spacing', 'value' => round($multiplier, 3)];
                    }
                    break;
                }
            }
            $hasIndentation = false;
            foreach (array_merge([$paragraphProperties], $paragraphStyleProperties, [$normalParagraph, $defaultParagraph]) as $properties) {
                if (!$properties) continue;
                $propertyXPath = $properties->ownerDocument === $doc ? $xp : $stylesXp;
                $value = $propertyXPath->evaluate('string(./w:ind/@w:firstLine)', $properties);
                if (is_numeric($value) && (float) $value >= 0) { $rules[] = ['type' => 'indentation', 'value' => (float) $value / 1440]; $hasIndentation = true; break; }
            }
            if (!$hasIndentation && $bodyParagraph) {
                $firstContent = $xp->query('./w:r[1]/*[self::w:tab or self::w:t][1]', $bodyParagraph)->item(0);
                if ($firstContent instanceof DOMElement && $firstContent->localName === 'tab') {
                    $tabPosition = $xp->evaluate('string(./w:pPr/w:tabs/w:tab[@w:val="left" or not(@w:val)][1]/@w:pos)', $bodyParagraph);
                    $rules[] = ['type' => 'indentation', 'value' => (is_numeric($tabPosition) && (float) $tabPosition > 0 ? (float) $tabPosition : 720) / 1440];
                }
            }
            foreach (array_merge([$paragraphProperties], $paragraphStyleProperties, [$normalParagraph, $defaultParagraph]) as $properties) {
                if (!$properties) continue;
                $propertyXPath = $properties->ownerDocument === $doc ? $xp : $stylesXp;
                $alignment = $propertyXPath->evaluate('string(./w:jc/@w:val)', $properties);
                if (in_array($alignment, ['left', 'right', 'center', 'both'], true)) { $rules[] = ['type' => 'alignment', 'value' => $alignment]; break; }
            }

            $section = $xp->query('//w:sectPr')->item($xp->query('//w:sectPr')->length - 1);
            if ($section) {
                $pageSize = $xp->query('./w:pgSz', $section)->item(0);
                $width = $pageSize?->getAttributeNS(self::W, 'w'); $height = $pageSize?->getAttributeNS(self::W, 'h');
                if (is_numeric($width) && is_numeric($height) && $width > 0 && $height > 0) $rules[] = ['type' => 'page-size', 'value' => ['width' => (int) $width, 'height' => (int) $height]];
                $pageMargins = $xp->query('./w:pgMar', $section)->item(0);
                if ($pageMargins) {
                    $margins = [];
                    foreach (['top', 'bottom', 'left', 'right'] as $side) {
                        $value = $pageMargins->getAttributeNS(self::W, $side);
                        if (is_numeric($value)) $margins[$side] = (float) $value / 1440;
                    }
                    if ($margins) $rules[] = ['type' => 'margin', 'value' => $margins];
                }
            }
            return $rules;
        } finally { $zip->close(); }
    }

    /** @deprecated Historical checklist compatibility; application endpoints use the template-specific methods above. */
    public function format(string $path, array $rules): array
    {
        if (empty($rules)) {
            $zip = new ZipArchive;
            $zip->open($path);
            $zip->close();
            return ['settings' => $this->settings([]), 'paragraphs_processed' => 0,
                'applied_rules' => [], 'manual_review_rules' => [],
                'manual_review_required' => false,
                'note' => 'No admin formatting rules were selected, so the paper was left unchanged.'];
        }

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
            $this->centerStandalonePictures($xp);
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

    private function isolateSectionDividers(DOMXPath $xp, array $cfg, bool $preserveTypography = false): void
    {
        foreach ($xp->query('/w:document/w:body/w:p') as $p) {
            if (!in_array(strtoupper($this->text($p)), ['REFERENCES', 'APPENDICES'], true)) continue;
            if (preg_match('/^TOC/i', $xp->evaluate('string(./w:pPr/w:pStyle/@w:val)', $p))) continue;
            // Shared divider style requested for every admin template.
            foreach ($p->getElementsByTagNameNS(self::W, 't') as $text) $text->textContent = strtoupper($text->textContent);
            $this->centerTitleParagraph($p, $xp);
            foreach ($xp->query('.//w:r', $p) as $run) {
                if ($preserveTypography) continue;
                $rPr = $this->ensure($run, 'rPr', true);
                foreach (['b', 'bCs'] as $key) $this->attr($this->ensure($rPr, $key), 'val', 1);
                foreach (['sz', 'szCs'] as $key) $this->attr($this->ensure($rPr, $key), 'val', 76);
            }
            $section = $xp->query('.//w:sectPr | following::w:sectPr[1]', $p)->item(0);
            $top = $xp->evaluate('string(./w:pgMar/@w:top)', $section);
            $bottom = $xp->evaluate('string(./w:pgMar/@w:bottom)', $section);
            $pageHeight = $xp->evaluate('string(./w:pgSz/@w:h)', $section);
            $height = ($pageHeight !== '' ? (float) $pageHeight : $cfg['height']) - ($top !== '' ? (float) $top : 1440) - ($bottom !== '' ? (float) $bottom : 1440);
            $fontSize = $preserveTypography ? $xp->evaluate('string(.//w:rPr/w:sz/@w:val)', $p) : 76;
            $lineHeight = is_numeric($fontSize) ? round((float) $fontSize * 12) : 912;
            $spacing = $this->ensure($this->ensure($p, 'pPr', true), 'spacing');
            $this->attr($spacing, 'line', $lineHeight); $this->attr($spacing, 'lineRule', 'exact');
            $this->attr($spacing, 'before', max(0, round(($height - $lineHeight) / 2))); $this->attr($spacing, 'after', 0);
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

    private function centerStandalonePictures(DOMXPath $xp): void
    {
        foreach ($xp->query('/w:document/w:body/w:p[w:r/w:drawing or w:r/w:pict]') as $p) {
            if ($this->text($p) !== '') continue;
            if (!$xp->query('.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"] | .//*[local-name()="imagedata"]', $p)->length) continue;
            $this->centerTitleParagraph($p, $xp);
            foreach (iterator_to_array($xp->query('./w:r/w:drawing/*[local-name()="anchor"]', $p)) as $anchor) {
                if (!$xp->query('.//*[local-name()="pic" and namespace-uri()="http://schemas.openxmlformats.org/drawingml/2006/picture"]', $anchor)->length) continue;
                $inline = $p->ownerDocument->createElementNS($anchor->namespaceURI, 'wp:inline');
                foreach (['distT', 'distB', 'distL', 'distR'] as $distance) $inline->setAttribute($distance, '0');
                foreach (iterator_to_array($anchor->childNodes) as $child) {
                    if ($child instanceof DOMElement && in_array($child->localName, ['extent', 'effectExtent', 'docPr', 'cNvGraphicFramePr', 'graphic'], true)) $inline->appendChild($child);
                }
                $anchor->parentNode->replaceChild($inline, $anchor);
            }
            // Vertical placement applies to dedicated image pages, including
            // an appendix label/title above the image, not figures in body text.
            $startsPage = fn (DOMElement $node) => $xp->query('.//w:br[@w:type="page"] | ./w:pPr/w:pageBreakBefore[not(@w:val="0" or @w:val="false" or @w:val="off")]', $node)->length > 0;
            $dedicated = $startsPage($p); $reserved = 0;
            for ($previous = $p->previousSibling; !$dedicated && $previous; $previous = $previous->previousSibling) {
                if (!$previous instanceof DOMElement || $previous->localName !== 'p') break;
                $text = $this->text($previous);
                if ($text !== '' && !$this->isAppendixHeader($previous, $xp) && !preg_match('/^curriculum\s+vitae\s*[:.]?$/iu', $text)) break;
                if ($xp->query('.//w:drawing | .//w:pict | .//w:object', $previous)->length) break;
                $reserved += 240 + (float) $xp->evaluate('string(./w:pPr/w:spacing/@w:before)', $previous) + (float) $xp->evaluate('string(./w:pPr/w:spacing/@w:after)', $previous);
                $dedicated = $startsPage($previous);
            }
            $extents = $xp->query('./w:r/w:drawing/*[local-name()="inline"]/*[local-name()="extent"]', $p);
            if (!$dedicated || $extents->length !== 1) continue;
            $section = $xp->query('following::w:sectPr[1]', $p)->item(0);
            $height = (float) $xp->evaluate('string(./w:pgSz/@w:h)', $section) ?: 15840;
            foreach (['top', 'bottom'] as $side) {
                $value = $xp->evaluate('string(./w:pgMar/@w:'.$side.')', $section);
                $height -= $value !== '' ? (float) $value : 1440;
            }
            $imageHeight = (float) $extents->item(0)->getAttribute('cy') / 635;
            $spacing = $this->ensure($this->ensure($p, 'pPr', true), 'spacing');
            $this->attr($spacing, 'before', max(0, round(($height - $reserved - $imageHeight) / 2)));
            $this->attr($spacing, 'after', 0);
            foreach (['beforeLines', 'afterLines', 'beforeAutospacing', 'afterAutospacing'] as $name) $this->attr($spacing, $name, 0);
        }
    }

    private function removeFixedCopyHighlights(string $path): void
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) throw new InvalidArgumentException('Cannot clean the fixed document.');
        try {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if (!str_starts_with($name, 'word/') || !str_ends_with($name, '.xml')) continue;
                $xml = $zip->getFromIndex($i);
                if (stripos($xml, '<!DOCTYPE') !== false) continue;
                $doc = new DOMDocument;
                if (!@$doc->loadXML($xml, LIBXML_NONET)) continue;
                $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
                $changed = false;
                foreach (iterator_to_array($xp->query('//w:highlight | //w:shd')) as $mark) {
                    if ($mark->localName === 'shd' && !in_array(strtoupper($mark->getAttributeNS(self::W, 'fill')), ['FFFF00', 'FFF200', 'FFEB3B', 'FEF08A'], true)) continue;
                    $mark->parentNode->removeChild($mark); $changed = true;
                }
                if ($changed) $zip->addFromString($name, $doc->saveXML());
            }
        } finally { $zip->close(); }
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

    private function chapterKey(string $text): string
    {
        if (mb_strlen($text) > 180 || preg_match('/\.{3,}|[\x{2024}-\x{2026}]|[!?;]/u', $text) || !preg_match('/^CHAPTER\s+([0-9]+|[A-Z]+)(?:\s*[:.\-]?\s+[^\r\n]+)?\s*[:.\-]?$/i', trim($text), $match)) return '';
        $value = strtoupper($match[1]);
        $words = ['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN','TWENTY'];
        if (ctype_digit($value)) $number = (int) $value;
        elseif (($index = array_search($value, $words, true)) !== false) $number = $index + 1;
        elseif (preg_match('/^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/', $value)) {
            $values = ['I'=>1,'V'=>5,'X'=>10,'L'=>50,'C'=>100,'D'=>500,'M'=>1000];
            $number = 0; $last = 0;
            foreach (array_reverse(str_split($value)) as $digit) { $current = $values[$digit]; $number += $current < $last ? -$current : $current; $last = $current; }
        } else return '';
        return $number > 0 ? 'chapter:'.$number : '';
    }

    private function isChapter(string $text): bool
    {
        return $this->chapterKey($text) !== '';
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
            'sectPr' => ['headerReference','footerReference','type','pgSz','pgMar','pgBorders','pgNumType','cols','vAlign','titlePg','docGrid'],
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
