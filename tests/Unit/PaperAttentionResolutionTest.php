<?php

namespace Tests\Unit;

use App\Services\PaperAttentionMarker;
use PHPUnit\Framework\TestCase;

class PaperAttentionResolutionTest extends TestCase
{
    public function test_only_rechecked_formatting_issues_are_reported_as_corrected(): void
    {
        $issues = [
            ['type' => 'spacing', 'message' => 'Incorrect line spacing.'],
            ['type' => 'margin', 'message' => 'Incorrect left margin.'],
            ['type' => 'content', 'message' => 'Missing abstract.'],
        ];
        $marker = new PaperAttentionMarker;
        $results = $marker->resolutions($issues, [['type' => 'margin', 'message' => 'Margin still incorrect.']]);
        $this->assertSame(['corrected', 'review', 'review'], array_column($results, 'status'));
        $this->assertSame(['corrected', 'corrected', 'review'], array_column($marker->resolutions($issues, []), 'status'));
    }
}
