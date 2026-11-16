<?php
namespace Tests\Unit;

use App\Services\PaperPageNumbers;
use DOMDocument;
use DOMXPath;
use PHPUnit\Framework\TestCase;
use ZipArchive;

class PaperPageNumbersTest extends TestCase
{
    public function test_numbers_start_at_real_chapter_one_and_continue_across_sections_without_removing_footer_content(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'page_numbers_');
        $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        try {
            $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
            $zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
            $zip->addFromString('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="original" Target="footer1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"/></Relationships>');
            $zip->addFromString('word/footer1.xml', '<w:ftr xmlns:w="'.$w.'"><w:p><w:r><w:t>College footer</w:t></w:r></w:p></w:ftr>');
            $zip->addFromString('word/media/photo.png', 'original-photo');
            $zip->addFromString('word/document.xml', '<w:document xmlns:w="'.$w.'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:sectPr><w:footerReference w:type="default" r:id="original"/><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:pPr><w:r><w:t>Body</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:sectPr><w:pgNumType w:start="1"/></w:sectPr></w:body></w:document>'); $zip->close();
            foreach ([1, 2] as $pass) {
                $result = (new PaperPageNumbers)->apply($path);
                $this->assertSame('added', $result['status']);
                $this->assertFalse($result['toc_synchronized']);
                $zip->open($path); $doc = new DOMDocument; $doc->loadXML($zip->getFromName('word/document.xml'));
                $xp = new DOMXPath($doc); $xp->registerNamespace('w', $w);
                $this->assertSame(3, $xp->query('//w:sectPr')->length);
                $this->assertSame(1, $xp->query('//w:pgNumType[@w:start="1"]')->length);
                $this->assertSame(2, $xp->query('//w:pgNumType[@w:fmt="decimal"]')->length);
                $this->assertSame(0, $xp->query('//w:p[w:r/w:t="CHAPTER 1" and not(w:pPr/w:pStyle)]//w:br[@w:type="page"]')->length);
                $this->assertSame('original-photo', $zip->getFromName('word/media/photo.png'));
                $this->assertStringContainsString('College footer', $zip->getFromName('word/footer1.xml'));
                $count = 0;
                for ($i = 0; $i < $zip->numFiles; $i++) if (str_starts_with($zip->getNameIndex($i), 'word/footer-aidea-')) {
                    $count++; $this->assertStringContainsString(' PAGE ', $zip->getFromIndex($i));
                }
                $this->assertGreaterThan(0, $count);
                if ($pass === 1) $initialCount = $count;
                else $this->assertSame($initialCount, $count);
                $zip->close();
            }
        } finally { @unlink($path); }
    }

    public function test_unrecognized_chapter_preserves_document(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'page_numbers_');
        try {
            $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
            $zip->addFromString('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Unrecognized content</w:t></w:r></w:p></w:body></w:document>'); $zip->close();
            $before = hash_file('sha256', $path);
            $this->assertSame('unresolved', (new PaperPageNumbers)->apply($path)['status']);
            $this->assertSame($before, hash_file('sha256', $path));
        } finally { @unlink($path); }
    }

    public function test_existing_header_page_field_does_not_get_a_duplicate_footer_number(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'page_numbers_');
        $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        try {
            $zip = new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
            $zip->addFromString('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
            $zip->addFromString('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h1" Target="header1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header"/></Relationships>');
            $header = '<w:hdr xmlns:w="'.$w.'"><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>';
            $zip->addFromString('word/header1.xml', $header);
            $zip->addFromString('word/document.xml', '<w:document xmlns:w="'.$w.'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h1"/></w:sectPr></w:body></w:document>'); $zip->close();
            $this->assertSame('added', (new PaperPageNumbers)->apply($path)['status']);
            $zip->open($path);
            $this->assertSame($header, $zip->getFromName('word/header1.xml'));
            $this->assertStringNotContainsString('footerReference', $zip->getFromName('word/document.xml'));
            $zip->close();
        } finally { @unlink($path); }
    }
}
