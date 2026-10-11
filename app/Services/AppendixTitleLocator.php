<?php

namespace App\Services;

use DOMElement;
use DOMXPath;

class AppendixTitleLocator
{
    public static function find(DOMElement $heading, DOMXPath $xp): ?DOMElement
    {
        $next = $heading->nextSibling;
        while ($next instanceof DOMElement && $next->localName === 'p' && self::text($next, $xp) === '' && !$xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr', $next)->length) $next = $next->nextSibling;
        if (!$next instanceof DOMElement) return null;
        $candidate = $next->localName === 'tbl' ? $xp->query('.//w:p', $next)->item(0) : $next;
        if (!$candidate instanceof DOMElement || $candidate->localName !== 'p') return null;
        $text = self::text($candidate, $xp);
        if ($text === '' || mb_strlen($text) > 180 || preg_match('/^(?:APPENDIX\s+[A-Z]\b|APPENDICES|CHAPTER\s)/i', $text)) return null;
        // The title can be in the same paragraph/table as its scanned image.
        if ($xp->query('.//w:drawing | .//w:pict | .//w:object', $next)->length) return $candidate;
        $after = $next->nextSibling;
        while ($after instanceof DOMElement && $after->localName === 'p' && self::text($after, $xp) === '' && !$xp->query('.//w:drawing | .//w:pict | .//w:object | .//w:sectPr', $after)->length) $after = $after->nextSibling;
        if ($after instanceof DOMElement && $xp->query('.//w:drawing | .//w:pict | .//w:object', $after)->length) return $candidate;
        return null;
    }

    public static function text(DOMElement $p, DOMXPath $xp): string
    {
        $text = ''; foreach ($xp->query('.//w:t[not(ancestor::w:txbxContent)]', $p) as $node) $text .= $node->textContent;
        return trim($text);
    }
}
