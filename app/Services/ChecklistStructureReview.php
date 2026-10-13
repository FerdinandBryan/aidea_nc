<?php
namespace App\Services;

/** Match requirements to actual section headings, excluding contents-page entries. */
class ChecklistStructureReview
{
    public function apply(array $paragraphs, array $rules, array $findings): array
    {
        $normalize = fn ($text) => mb_strtoupper(trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text)));
        $locate = function ($heading) use ($paragraphs, $normalize) {
            foreach ($paragraphs as $p) {
                if (!empty($p['toc'])) continue;
                if ($normalize($p['text']) === $normalize($heading)) return $p['paragraph'];
            }
            return 0;
        };
        foreach ($findings as &$finding) {
            $rule = $rules[$finding['rule_index']] ?? [];
            $detail = $rule['detail'] ?? $rule['name'] ?? '';
            if (strtolower($rule['type'] ?? '') === 'optional' || preg_match('/\b(if any|optional|may contain)\b/i', $detail)) continue;
            if (preg_match('/(?:manuscript\s+has\s+the\s+required\s+|must\s+(?:contain|include|have)\s+(?:the\s+)?(?:section\s+)?)["\x{201c}]?([A-Z][A-Z\s]+?)(?:["\x{201d}.:;]|$)/u', $detail, $m)) {
                $heading = trim($m[1]);
                // Title pages do not necessarily carry a literal TITLE PAGE heading.
                if ($heading === 'TITLE PAGE') continue;
                $position = $locate($heading);
                $finding['status'] = $position ? 'pass' : 'fail';
                $finding['paragraph'] = $position;
                $finding['issue_kind'] = $position ? 'section_present' : 'missing_section';
                $finding['explanation'] = $position ? 'Section heading "'.$heading.'" found in the paper.' : 'Required section heading "'.$heading.'" was not found in the paper text. A contents-page entry does not satisfy this requirement; verify any scanned pages separately.';
                $finding['suggestion'] = $position ? '' : 'Add or identify the required '.$heading.' section according to the selected admin checklist.';
                if ($position && preg_match('/maximum|pages|words/i', substr($detail, strpos($detail, $heading) + strlen($heading)))) {
                    $finding['status'] = 'manual';
                    $finding['explanation'] .= ' The additional length requirement still needs verification.';
                }
            } elseif (preg_match('/["\x{201c}]([^"\x{201d}]+)["\x{201d}]\s+(?:must|should)\s+(?:appear|come|be placed)\s+(before|after)\s+["\x{201c}]([^"\x{201d}]+)["\x{201d}]/iu', $detail, $m)) {
                $first = $locate($m[1]); $second = $locate($m[3]);
                if (!$first || !$second) continue;
                $valid = strtolower($m[2]) === 'before' ? $first < $second : $first > $second;
                $finding['status'] = $valid ? 'pass' : 'fail';
                $finding['paragraph'] = $first;
                $finding['issue_kind'] = $valid ? 'section_order_correct' : 'misplaced_section';
                $finding['explanation'] = 'The "'.$m[1].'" heading '.($valid ? 'is' : 'is not').' '.$m[2].' "'.$m[3].'" as required by the selected checklist.';
                $finding['suggestion'] = $valid ? '' : 'Move the '.$m[1].' section '.$m[2].' '.$m[3].'.';
            }
        }
        unset($finding);
        return $findings;
    }
}
