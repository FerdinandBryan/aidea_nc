<?php
namespace Tests\Unit;
use App\Services\DocxFormattingReview;
use App\Services\PaperFormatter;
use PHPUnit\Framework\TestCase;
use ZipArchive;
class DocxFormattingReviewTest extends TestCase
{
    public function test_explicit_properties_pass_and_wrong_font_fails_without_passing_pagination(): void
    {
        $path=tempnam(sys_get_temp_dir(), 'review_test_');
        try {
            $zip=new ZipArchive; $zip->open($path, ZipArchive::OVERWRITE);
            $zip->addFromString('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>Body text</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:left="2160"/></w:sectPr></w:body></w:document>'); $zip->close();
            $rules=[['detail'=>'The font style is Times New Roman.'],['detail'=>'The font size is 12.'],['detail'=>'Margins: left 1.5 inches.'],['detail'=>'Printed on short bond paper.'],['detail'=>'The manuscript is double-spaced.'],['detail'=>'Pagination is upper right.']];
            $findings=array_map(fn($i)=>['rule_index'=>$i,'status'=>'manual','explanation'=>'Unknown','paragraph'=>0],range(0,5));
            $service=new DocxFormattingReview;
            $this->assertSame(['pass','pass','pass','pass','pass','manual'],array_column($service->apply($path,$rules,$findings,new PaperFormatter),'status'));
            $rules[0]=['detail'=>'The font style is Arial.'];
            $this->assertSame('fail',$service->apply($path,$rules,$findings,new PaperFormatter)[0]['status']);
            $zip->open($path); $xml=$zip->getFromName('word/document.xml'); $zip->addFromString('word/document.xml',str_replace('w:ascii="Times New Roman"','', $xml)); $zip->close();
            $this->assertSame('manual',$service->apply($path,$rules,$findings,new PaperFormatter)[0]['status']);
        } finally {unlink($path);}
    }
}
