<?php
namespace App\Services;

use DOMDocument;
use DOMXPath;
use ZipArchive;

/** Verify stored DOCX properties, without claiming to verify rendered pagination. */
class DocxFormattingReview
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    public function apply(string $path, array $rules, array $findings, PaperFormatter $formatter): array
    {
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) return $findings;
        $xml = $zip->getFromName('word/document.xml'); $zip->close();
        $doc = new DOMDocument;
        if (!$xml || stripos($xml, '<!DOCTYPE') !== false || !@$doc->loadXML($xml, LIBXML_NONET)) return $findings;
        $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W);
        foreach ($findings as &$finding) {
            $rule = $rules[$finding['rule_index']] ?? [];
            $text = $rule['detail'] ?? $rule['name'] ?? '';
            $type = strtolower($rule['type'] ?? '');
            // Compound abstract, divider and pagination requirements still need their own checks.
            if (preg_match('/abstract|pagination|word\s+(references|appendices)/i', $text)) continue;
            $cfg = $formatter->settings([$rule]);
            $kind = null; $values = []; $target = null;
            if ($type === 'font' || preg_match('/font\s+(style|family)|typeface/i', $text)) {
                $kind = 'font'; $target = $cfg['font'];
                foreach ($xp->query('//w:body//w:r[w:t and not(ancestor::w:txbxContent) and not(ancestor::w:p[w:r/w:drawing or w:r/w:pict])]') as $run) {
                    if (trim($xp->evaluate('string(w:t)', $run)) === '') continue;
                    $values[] = $xp->evaluate('string(./w:rPr/w:rFonts/@w:ascii)', $run) ?: null;
                }
            } elseif ($type === 'size' || preg_match('/font\s+size/i', $text)) {
                $kind = 'size'; $target = $cfg['size'];
                foreach ($xp->query('//w:body//w:p[not(ancestor::w:txbxContent) and not(.//w:drawing or .//w:pict)]') as $p) {
                    $content = trim($xp->evaluate('string(.)', $p));
                    if (in_array(strtoupper($content), ['REFERENCES', 'APPENDICES'], true)) continue;
                    foreach ($xp->query('.//w:r[w:t]', $p) as $run) {
                        if (trim($xp->evaluate('string(w:t)', $run)) === '') continue;
                        $v = $xp->evaluate('string(./w:rPr/w:sz/@w:val)', $run);
                        $values[] = $v === '' ? null : (float) $v / 2;
                    }
                }
            } elseif ($type === 'margin' || preg_match('/\bmargins?\b/i', $text)) {
                $kind = 'margin'; $target = true;
                foreach ($xp->query('//w:sectPr') as $section) foreach ($cfg['margins'] as $side => $inch) {
                    $v = $xp->evaluate('string(./w:pgMar/@w:'.$side.')', $section);
                    $values[] = $v === '' ? null : abs((float) $v / 1440 - $inch) < .01;
                }
            } elseif ($type === 'paper' || preg_match('/short bond|paper size|8\.5.*11/i', $text)) {
                $kind = 'paper'; $target = true;
                foreach ($xp->query('//w:sectPr') as $section) {
                    $w = $xp->evaluate('string(./w:pgSz/@w:w)', $section); $h = $xp->evaluate('string(./w:pgSz/@w:h)', $section);
                    $values[] = $w === '' || $h === '' ? null : abs((float) $w-$cfg['width']) <= 2 && abs((float) $h-$cfg['height']) <= 2;
                }
            } elseif ($type === 'spacing' || preg_match('/double.spac|line spacing/i', $text)) {
                $kind = 'spacing'; $target = true;
                $eligible = $xp->query('//w:body//w:p[w:r/w:t and not(ancestor::w:tbl or ancestor::w:txbxContent) and not(.//w:drawing or .//w:pict)]');
                foreach ($eligible as $p) {
                    if (trim($xp->evaluate('string(.)', $p)) === '') continue;
                    $line = $xp->evaluate('string(./w:pPr/w:spacing/@w:line)', $p);
                    $mode = $xp->evaluate('string(./w:pPr/w:spacing/@w:lineRule)', $p);
                    $values[] = $line === '' || !in_array($mode, ['', 'auto'], true) ? null : true;
                }
                $issues = (new PaperAttentionMarker)->mark($path, $formatter->settings($rules), [], false)['issues'];
                if (array_filter($issues, fn ($issue) => $issue['type'] === 'spacing')) $values[] = false;
            }
            if (!$kind || $target === null || !$values) continue;
            $mismatch = array_filter($values, fn ($v) => $v !== null && (is_string($target) ? strcasecmp($v, $target) !== 0 : $v != $target));
            $unknown = in_array(null, $values, true);
            $finding['status'] = $mismatch ? 'fail' : ($unknown ? 'manual' : 'pass');
            $finding['explanation'] = $mismatch ? 'DOCX verification: stored '.$kind.' does not match the selected admin template.' : ($unknown ? 'DOCX verification: some '.$kind.' properties are inherited or unavailable; manual review is required.' : 'DOCX verification: stored '.$kind.' matches the selected admin template.');
            $finding['measurement_type'] = $kind;
            $finding['paragraph'] = 0;
        }
        unset($finding);
        return $findings;
    }
}
