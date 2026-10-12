<?php

namespace App\Services;

class GeminiFormattingPlan
{
    public const TYPES = ['font', 'size', 'spacing', 'abstract-spacing', 'cv-spacing', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'alignment', 'indentation', 'paper', 'heading-gap-lines'];

    public function resolve(array $templateRules, array $proposals, PaperFormatter $formatter): array
    {
        $accepted = []; $warnings = []; $types = [];
        $authority = $formatter->settings($templateRules);
        if (count($proposals) > 100) $warnings[] = 'Additional AI formatting instructions exceeded the processing limit and were not applied.';
        foreach (array_slice($proposals, 0, 100) as $proposal) {
            if (!is_array($proposal)) { $warnings[] = 'An invalid AI formatting instruction was not applied.'; continue; }
            $index = is_array($proposal) ? ($proposal['rule_index'] ?? null) : null;
            $rule = is_int($index) ? ($templateRules[$index] ?? null) : null;
            $type = $proposal['type'] ?? ''; $value = $proposal['value'] ?? null; $evidence = $proposal['evidence'] ?? null;
            $text = is_array($rule) ? (string) ($rule['detail'] ?? $rule['name'] ?? '') : '';
            if (!$rule || !in_array($type, self::TYPES, true) || !is_string($value) || !is_string($evidence) ||
                strlen($value) > 100 || trim($evidence) === '' || !str_contains($text, $evidence) ||
                !$this->supported($text, $type, $value, $evidence, $formatter, $rule) || !$this->matchesAuthority($authority, $type, $value)) {
                $warnings[] = 'An AI formatting instruction lacked a supported, matching admin rule and was not applied.';
                continue;
            }
            if (isset($types[$type])) {
                if ($types[$type] !== $value) { unset($accepted[$type]); $warnings[] = 'Conflicting AI formatting instructions were left for manual review.'; }
                continue;
            }
            $types[$type] = $value;
            $mappedType = $type; $mappedValue = $value;
            if (str_starts_with($type, 'margin-')) { $mappedType = 'margin'; $mappedValue = [substr($type, 7) => (float) $value]; }
            elseif (in_array($type, ['size', 'spacing', 'abstract-spacing', 'cv-spacing', 'indentation', 'heading-gap-lines'], true)) $mappedValue = (float) $value;
            $accepted[$type] = ['name' => 'Gemini mapping of admin rule '.($index + 1), 'type' => $mappedType, 'value' => $mappedValue, 'source_rule_index' => $index, 'evidence' => $evidence];
        }
        // Admin prose and explicit machine settings retain final precedence.
        return ['rules' => array_merge(array_values($accepted), $templateRules), 'accepted' => array_values($accepted), 'warnings' => array_values(array_unique($warnings)), 'requested' => count($proposals)];
    }

    private function matchesAuthority(array $authority, string $type, string $value): bool
    {
        $key = ['font' => 'font', 'size' => 'size', 'spacing' => 'spacing', 'abstract-spacing' => 'abstract', 'alignment' => 'alignment', 'indentation' => 'indentation'][$type] ?? null;
        $expected = $key ? $authority[$key] : null;
        if (str_starts_with($type, 'margin-')) $expected = $authority['margins'][substr($type, 7)] ?? null;
        if ($type === 'cv-spacing') $expected = $authority['cv']['spacing'] ?? null;
        return $expected === null || (is_numeric($expected) ? abs((float) $expected - (float) $value) < .001 : strcasecmp($expected, $value) === 0);
    }

    private function supported(string $text, string $type, string $value, string $evidence, PaperFormatter $formatter, array $rule): bool
    {
        $abstract = preg_match('/\babstract\b/i', $text); $cv = preg_match('/curriculum\s+vitae|\bCV\b/i', $text);
        if (preg_match('/\b(optional|if any|may|can|or)\b/i', $text)) return false;
        if ($type === 'spacing' && ($abstract || $cv || preg_match('/heading|header|title|caption|figure|table|reference|appendix/i', $text))) return false;
        if ($type === 'abstract-spacing' && !$abstract || $type === 'cv-spacing' && !$cv) return false;
        if (in_array($type, ['font', 'size', 'alignment', 'indentation'], true) && preg_match('/abstract|curriculum|\bCV\b|heading|header|title|caption|figure|table|references|appendix/i', $text)) return false;
        $source = mb_strtolower($evidence);
        $known = $formatter->settings([$rule]);
        if ($type === 'font') {
            if (!preg_match('/font|typeface/i', $text) || !preg_match('/^[\p{L}\p{N} .-]{2,80}$/u', $value) || !str_contains($source, mb_strtolower($value))) return false;
            if ($known['font']) return strcasecmp($known['font'], $value) === 0;
            if (!preg_match('/\b(?:typeface|font(?:\s+(?:face|family|style))?)(?:\s+(?:is|must\s+be|should\s+be|required))?\s*[:=]?\s*([\p{L}\p{N} .-]+?)(?:[.;]|$|\s+(?:in|for|at|with)\b)/iu', $evidence, $match)) return false;
            return strcasecmp(trim($match[1]), trim($value)) === 0;
        }
        if ($type === 'alignment') {
            if (!in_array($value, ['left', 'right', 'center', 'both'], true) || !preg_match('/align|justif/i', $text)) return false;
            return preg_match($value === 'both' ? '/justif/i' : '/\b'.preg_quote($value, '/').'\b/i', $evidence) && (!$known['alignment'] || $known['alignment'] === $value);
        }
        if ($type === 'paper') {
            if (!preg_match('/paper|bond|sheet/i', $text)) return false;
            return match ($value) { 'letter' => (bool) preg_match('/\bletter\b|short\s+bond|8\.5.*11/i', $evidence), 'a4' => (bool) preg_match('/\bA4\b/i', $evidence), 'legal' => (bool) preg_match('/\blegal\b|8\.5.*14/i', $evidence), default => false };
        }
        if (!is_numeric($value) || !is_finite((float) $value)) return false;
        $number = (float) $value;
        $hasNumber = preg_match('/(?<![\d.])'.preg_quote((string) $number, '/').'(?![\d.])/', $evidence);
        if (in_array($type, ['spacing', 'abstract-spacing', 'cv-spacing'], true)) {
            $numericEvidence = $hasNumber && preg_match('/spac|line height/i', $evidence);
            $namedEvidence = $number === 2.0 && preg_match('/double.*spac/i', $evidence) || $number === 1.0 && preg_match('/single.*spac/i', $evidence);
            $target = $type === 'abstract-spacing' ? $known['abstract'] : ($type === 'cv-spacing' ? ($known['cv']['spacing'] ?? null) : $known['spacing']);
            return $number > 0 && $number <= 5 && ($numericEvidence || $namedEvidence) && ($target === null || abs($target - $number) < .001);
        }
        if ($type === 'size') return $number >= 1 && $number <= 100 && $hasNumber && preg_match('/font|point|\bpt\b/i', $evidence) && ($known['size'] === null || abs($known['size'] - $number) < .001);
        if ($type === 'indentation') return $number >= 0 && $number <= 5 && $hasNumber && preg_match('/indent.*(?:inch|in\b|["\x{2033}])/iu', $evidence) && ($known['indentation'] === null || abs($known['indentation'] - $number) < .001);
        if ($type === 'heading-gap-lines') return $number >= 0 && $number <= 5 && preg_match('/heading|header|title/i', $text) && preg_match('/after|before.*explanation|before.*definition/i', $text) && ($hasNumber || $number === 2.0 && preg_match('/two\s+(?:blank\s+)?lines/i', $evidence) || $number === 1.0 && preg_match('/one\s+(?:blank\s+)?line/i', $evidence));
        if (str_starts_with($type, 'margin-')) {
            $side = substr($type, 7);
            if ($number < 0 || $number > 4 || !$hasNumber || !preg_match('/margin/i', $text)) return false;
            if (isset($known['margins'][$side])) return abs($known['margins'][$side] - $number) < .001;
            $literal = preg_quote((string) $number, '/');
            return (bool) preg_match('/\b'.$side.'(?:\s+margin)?(?:\s+is)?\s*[:=–-]?\s*'.$literal.'\s*(?:inch|in\b|["\x{2033}\x{27}])|'.$literal.'\s*(?:inches?|in\b)\s+(?:on\s+)?(?:the\s+)?'.$side.'\b/iu', $evidence);
        }
        return false;
    }
}
