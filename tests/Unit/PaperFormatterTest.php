<?php

namespace Tests\Unit;

use App\Services\PaperFormatter;
use DOMDocument;
use DOMXPath;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use ZipArchive;

class PaperFormatterTest extends TestCase
{
    private array $files = [];
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    protected function tearDown(): void
    {
        foreach ($this->files as $file) @unlink($file);
        parent::tearDown();
    }

    private function rules(): array
    {
        return array_map(fn ($detail) => ['detail' => $detail], [
            'The font style used in all parts of the manuscript is TIMES NEW ROMAN.',
            'The font size used in all parts of the manuscript is 12.',
            'Margin is strictly followed (left – 1.5", right – 1", top and bottom – 1").',
            'The manuscript is printed in short bond paper (8.5" by 11").',
            'The manuscript is in double line spacing.',
            'The abstract is constructed as one paragraph, single-spaced, about 250 to 350 words in length.',
        ]);
    }

    private function paper(string $body): string
    {
        $path = tempnam(sys_get_temp_dir(), 'paper_test_'); $this->files[] = $path;
        $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        $zip->addFromString('word/document.xml', '<w:document xmlns:w="'.self::W.'"><w:body>'.$body.'</w:body></w:document>');
        $zip->addFromString('word/media/image1.png', 'original-image-bytes');
        $zip->addFromString('word/styles.xml', '<original-styles/>'); $zip->close(); return $path;
    }

    private function xml(string $file): DOMXPath
    {
        $zip = new ZipArchive; $zip->open($file); $xml = $zip->getFromName('word/document.xml'); $zip->close();
        $doc = new DOMDocument; $this->assertTrue($doc->loadXML($xml));
        $xp = new DOMXPath($doc); $xp->registerNamespace('w', self::W); return $xp;
    }

    public function test_checklist_and_explicit_template_values_are_parsed(): void
    {
        $service = new PaperFormatter; $cfg = $service->settings($this->rules());
        $this->assertSame('Times New Roman', $cfg['font']); $this->assertSame(12.0, $cfg['size']);
        $this->assertSame(1.5, $cfg['margins']['left']); $this->assertSame(1.0, $cfg['margins']['bottom']);
        $this->assertEquals(2, $cfg['spacing']); $this->assertEquals(1, $cfg['abstract']);
        $cfg = $service->settings([...$this->rules(), ['type' => 'spacing', 'value' => 1.5]]);
        $this->assertSame(1.5, $cfg['spacing']);
    }

    public function test_docx_uses_template_settings_and_chapter_has_a_real_page_break(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:p><w:r><w:t>ABSTRACT</w:t></w:r></w:p><w:p><w:r><w:t>Abstract text</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table text</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertSame('12240', $xp->evaluate('string(//w:pgSz/@w:w)'));
        $this->assertSame('15840', $xp->evaluate('string(//w:pgSz/@w:h)'));
        $this->assertSame('2160', $xp->evaluate('string(//w:pgMar/@w:left)'));
        $this->assertSame('1440', $xp->evaluate('string(//w:pgMar/@w:top)'));
        $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="Body"]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('240', $xp->evaluate('string(//w:p[w:r/w:t="Abstract text"]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('page', $xp->evaluate('string(//w:p[w:r/w:t="CHAPTER 1"]/w:r[1]/w:br/@w:type)'));
        $this->assertSame('24', $xp->evaluate('string(//w:r[w:t="Body"]/w:rPr/w:sz/@w:val)'));
        $this->assertSame('Times New Roman', $xp->evaluate('string(//w:r[w:t="Body"]/w:rPr/w:rFonts/@w:ascii)'));
        $this->assertSame('Table text', $xp->evaluate('string(//w:tbl//w:t)'));
        $zip = new ZipArchive; $zip->open($file);
        $this->assertSame('original-image-bytes', $zip->getFromName('word/media/image1.png'));
        $this->assertSame('<original-styles/>', $zip->getFromName('word/styles.xml')); $zip->close();
    }

    public function test_combined_title_and_chapter_paragraph_is_split_without_losing_text(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>April 2026</w:t></w:r><w:r><w:br/><w:t>CHAPTER 1</w:t></w:r><w:r><w:br/><w:t>INTRODUCTION</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1 .... 3</w:t></w:r></w:p>');
        $service = new PaperFormatter; $service->format($file, $this->rules()); $service->format($file, $this->rules());
        $xp = $this->xml($file);
        $this->assertEquals(3, $xp->evaluate('count(/w:document/w:body/w:p)'));
        $this->assertEquals(1, $xp->evaluate('count(//w:br[@w:type="page"])'));
        $this->assertSame('April 2026', $xp->evaluate('string(/w:document/w:body/w:p[1]/w:r/w:t)'));
        $this->assertSame('CHAPTER 1', $xp->evaluate('string(/w:document/w:body/w:p[2]/w:r[w:t][1]/w:t)'));
        $this->assertSame('INTRODUCTION', $xp->evaluate('string(/w:document/w:body/w:p[2]/w:r[w:t][2]/w:t)'));
    }

    public function test_invalid_archive_is_rejected(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'paper_invalid_'); $this->files[] = $file; file_put_contents($file, 'not a docx');
        $this->expectException(InvalidArgumentException::class); (new PaperFormatter)->format($file, $this->rules());
    }

    public function test_title_groups_use_the_page_height_without_overriding_template_spacing(): void
    {
        $body = '';
        foreach (['THESIS TITLE', 'In Partial Fulfillment of the Requirements', 'Bachelor of Science', 'by', 'FIRST AUTHOR', 'SECOND AUTHOR', 'April 2026', 'CHAPTER 1', 'Introduction text'] as $text) {
            $body .= '<w:p><w:r><w:t>'.htmlspecialchars($text, ENT_XML1).'</w:t></w:r></w:p>';
        }
        $file = $this->paper($body); (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertGreaterThan(0, (int) $xp->evaluate('string(//w:p[w:r/w:t="April 2026"]/w:pPr/w:spacing/@w:before)'));
        $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="April 2026"]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('2160', $xp->evaluate('string(//w:pgMar/@w:left)'));
        $this->assertSame('page', $xp->evaluate('string(//w:p[w:r/w:t="CHAPTER 1"]/w:r[1]/w:br/@w:type)'));
        $this->assertSame('Introduction text', $xp->evaluate('string(//w:p[w:r/w:t="Introduction text"]/w:r/w:t)'));
    }

    public function test_xml_external_entities_are_rejected(): void
    {
        $file = $this->paper(''); $zip = new ZipArchive; $zip->open($file);
        $zip->addFromString('word/document.xml', '<!DOCTYPE doc [<!ENTITY secret SYSTEM "file:///etc/passwd">]><doc>&secret;</doc>'); $zip->close();
        $this->expectException(InvalidArgumentException::class); (new PaperFormatter)->format($file, $this->rules());
    }

    public function test_invalid_template_spacing_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new PaperFormatter)->settings([['type' => 'spacing', 'value' => -1]]);
    }

    public function test_date_is_centered_even_without_a_complete_title_layout(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="OffsetDate"/><w:ind w:left="2160" w:firstLine="720" w:firstLineChars="100"/><w:tabs><w:tab w:val="left" w:pos="2160"/></w:tabs></w:pPr><w:r><w:tab/><w:t xml:space="preserve">   April 2026   </w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $date = '//w:p[w:r/w:t="April 2026"]';
        $this->assertSame('center', $xp->evaluate('string('.$date.'/w:pPr/w:jc/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string('.$date.'/w:pPr/w:ind/@w:left)'));
        $this->assertSame('0', $xp->evaluate('string('.$date.'/w:pPr/w:ind/@w:firstLine)'));
        $this->assertEquals(0, $xp->evaluate('count('.$date.'//w:tab)'));
        $this->assertSame('480', $xp->evaluate('string('.$date.'/w:pPr/w:spacing/@w:line)'));
    }

    public function test_body_uses_printable_width_and_template_spacing_without_inherited_gaps(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="1440" w:after="1440" w:beforeLines="200" w:beforeAutospacing="1"/><w:ind w:left="2160" w:right="2160" w:leftChars="100"/></w:pPr><w:r><w:lastRenderedPageBreak/><w:t>Body text</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $body = '//w:p[w:r/w:t="Body text"]/w:pPr';
        $this->assertSame('480', $xp->evaluate('string('.$body.'/w:spacing/@w:line)'));
        foreach (['before', 'after', 'beforeLines', 'beforeAutospacing'] as $key) $this->assertSame('0', $xp->evaluate('string('.$body.'/w:spacing/@w:'.$key.')'));
        foreach (['keepNext', 'keepLines', 'snapToGrid'] as $key) $this->assertSame('0', $xp->evaluate('string('.$body.'/w:'.$key.'/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string('.$body.'/w:ind/@w:left)'));
        $this->assertSame('0', $xp->evaluate('string('.$body.'/w:ind/@w:right)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:lastRenderedPageBreak)'));
        $this->assertSame('2160', $xp->evaluate('string(//w:pgMar/@w:left)'));
    }
}
