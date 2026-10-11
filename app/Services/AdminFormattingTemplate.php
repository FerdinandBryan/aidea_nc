<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminFormattingTemplate
{
    public function load(string $id): array
    {
        $row = DB::table('format_templates')->orderBy('id')->first();
        $list = $row ? json_decode($row->data, true) : [];
        $template = collect(is_array($list) ? $list : [])->first(fn ($item) =>
            is_array($item) && (string) ($item['id'] ?? '') === $id);
        if (!$template || empty($template['active']) || !is_array($template['rules'] ?? null)) {
            throw ValidationException::withMessages(['template_id' => 'Select an active format template saved by the admin.']);
        }
        $rules = $template['rules'];
        $formatting = $template['formatting'] ?? [];
        if (!is_array($formatting)) throw ValidationException::withMessages(['template_id' => 'The admin template has invalid formatting settings.']);
        $types = ['font' => 'font', 'font_size' => 'size', 'line_spacing' => 'spacing',
            'abstract_spacing' => 'abstract-spacing', 'margins' => 'margin',
            'alignment' => 'alignment', 'first_line_indent' => 'indentation', 'paper_size' => 'paper'];
        foreach ($formatting as $name => $value) {
            if (!isset($types[$name])) throw ValidationException::withMessages(['template_id' => 'Unknown admin formatting setting: '.$name]);
            if ($value === null || $value === '') continue;
            if (in_array($name, ['font_size', 'line_spacing', 'abstract_spacing', 'first_line_indent'], true) && !is_numeric($value)) throw ValidationException::withMessages(['template_id' => 'Admin setting '.$name.' must be a number.']);
            if (in_array($name, ['font', 'alignment', 'paper_size'], true) && !is_string($value)) throw ValidationException::withMessages(['template_id' => 'Admin setting '.$name.' must be text.']);
            if ($name === 'alignment' && !in_array(strtolower(trim($value)), ['left', 'right', 'center', 'both', 'justify', 'justified'], true)) throw ValidationException::withMessages(['template_id' => 'The admin template alignment is invalid.']);
            if ($name === 'margins') {
                if (!is_array($value)) throw ValidationException::withMessages(['template_id' => 'Admin margins must specify top, bottom, left and right in inches.']);
                foreach ($value as $side => $inch) if (!in_array($side, ['top', 'bottom', 'left', 'right'], true) || !is_numeric($inch)) throw ValidationException::withMessages(['template_id' => 'The admin template margins are invalid.']);
            }
            $rules[] = ['name' => 'Admin setting: '.$name, 'type' => $types[$name], 'value' => $value];
        }
        if (!$rules) throw ValidationException::withMessages(['template_id' => 'This admin template has no formatting rules.']);
        $template['effective_rules'] = $rules;
        $template['revision'] = hash('sha256', json_encode($rules, JSON_UNESCAPED_UNICODE));
        return $template;
    }
}
