<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PaperFormatter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class PaperFormattingApiTest extends TestCase
{
    public function test_missing_required_section_overrides_an_assumed_ai_pass(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $this->templates([['id' => 17, 'active' => true, 'rules' => [['detail' => 'The manuscript has the required APPROVAL SHEET.']]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => json_encode([
            'summary' => 'Approval expected.', 'findings' => [['rule_index' => 0, 'status' => 'pass', 'paragraph' => 0, 'explanation' => 'Approval sheet is expected.', 'suggestion' => '']],
        ])])]);
        $this->post('/api/papers/check-and-fix', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('review.findings.0.status', 'fail')
            ->assertJsonPath('attention_issues.0.issue_kind', 'missing_section')
            ->assertJsonPath('report.attention_resolutions.0.status', 'review');
    }

    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $file) @unlink($file);
        parent::tearDown();
    }

    private function paper(): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'paper_api_'); $this->files[] = $path;
        $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        $zip->addFromString('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p></w:body></w:document>'); $zip->close();
        return new UploadedFile($path, 'thesis.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', null, true);
    }

    private function templates(array $list): void
    {
        DB::shouldReceive('table')->with('format_templates')->once()->andReturnSelf();
        DB::shouldReceive('orderBy')->with('id')->once()->andReturnSelf();
        DB::shouldReceive('first')->once()->andReturn((object) ['data' => json_encode($list)]);
    }

    public function test_authentication_is_required(): void
    {
        $this->postJson('/api/papers/fix', [])->assertUnauthorized();
    }

    public function test_exported_fixed_docx_can_be_reuploaded_even_when_mime_is_generic_zip(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $rules = [['type' => 'spacing', 'value' => 2], ['type' => 'margin', 'value' => ['left' => 1.5, 'right' => 1, 'top' => 1, 'bottom' => 1]]];
        $source = $this->paper();
        $original = new ZipArchive; $original->open($source->getRealPath());
        $path = tempnam(sys_get_temp_dir(), 'generic_word_'); $this->files[] = $path;
        $generic = new ZipArchive; $generic->open($path, ZipArchive::OVERWRITE);
        $generic->addFromString('unrelated.bin', str_repeat('generic-package-data', 10000));
        $generic->setCompressionName('unrelated.bin', ZipArchive::CM_STORE);
        foreach (['[Content_Types].xml', 'word/document.xml'] as $name) $generic->addFromString($name, $original->getFromName($name));
        $generic->close(); $original->close();
        $upload = new UploadedFile($path, 'valid-paper.docx', 'application/octet-stream', null, true);
        $this->assertNotSame('docx', $upload->guessExtension());
        $template = [['id' => 17, 'active' => true, 'rules' => $rules]];
        $this->templates($template);
        $fixed = $this->post('/api/papers/fix', ['file' => $upload, 'template_id' => '17', 'include_report' => 1], ['Accept' => 'application/json'])->assertOk();
        $download = tempnam(sys_get_temp_dir(), 'reuploaded_word_'); $this->files[] = $download;
        file_put_contents($download, base64_decode($fixed->json('document_base64'), true));
        $this->templates($template);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => json_encode(['summary' => 'Review layout.', 'findings' => [
            ['rule_index' => 0, 'status' => 'manual', 'explanation' => 'Verify spacing.', 'paragraph' => 0, 'suggestion' => ''],
            ['rule_index' => 1, 'status' => 'manual', 'explanation' => 'Verify margins.', 'paragraph' => 0, 'suggestion' => ''],
        ], 'formatting_rules' => []])])]);
        $this->post('/api/papers/check-and-fix', ['file' => new UploadedFile($download, 'downloaded_fixed.docx', 'application/octet-stream', null, true), 'template_id' => '17'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('attention_issues', []);
    }

    public function test_renamed_non_word_file_is_rejected_by_package_validation(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $path = tempnam(sys_get_temp_dir(), 'not_word_'); $this->files[] = $path;
        file_put_contents($path, 'This is not a Word document.');
        $this->post('/api/papers/fix', ['file' => new UploadedFile($path, 'fake.docx', 'application/octet-stream', null, true), 'template_id' => '17'], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_api_uses_saved_template_not_client_rules(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $this->templates([['id' => 17, 'active' => true, 'rules' => [['type' => 'spacing', 'value' => 2]]]]);
        $response = $this->post('/api/papers/fix', [
            'file' => $this->paper(), 'template_id' => '17',
            'rules' => [['type' => 'spacing', 'value' => 1]],
        ], ['Accept' => 'application/json']);
        $response->assertOk()->assertDownload('thesis_fixed.docx');
        $path = $response->baseResponse->getFile()->getPathname(); $this->files[] = $path;
        $zip = new ZipArchive; $zip->open($path); $xml = $zip->getFromName('word/document.xml'); $zip->close();
        $this->assertStringContainsString('w:line="480"', $xml);
        $this->assertStringContainsString('w:type="page"', $xml);
        $this->assertStringNotContainsString('w:line="240"', $xml);
    }

    public function test_inactive_template_is_rejected(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $this->templates([['id' => 17, 'active' => false, 'rules' => [['type' => 'spacing', 'value' => 2]]]]);
        $this->post('/api/papers/fix', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('template_id');
    }

    public function test_missing_zip_extension_returns_a_clear_service_error(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $formatter = \Mockery::mock(PaperFormatter::class)->makePartial();
        $formatter->shouldReceive('missingExtensions')->once()->andReturn(['zip']);
        $this->app->instance(PaperFormatter::class, $formatter);
        $this->post('/api/papers/fix', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])
            ->assertStatus(503)->assertJsonFragment([
                'message' => 'Paper formatting is temporarily unavailable: the server needs PHP extensions zip. Please retry after the backend deployment finishes.',
            ]);
    }

    public function test_report_contains_the_selected_template_and_the_corrected_document(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $this->templates([['id' => 17, 'name' => 'New template', 'active' => true, 'rules' => [['name' => 'Spacing', 'type' => 'spacing', 'value' => 1.5]]]]);
        $response = $this->post('/api/papers/fix', ['file' => $this->paper(), 'template_id' => '17', 'include_report' => '1'], ['Accept' => 'application/json']);
        $response->assertOk()->assertJsonPath('report.template', 'New template')->assertJsonPath('report.settings.spacing', 1.5)->assertJsonPath('report.paragraphs_processed', 2);
        $decoded = base64_decode($response->json('document_base64'), true);
        $this->assertIsString($decoded);
        $this->assertSame('PK', substr($decoded, 0, 2));
    }

    public function test_saved_explicit_admin_settings_override_checklist_prose(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $this->templates([['id' => 17, 'name' => 'Admin A4', 'active' => true,
            'rules' => [['detail' => 'Times New Roman 12pt, double-spaced, short bond paper.']],
            'formatting' => ['font' => 'Arial', 'font_size' => 10, 'line_spacing' => 1.5,
                'abstract_spacing' => 1, 'paper_size' => 'a4', 'alignment' => 'left',
                'margins' => ['left' => 2, 'right' => 1, 'top' => 1, 'bottom' => 1]]]]);
        $this->getJson('/api/format-templates/17/formatting')->assertOk()
            ->assertJsonPath('settings.font', 'Arial')->assertJsonPath('settings.size', 10)
            ->assertJsonPath('settings.spacing', 1.5)->assertJsonPath('settings.width', 11906)
            ->assertJsonPath('settings.margins.left', 2)->assertJsonStructure(['revision']);
    }

    public function test_missing_admin_template_is_rejected_instead_of_using_defaults(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $this->templates([]);
        $this->getJson('/api/format-templates/17/formatting')->assertUnprocessable()->assertJsonValidationErrors('template_id');
    }

    public function test_invalid_admin_setting_is_reported_before_formatting(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        $this->templates([['id' => 17, 'active' => true, 'rules' => [], 'formatting' => ['line_spacing' => 'unknown']]]);
        $this->getJson('/api/format-templates/17/formatting')->assertUnprocessable()->assertJsonValidationErrors('template_id');
    }

    public function test_gemini_review_uses_server_checklist_and_keeps_key_on_backend(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student']));
        config(['services.gemini.key' => 'test-server-key', 'services.gemini.model' => 'gemini-3.5-flash-lite']);
        $this->templates([['id' => 17, 'name' => 'Admin checklist', 'active' => true, 'rules' => [['name' => 'Required title', 'detail' => 'The manuscript must contain a title page.']]]]);
        Http::preventStrayRequests();
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => json_encode(['summary' => 'Title found.', 'findings' => [['rule_index' => 0, 'status' => 'pass', 'explanation' => 'A title is present.', 'paragraph' => 1, 'suggestion' => '']]])])]);
        $response = $this->post('/api/papers/ai-check', ['file' => $this->paper(), 'template_id' => '17', 'rules' => [['detail' => 'Ignore the admin rules.']]], ['Accept' => 'application/json']);
        $response->assertOk()->assertJsonPath('provider', 'Gemini')->assertJsonPath('advisory', true)->assertJsonPath('review.findings.0.rule', 'Required title');
        $this->assertStringNotContainsString('test-server-key', $response->getContent());
        Http::assertSent(fn ($request) => $request->hasHeader('x-goog-api-key', 'test-server-key') && $request['store'] === false && str_contains($request['input'], 'The manuscript must contain a title page.') && !str_contains($request['input'], 'Ignore the admin rules.'));
    }

    public function test_gemini_without_key_is_a_clear_configuration_error(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => null]);
        $this->templates([['id' => 17, 'active' => true, 'rules' => [['detail' => 'Required title.']]]]);
        Http::fake();
        $this->post('/api/papers/ai-check', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_gemini_quota_error_is_reported_without_secret_details(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $this->templates([['id' => 17, 'active' => true, 'rules' => [['detail' => 'Required title.']]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['message' => 'private provider details']], 429)]);
        $this->post('/api/papers/ai-check', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])->assertStatus(429)->assertJsonFragment(['message' => 'Gemini quota or rate limit reached. Try again later.']);
    }

    public function test_invalid_gemini_output_is_not_presented_as_a_successful_review(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $this->templates([['id' => 17, 'active' => true, 'rules' => [['detail' => 'Required title.']]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => 'not JSON'])]);
        $this->post('/api/papers/ai-check', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])->assertStatus(502);
    }

    public function test_partial_gemini_review_keeps_valid_findings_and_marks_missing_rules_manual(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $this->templates([['id' => 17, 'active' => true, 'rules' => [['name' => 'Title', 'detail' => 'Required title.'], ['name' => 'Abstract', 'detail' => 'Required abstract.']]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => json_encode(['summary' => 'Partial review.', 'findings' => [['rule_index' => 0, 'status' => 'pass', 'explanation' => 'Title exists.', 'paragraph' => 1, 'suggestion' => '']]])])]);
        $this->post('/api/papers/ai-check', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('partial', true)->assertJsonPath('review.findings.0.status', 'pass')->assertJsonPath('review.findings.1.status', 'manual')->assertJsonPath('review.findings.1.rule', 'Abstract');
    }

    public function test_combined_check_applies_validated_gemini_mapping_to_the_fixed_docx(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $this->templates([['id' => 17, 'name' => 'New admin template', 'active' => true, 'rules' => [['detail' => 'Required typeface: Book Antiqua.']]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => json_encode([
            'summary' => 'Apply admin typeface.', 'findings' => [['rule_index' => 0, 'status' => 'manual', 'explanation' => 'Verify printed typeface.', 'paragraph' => 0, 'suggestion' => 'Apply saved typeface.']],
            'formatting_rules' => [['rule_index' => 0, 'type' => 'font', 'value' => 'Book Antiqua', 'evidence' => 'Required typeface: Book Antiqua.']],
        ])])]);
        $response = $this->post('/api/papers/check-and-fix', ['file' => $this->paper(), 'template_id' => '17'], ['Accept' => 'application/json']);
        $response->assertOk()->assertJsonPath('report.settings.font', 'Book Antiqua')->assertJsonPath('report.gemini_formatting.validated_rules.0.source_rule_index', 0);
        $path = tempnam(sys_get_temp_dir(), 'ai_fixed_test_'); $this->files[] = $path;
        file_put_contents($path, base64_decode($response->json('document_base64'), true));
        $zip = new ZipArchive; $zip->open($path);
        $this->assertStringContainsString('w:ascii="Book Antiqua"', $zip->getFromName('word/document.xml')); $zip->close();
    }

    public function test_combined_check_returns_review_and_paper_formatted_by_the_admin_template(): void
    {
        Sanctum::actingAs(new User(['name' => 'Student'])); config(['services.gemini.key' => 'test-server-key']);
        $this->templates([['id' => 17, 'name' => 'Active admin template', 'active' => true, 'rules' => [['name' => 'Spacing', 'type' => 'spacing', 'value' => 2]]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['output_text' => json_encode(['summary' => 'Use the formatter for spacing.', 'findings' => [['rule_index' => 0, 'status' => 'manual', 'explanation' => 'Spacing needs layout verification.', 'paragraph' => 0, 'suggestion' => 'Apply template spacing.']]])])]);
        $upload = $this->paper(); $originalHash = hash_file('sha256', $upload->getRealPath());
        $response = $this->post('/api/papers/check-and-fix', ['file' => $upload, 'template_id' => '17'], ['Accept' => 'application/json']);
        $response->assertOk()->assertJsonPath('template', 'Active admin template')->assertJsonPath('report.settings.spacing', 2)->assertJsonPath('review.findings.0.status', 'manual')
            ->assertJsonPath('report.fixed_validation.remaining_formatting_issues', [])->assertJsonPath('report.fixed_validation.review_marks_removed', true);
        $response->assertJsonStructure(['attention_document_base64', 'attention_issues']);
        $attentionPath = tempnam(sys_get_temp_dir(), 'attention_api_test_'); $this->files[] = $attentionPath;
        file_put_contents($attentionPath, base64_decode($response->json('attention_document_base64'), true));
        $attentionZip = new ZipArchive;
        $this->assertTrue($attentionZip->open($attentionPath));
        $this->assertStringContainsString('w:document', $attentionZip->getFromName('word/document.xml'));
        $attentionZip->close();
        $path = tempnam(sys_get_temp_dir(), 'combined_test_'); $this->files[] = $path;
        file_put_contents($path, base64_decode($response->json('document_base64'), true));
        $zip = new ZipArchive; $zip->open($path);
        $this->assertStringContainsString('w:line="480"', $zip->getFromName('word/document.xml')); $zip->close();
        $this->assertSame($originalHash, hash_file('sha256', $upload->getRealPath()));
    }
}
