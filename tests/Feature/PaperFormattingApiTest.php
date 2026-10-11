<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\PaperFormatter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class PaperFormattingApiTest extends TestCase
{
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
}
