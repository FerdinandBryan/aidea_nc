<?php

namespace Tests\Feature;

use App\Services\PaperPagination;
use Tests\TestCase;
use ZipArchive;

class PaperPaginationTest extends TestCase
{
    public function test_disabled_renderer_preserves_original_document_and_reports_unverified_toc(): void
    {
        config(['paper-pagination.enabled' => false]);
        $path = tempnam(sys_get_temp_dir(), 'pagination_test_');
        try {
            $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
            $zip->addFromString('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>TABLE OF CONTENTS</w:t></w:r></w:p></w:body></w:document>');
            $zip->close();
            $before = hash_file('sha256', $path);
            $result = app(PaperPagination::class)->apply($path);
            $this->assertSame('unavailable', $result['status']);
            $this->assertNotEmpty($result['warnings']);
            $this->assertArrayNotHasKey('pdf_base64', $result);
            $this->assertSame($before, hash_file('sha256', $path));
        } finally { @unlink($path); }
    }

    public function test_paper_without_toc_does_not_require_a_renderer(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'pagination_test_');
        try {
            $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
            $zip->addFromString('word/document.xml', '<w:document><w:body>CHAPTER 1</w:body></w:document>'); $zip->close();
            $this->assertSame(['status' => 'not-applicable'], app(PaperPagination::class)->apply($path));
        } finally { @unlink($path); }
    }
}
