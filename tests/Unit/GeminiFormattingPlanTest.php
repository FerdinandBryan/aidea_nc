<?php

namespace Tests\Unit;

use App\Services\GeminiFormattingPlan;
use App\Services\PaperFormatter;
use PHPUnit\Framework\TestCase;

class GeminiFormattingPlanTest extends TestCase
{
    public function test_gemini_maps_explicit_custom_font_and_margin_prose_into_formatter_settings(): void
    {
        $rules = [['detail' => 'Required typeface: Book Antiqua.'], ['detail' => 'The left margin is 1.5 inches.']];
        $plan = (new GeminiFormattingPlan)->resolve($rules, [
            ['rule_index' => 0, 'type' => 'font', 'value' => 'Book Antiqua', 'evidence' => $rules[0]['detail']],
            ['rule_index' => 1, 'type' => 'margin-left', 'value' => '1.5', 'evidence' => $rules[1]['detail']],
        ], new PaperFormatter);
        $this->assertCount(2, $plan['accepted']);
        $settings = (new PaperFormatter)->settings($plan['rules']);
        $this->assertSame('Book Antiqua', $settings['font']);
        $this->assertSame(1.5, $settings['margins']['left']);
    }

    public function test_unproven_invented_and_wrong_scope_changes_are_not_applied(): void
    {
        $rules = [['detail' => 'Abstract must be single-spaced.'], ['detail' => 'Font size is 12.'], ['detail' => 'Left margin is 1.5 inches.']];
        $plan = (new GeminiFormattingPlan)->resolve($rules, [
            ['rule_index' => 0, 'type' => 'spacing', 'value' => '1', 'evidence' => $rules[0]['detail']],
            ['rule_index' => 1, 'type' => 'size', 'value' => '99', 'evidence' => $rules[1]['detail']],
            ['rule_index' => 2, 'type' => 'margin-right', 'value' => '1.5', 'evidence' => $rules[2]['detail']],
            ['rule_index' => 1, 'type' => 'size', 'value' => '12', 'evidence' => 'Not in the admin rule'],
            ['rule_index' => 99, 'type' => 'font', 'value' => 'Arial', 'evidence' => 'Arial'],
            'invalid instruction',
        ], new PaperFormatter);
        $this->assertCount(0, $plan['accepted']);
        $this->assertNotEmpty($plan['warnings']);
        $this->assertSame($rules, $plan['rules']);
    }

    public function test_machine_settings_keep_precedence_over_ai_interpretation(): void
    {
        $rules = [['detail' => 'Required typeface: Book Antiqua.'], ['type' => 'font', 'value' => 'Arial']];
        $plan = (new GeminiFormattingPlan)->resolve($rules, [['rule_index' => 0, 'type' => 'font', 'value' => 'Book Antiqua', 'evidence' => $rules[0]['detail']]], new PaperFormatter);
        $this->assertCount(0, $plan['accepted']);
        $this->assertSame('Arial', (new PaperFormatter)->settings($plan['rules'])['font']);
    }

    public function test_cv_mapping_does_not_change_body_spacing(): void
    {
        $rules = [['type' => 'spacing', 'value' => 2], ['detail' => 'Curriculum Vitae is single-spaced.']];
        $plan = (new GeminiFormattingPlan)->resolve($rules, [['rule_index' => 1, 'type' => 'cv-spacing', 'value' => '1', 'evidence' => $rules[1]['detail']]], new PaperFormatter);
        $this->assertCount(1, $plan['accepted']);
        $settings = (new PaperFormatter)->settings($plan['rules']);
        $this->assertSame(2.0, $settings['spacing']);
        $this->assertSame(1.0, $settings['cv']['spacing']);
    }
}
