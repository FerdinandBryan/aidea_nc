<?php

namespace Tests\Unit;

use App\Services\PaperFormatter;
use App\Services\PaperAttentionMarker;
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

    public function test_first_line_indent_from_admin_rule_is_applied_to_body_paragraphs(): void
    {
        $rules = [...$this->rules(), ['name' => 'Paragraph indentation', 'detail' => 'The first line of every paragraph should be indented by 0.5 inches.']];
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Body paragraph.</w:t></w:r></w:p>');

        (new PaperFormatter)->format($file, $rules);

        $this->assertSame('720', $this->xml($file)->evaluate('string(//w:p[w:r/w:t="Body paragraph."]/w:pPr/w:ind/@w:firstLine)'));
    }

    public function test_reference_entries_and_appendix_slots_follow_each_selected_template(): void
    {
        foreach (['240', '360'] as $line) {
            $entry = '<w:pPr><w:spacing w:line="'.$line.'"/><w:ind w:left="720" w:hanging="720"/><w:jc w:val="left"/></w:pPr>';
            $label = '<w:pPr><w:pageBreakBefore/><w:spacing w:line="'.$line.'"/><w:jc w:val="center"/></w:pPr>';
            $title = '<w:pPr><w:spacing w:after="'.$line.'"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>';
            $reference = $this->paper('<w:p><w:r><w:t>REFERENCES</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p>'.$entry.'<w:r><w:t>[List cited sources.]</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>[Journal article format]</w:t></w:r></w:p><w:p>'.$entry.'<w:r><w:t>[Author]. ([Year]). [Title]. [URL]</w:t></w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p>'.$label.'<w:r><w:t>Appendix A</w:t></w:r></w:p><w:p>'.$title.'<w:r><w:rPr><w:b/></w:rPr><w:t>[Supporting document title]</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>REFERENCES</w:t></w:r></w:p><w:p><w:r><w:t>Author (2026). </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>Book title.</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/><w:t>https://example.org/source</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Short reference</w:t></w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Appendix A</w:t></w:r></w:p><w:p><w:r><w:t>Worksheets</w:t></w:r></w:p><w:p><w:r><w:t>Appendix B</w:t></w:r></w:p><w:p><w:r><w:t>Documentation</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p>');
            $report = (new PaperFormatter)->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            foreach (['Author (2026). ', 'https://example.org/source', 'Short reference'] as $text) {
                $p = '//w:p[w:r/w:t="'.$text.'"]';
                $this->assertSame($line, $xp->evaluate('string('.$p.'/w:pPr/w:spacing/@w:line)'));
                $this->assertSame('720', $xp->evaluate('string('.$p.'/w:pPr/w:ind/@w:hanging)'));
            }
            $this->assertSame(1, $xp->query('//w:r[w:t="Book title."]/w:rPr/w:i')->length);
            $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Author (2026). "]//w:br[@w:type="page"]')->length);
            $this->assertSame(0, $xp->query('//w:p[w:r/w:t="https://example.org/source"]//w:br[@w:type="page"]')->length);
            $this->assertSame(0, $xp->query('//w:p[w:r/w:t="Short reference"]//w:br[@w:type="page"]')->length);
            foreach (['Worksheets', 'Documentation'] as $text) {
                $p = '//w:p[w:r/w:t="'.$text.'"]';
                $this->assertSame('center', $xp->evaluate('string('.$p.'/w:pPr/w:jc/@w:val)'));
                $this->assertSame($line, $xp->evaluate('string('.$p.'/w:pPr/w:spacing/@w:after)'));
            }
            $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix B"]//w:br[@w:type="page"]')->length);
            $this->assertSame(1, $xp->query('//w:drawing')->length);
            $this->assertNotContains('No template paragraph matched: Documentation', $report['manual_review_rules']);
        }
    }

    public function test_appendix_forms_map_split_values_and_repeated_people_to_the_template(): void
    {
        foreach (['240', '360'] as $line) {
            $heading = '<w:pPr><w:keepNext/><w:jc w:val="left"/><w:spacing w:line="'.$line.'"/></w:pPr>';
            $field = '<w:pPr><w:jc w:val="left"/><w:spacing w:line="'.$line.'"/><w:ind w:firstLine="0"/></w:pPr>';
            $reference = $this->paper('<w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Appendix M</w:t></w:r></w:p><w:p><w:r><w:t>Curriculum Vitae</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>[Photograph]</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p>'.$heading.'<w:r><w:rPr><w:b/></w:rPr><w:t>PERSONAL DETAILS</w:t></w:r></w:p><w:p>'.$field.'<w:r><w:t>Name: [Name]</w:t><w:br/><w:t>Address: [Address]</w:t></w:r></w:p><w:p>'.$heading.'<w:r><w:rPr><w:b/></w:rPr><w:t>TRAINING</w:t></w:r></w:p><w:p>'.$field.'<w:r><w:t>School: [School]</w:t><w:br/><w:t>Program: [Program]</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>[FULL NAME]</w:t><w:br/><w:t>Participant</w:t></w:r></w:p>');
            $people = '';
            foreach (['One', 'Two'] as $person) {
                $people .= '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>PERSONAL DETAILS</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>Name: '.$person.'</w:t></w:r></w:p><w:p><w:r><w:t>Address: Original address '.$person.'</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>TRAINING</w:t></w:r></w:p><w:p><w:r><w:t>School: Original school '.$person.'</w:t></w:r></w:p><w:p><w:r><w:t>Program: Original program '.$person.'</w:t></w:r></w:p><w:p><w:r><w:t>PERSON '.$person.'</w:t></w:r></w:p><w:p><w:r><w:t>Participant Signature: ___</w:t></w:r></w:p>';
            }
            $student = $this->paper('<w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Appendix I</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r><w:r><w:t>Curriculum Vitae</w:t></w:r></w:p>'.$people);
            $service = new PaperFormatter;
            // Reapplying must retain the same form mapping and page boundaries.
            for ($pass = 0; $pass < 2; $pass++) {
                $report = $service->formatUsingReference($student, $reference);
                $xp = $this->xml($student);
                foreach (['One', 'Two'] as $person) {
                    foreach (['Name: '.$person, 'Address: Original address '.$person, 'School: Original school '.$person, 'Program: Original program '.$person] as $text) {
                        $p = '//w:p[w:r/w:t="'.$text.'"]';
                        $this->assertSame($line, $xp->evaluate('string('.$p.'/w:pPr/w:spacing/@w:line)'));
                        $this->assertSame('left', $xp->evaluate('string('.$p.'/w:pPr/w:jc/@w:val)'));
                        $this->assertSame('0', $xp->evaluate('string('.$p.'/w:pPr/w:ind/@w:firstLine)'));
                        $this->assertNotContains('No template paragraph matched: '.$text, $report['manual_review_rules']);
                    }
                    $this->assertSame(1, $xp->query('//w:p[w:r/w:t="PERSON '.$person.'"]/w:r/w:rPr/w:b')->length);
                }
                $this->assertSame(1, $xp->query('//w:p[w:r/w:t="PERSONAL DETAILS"][2]//w:br[@w:type="page"]')->length);
                $this->assertSame(0, $xp->query('//w:t[contains(., "[FULL NAME]")]')->length);
                $this->assertSame(1, $xp->query('//w:drawing')->length);
            }
        }
    }

    public function test_appendix_labels_follow_matched_template_titles_and_not_existing_letters(): void
    {
        $p = static fn ($text) => '<w:p><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        foreach (['M', 'D'] as $vitaeLetter) {
            $reference = $this->paper($p('APPENDICES').$p('Appendix A').$p('Permission Letter').$p('Appendix '.$vitaeLetter).$p('Curriculum Vitae'));
            $student = $this->paper($p('APPENDICES').$p('Appendix '.$vitaeLetter).$p('Permission Letter').$p('Original letter content.').$p('Appendix A').$p('Curriculum Vitae').'<w:p><w:r><w:drawing/></w:r></w:p>'.$p('Original vitae content.'));
            $service = new PaperFormatter;
            $report = $service->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            $this->assertSame('Appendix A', $xp->evaluate('string(//w:p[w:r/w:t="Permission Letter"]/preceding-sibling::w:p[normalize-space(.) != ""][1]/w:r/w:t)'));
            $this->assertSame('Appendix '.$vitaeLetter, $xp->evaluate('string(//w:p[w:r/w:t="Curriculum Vitae"]/preceding-sibling::w:p[normalize-space(.) != ""][1]/w:r/w:t)'));
            $this->assertCount(2, array_filter($report['template_mapping'], fn ($entry) => $entry['match'] === 'appendix-title-label'));
            $this->assertSame(1, $xp->query('//w:drawing')->length);
            $this->assertSame(1, $xp->query('//w:t[.="Original vitae content."]')->length);
            $second = $service->formatUsingReference($student, $reference);
            $this->assertCount(0, array_filter($second['template_mapping'], fn ($entry) => $entry['match'] === 'appendix-title-label'));
        }
        $reference = $this->paper($p('APPENDICES').$p('Appendix M').$p('Curriculum Vitae').$p('Appendix R').$p('Research Profile'));
        $student = $this->paper($p('APPENDICES').$p('Appendix I').$p('Curriculum Vitae').$p('Appendix M').$p('Unmatched Supporting Material').$p('Appendix Q').$p('Research Profile'));
        $report = (new PaperFormatter)->formatUsingReference($student, $reference);
        $this->assertSame(1, $this->xml($student)->query('//w:t[.="Appendix I"]')->length);
        $this->assertSame(1, $this->xml($student)->query('//w:t[.="Appendix R"]')->length);
        $this->assertNotEmpty(array_filter($report['manual_review_rules'], fn ($warning) => str_contains($warning, 'duplicate labels')));
    }

    public function test_appendix_blocks_use_specific_template_styles_descriptions_and_order(): void
    {
        $p = static fn ($text, $before = 0) => '<w:p><w:pPr><w:spacing w:before="'.$before.'"/></w:pPr><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        $reference = $this->paper($p('APPENDICES').$p('Appendix A', 100).$p('Informed Consent/Assent Form', 200).$p('[Insert the signed consent form.]').$p('Appendix G', 300).$p('Certificate of Statistical Advising', 400).$p('[Insert the certificate or applicable documentation of data analysis.]'));
        $student = $this->paper($p('APPENDICES').$p('Appendix A').$p('Certificate of Data Analysis').'<w:tbl><w:tr><w:tc>'.$p('Original analysis table.').'</w:tc></w:tr></w:tbl><w:p><w:r><w:drawing/></w:r></w:p>'.$p('Appendix G').$p('Informed Consent/ Assent Form').$p('Original consent document.'));
        $service = new PaperFormatter;
        for ($pass = 0; $pass < 2; $pass++) {
            $service->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            $labels = array_map(fn ($node) => $node->textContent, iterator_to_array($xp->query('//w:p[w:r/w:t="Appendix A" or w:r/w:t="Appendix G"]/w:r/w:t')));
            $this->assertSame(['Appendix A', 'Appendix G'], $labels);
            $this->assertSame('200', $xp->evaluate('string(//w:p[w:r/w:t="Informed Consent/Assent Form"]/w:pPr/w:spacing/@w:before)'));
            $this->assertSame('400', $xp->evaluate('string(//w:p[w:r/w:t="Certificate of Statistical Advising"]/w:pPr/w:spacing/@w:before)'));
            $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix G"]/following-sibling::w:tbl//w:t[.="Original analysis table."]')->length);
            $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix G"]/following-sibling::w:p//w:drawing')->length);
            $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix A"]/following-sibling::w:p[w:r/w:t="Original consent document."]/following-sibling::w:p[w:r/w:t="Appendix G"]')->length);
        }
    }

    public function test_optional_appendix_slots_keep_actual_titles_and_unmatched_blocks_keep_their_content(): void
    {
        $p = static fn ($text, $before = 0) => '<w:p><w:pPr><w:spacing w:before="'.$before.'"/></w:pPr><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        $reference = $this->paper($p('APPENDICES').$p('Appendix A').$p('Consent Form', 120).$p('Appendix J').$p('[Title of Appendix J]', 420));
        $student = $this->paper($p('APPENDICES').$p('Appendix J').$p('Documentation').$p('Original photographs.').$p('Appendix Q').$p('Research Ethics Clearance').$p('Original clearance.').$p('Appendix A').$p('Consent Form').$p('Original consent.'));
        $report = (new PaperFormatter)->formatUsingReference($student, $reference);
        $xp = $this->xml($student);
        $this->assertSame('420', $xp->evaluate('string(//w:p[w:r/w:t="Documentation"]/w:pPr/w:spacing/@w:before)'));
        $this->assertSame(0, $xp->query('//w:t[.="[Title of Appendix J]"]')->length);
        $this->assertSame(1, $xp->query('//w:t[.="Original photographs."]')->length);
        $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix A"]/following-sibling::w:p[w:r/w:t="Original consent."]/following-sibling::w:p[w:r/w:t="Appendix Q"]/following-sibling::w:p[w:r/w:t="Original clearance."]/following-sibling::w:p[w:r/w:t="Appendix J"]')->length);
        $this->assertNotEmpty(array_filter($report['manual_review_rules'], fn ($warning) => str_contains($warning, 'Unmatched appendix: Appendix Q')));
    }

    public function test_additional_documents_fill_only_available_template_slots_and_free_named_entries(): void
    {
        $p = static fn ($text) => '<w:p><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        foreach ([['D', 'H', 'K', 'L'], ['B', 'F', 'N', 'O']] as [$certificate, $tally, $extraOne, $extraTwo]) {
            $reference = $this->paper($p('APPENDICES').$p('Appendix '.$certificate).$p('Certificate of Validation').$p('Appendix '.$tally).$p('Sample Tally Sheet').$p('[Insert a tally sheet summarizing the data.]').$p('Appendix '.$extraOne).$p('[Title of Appendix '.$extraOne.']').$p('Appendix '.$extraTwo).$p('[Title of Appendix '.$extraTwo.']'));
            $student = $this->paper($p('APPENDICES').$p('Appendix '.$certificate).$p('Research Ethics Clearance').$p('Original clearance.').$p('Appendix Q').$p('Certificate of Validation').$p('Original certificate.').$p('Appendix R').$p('Tally Test').'<w:p><w:r><w:drawing/></w:r></w:p>'.$p('Appendix S').$p('Work Plan').$p('Original work plan.'));
            $service = new PaperFormatter;
            for ($pass = 0; $pass < 2; $pass++) {
                $report = $service->formatUsingReference($student, $reference);
                $xp = $this->xml($student);
                foreach (['Certificate of Validation' => $certificate, 'Sample Tally Sheet' => $tally, 'Research Ethics Clearance' => $extraOne, 'Work Plan' => $extraTwo] as $title => $letter) {
                    $this->assertSame('Appendix '.$letter, $xp->evaluate('string(//w:p[w:r/w:t="'.$title.'"]/preceding-sibling::w:p[normalize-space(.) != ""][1]/w:r/w:t)'));
                }
                $this->assertEmpty(array_filter($report['manual_review_rules'], fn ($warning) => str_contains($warning, 'Unmatched appendix:') || str_contains($warning, 'duplicate labels')));
                $labels = array_map(fn ($node) => $node->textContent, iterator_to_array($xp->query('//w:p[starts-with(w:r/w:t, "Appendix ")]/w:r/w:t')));
                $this->assertSame(array_map(fn ($letter) => 'Appendix '.$letter, [$certificate, $tally, $extraOne, $extraTwo]), $labels);
                $this->assertSame(1, $xp->query('//w:drawing')->length);
                $this->assertSame(1, $xp->query('//w:t[.="Original clearance."]')->length);
            }
        }
    }

    public function test_missing_template_appendices_get_header_only_pages_in_template_order(): void
    {
        $p = static fn ($text) => '<w:p><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        $reference = $this->paper($p('APPENDICES').$p('Appendix A').$p('Permission Letter').$p('[Insert letter.]').$p('Appendix B').'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="360" w:line="240"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:b/><w:sz w:val="28"/></w:rPr><w:t>Editing Certificate</w:t></w:r></w:p>'.$p('[Insert signed certificate here.]').$p('Appendix C').$p('Curriculum Vitae'));
        foreach ([true, false] as $hasAppendices) {
            $student = $this->paper($p('CHAPTER 1').$p('Original paper content.').($hasAppendices ? $p('APPENDICES').$p('Appendix A').$p('Permission Letter').$p('Original letter content.').'<w:p><w:r><w:drawing/></w:r></w:p>'.$p('Appendix C').$p('Curriculum Vitae').$p('Original vitae content.') : ''));
            $service = new PaperFormatter;
            for ($pass = 0; $pass < 2; $pass++) {
                $report = $service->formatUsingReference($student, $reference); $xp = $this->xml($student);
                $labels = array_map(fn ($node) => $node->textContent, iterator_to_array($xp->query('//w:p[starts-with(w:r/w:t, "Appendix ")]/w:r/w:t')));
                $this->assertSame(['Appendix A', 'Appendix B', 'Appendix C'], $labels);
                $this->assertSame(1, $xp->query('//w:t[.="APPENDICES"]')->length);
                $this->assertSame(0, $xp->query('//w:t[contains(., "Insert signed certificate") or contains(., "Insert letter")]')->length);
                $title = '//w:p[w:r/w:t="Editing Certificate"]';
                $this->assertSame('center', $xp->evaluate('string('.$title.'/w:pPr/w:jc/@w:val)'));
                $this->assertSame('360', $xp->evaluate('string('.$title.'/w:pPr/w:spacing/@w:before)'));
                $this->assertSame('Arial', $xp->evaluate('string('.$title.'/w:r/w:rPr/w:rFonts/@w:ascii)'));
                $this->assertSame('28', $xp->evaluate('string('.$title.'/w:r/w:rPr/w:sz/@w:val)'));
                $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix B"]//w:br[@w:type="page"]')->length);
                $this->assertSame(1, $xp->query('//w:p[w:r/w:t="Appendix C"]//w:br[@w:type="page"]')->length);
                $this->assertSame(1, $xp->query('//w:t[.="Original paper content."]')->length);
                $this->assertSame($hasAppendices ? 1 : 0, $xp->query('//w:drawing')->length);
                $this->assertNotEmpty(array_filter($report['manual_review_rules'], fn ($warning) => str_contains($warning, 'No supporting document was supplied.')));
            }
        }
    }

    public function test_repeated_optional_template_titles_still_reserve_each_missing_appendix(): void
    {
        $p = static fn ($text) => '<w:p><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        $reference = $this->paper($p('APPENDICES').$p('Appendix B').$p('[Supporting document]').$p('Appendix D').$p('[Supporting document]'));
        $student = $this->paper($p('APPENDICES'));
        $service = new PaperFormatter;
        for ($pass = 0; $pass < 2; $pass++) {
            $service->formatUsingReference($student, $reference); $xp = $this->xml($student);
            $this->assertSame(1, $xp->query('//w:t[.="APPENDICES"]')->length);
            $this->assertSame(1, $xp->query('//w:t[.="Appendix B"]')->length);
            $this->assertSame(1, $xp->query('//w:t[.="Appendix D"]')->length);
            $this->assertSame(2, $xp->query('//w:t[.="[Supporting document]"]')->length);
        }
    }

    public function test_empty_rules_apply_layout_from_the_admin_reference_docx(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr><w:r><w:t>Reference body.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>');
        $zip = new ZipArchive; $zip->open($reference);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="BodyText"><w:pPr><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:firstLine="360"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>');
        $zip->close();
        $student = $this->paper('<w:p><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Student paragraph.</w:t></w:r></w:p><w:p><w:r><w:t>Introduction paragraph.</w:t></w:r></w:p>');

        (new PaperFormatter)->formatUsingReference($student, $reference);

        $xp = $this->xml($student);
        $body = '//w:p[w:r/w:t="Student paragraph."]';
        $this->assertSame('BodyText', $xp->evaluate('string('.$body.'/w:pPr/w:pStyle/@w:val)'));
        $this->assertSame('360', $xp->evaluate('string('.$body.'/w:pPr/w:ind/@w:firstLine)'));
        $this->assertSame('360', $xp->evaluate('string(//w:p[w:r/w:t="Introduction paragraph."]/w:pPr/w:ind/@w:firstLine)'));
        $this->assertSame('11906', $xp->evaluate('string(//w:pgSz/@w:w)'));
        $this->assertSame('1440', $xp->evaluate('string(//w:pgMar/@w:left)'));
        $zip = new ZipArchive; $zip->open($student); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
        $this->assertStringContainsString('w:line="360"', $styles);
        $this->assertStringContainsString('w:firstLine="360"', $styles);
        $this->assertStringContainsString('w:val="both"', $styles);
        $this->assertStringContainsString('w:ascii="Arial"', $styles);
        $this->assertStringContainsString('w:val="20"', $styles);
    }

    public function test_reference_chapter_style_is_applied_to_the_matching_student_heading(): void
    {
        $reference = $this->paper('<w:p><w:pPr><w:pStyle w:val="TemplateChapter"/></w:pPr><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $zip = new ZipArchive; $zip->open($reference);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="TemplateChapter"><w:pPr><w:spacing w:before="600" w:after="300"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>');
        $zip->close();
        $student = $this->paper('<w:p><w:r><w:t>Student title</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p>');

        (new PaperFormatter)->formatUsingReference($student, $reference);

        $xp = $this->xml($student);
        $this->assertSame('TemplateChapter', $xp->evaluate('string(//w:p[w:r/w:t="CHAPTER 1"]/w:pPr/w:pStyle/@w:val)'));
        $zip = new ZipArchive; $zip->open($student); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
        $this->assertStringContainsString('w:styleId="TemplateChapter"', $styles);
        $this->assertStringContainsString('w:before="600"', $styles);
    }

    public function test_cover_blocks_follow_template_slots_instead_of_student_paragraph_numbers(): void
    {
        $p = static fn ($text, $bold = false, $align = 'center') => '<w:p><w:pPr><w:spacing w:line="240" w:after="0"/><w:jc w:val="'.$align.'"/></w:pPr><w:r><w:rPr>'.($bold ? '<w:b/>' : '').'</w:rPr><w:t>'.$text.'</w:t></w:r></w:p>';
        $blank = '<w:p><w:pPr><w:spacing w:line="240"/></w:pPr></w:p>';
        foreach ([1, 3] as $gap) {
            $reference = $this->paper(str_repeat($blank, $gap).$p('[Project title]', true).str_repeat($blank, $gap).$p('Prepared for').$p('Faculty [Division]').str_repeat($blank, $gap).$p('Submitted in fulfillment').$p('[Program]').str_repeat($blank, $gap).$p('by').$blank.$p('[Author 1]', true).$p('[Author 2]', true).$p('[Author 3]', true).$p('[Author 4]', true).$p('[Author 5]', true).str_repeat($blank, $gap).$p('[Month Year]').'<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
            $student = $this->paper($p('FIRST TITLE LINE', true).$p('SECOND TITLE LINE', true).$p('THIRD TITLE LINE', true).$blank.$p('Submitted in fulfillment').$p('My degree program').$blank.$p('by').$p('Researcher A', true).$p('Researcher B', true).$p('Researcher C', true).$p('November 2026', false, 'both').'<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>My original body content.</w:t></w:r></w:p>');
            for ($pass = 0; $pass < 2; $pass++) {
                $report = (new PaperFormatter)->formatUsingReference($student, $reference);
                $xp = $this->xml($student);
                $title = '//w:p[.//w:t="FIRST TITLE LINE"]';
                $this->assertEquals(3, $xp->evaluate('count('.$title.'/w:r/w:t)'));
                $this->assertEquals(2, $xp->evaluate('count('.$title.'/w:r/w:br)'));
                $this->assertEquals(3, $xp->evaluate('count('.$title.'/w:r/w:rPr/w:b)'));
                $this->assertEquals(1, $xp->evaluate('count(//w:p[.//w:t="Prepared for"])'));
                $this->assertEquals(1, $xp->evaluate('count(//w:p[.//w:t="My degree program"])'));
                $this->assertEquals(0, $xp->evaluate('count(//w:t[.="[Project title]" or contains(.,"[Author")])'));
                $this->assertEquals($this->xml($reference)->evaluate('count(//w:p[.//w:t="[Month Year]"]/preceding-sibling::w:p)'), $xp->evaluate('count(//w:p[.//w:t="November 2026"]/preceding-sibling::w:p)'));
                $this->assertStringContainsString('Unfilled template cover field: [Division]', implode(' ', $report['manual_review_rules']));
                $this->assertSame('My original body content.', $xp->evaluate('string(//w:p[.//w:t="My original body content."]//w:t)'));
                $this->assertContains('cover-block', array_column($report['template_mapping'], 'match'));
                $this->assertSame('center', $xp->evaluate('string(//w:p[.//w:t="November 2026"]/w:pPr/w:jc/@w:val)'));
            }
        }
    }

    public function test_cover_preserves_authors_beyond_the_template_example_count(): void
    {
        $p = static fn ($text, $bold = false) => '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>'.($bold ? '<w:b/>' : '').'</w:rPr><w:t>'.$text.'</w:t></w:r></w:p>';
        $sourceNames = ''; $studentNames = '';
        foreach (range(1, 5) as $i) $sourceNames .= $p('[Name '.$i.']', true);
        foreach (range(1, 6) as $i) $studentNames .= $p('Writer '.$i, true);
        $reference = $this->paper($p('[Title]', true).'<w:p/>'.$p('by').'<w:p/>'.$sourceNames.'<w:p/>'.$p('[Date]').'<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
        $student = $this->paper($p('My research title', true).'<w:p/>'.$p('by').$studentNames.$p('November 2026').'<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
        for ($pass = 0; $pass < 2; $pass++) {
            (new PaperFormatter)->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            foreach (range(1, 6) as $i) $this->assertEquals(1, $xp->evaluate('count(//w:t[.="Writer '.$i.'"])'));
            $this->assertEquals(1, $xp->evaluate('count(//w:t[.="November 2026"])'));
        }
    }

    public function test_template_or_alternatives_match_short_student_headings(): void
    {
        foreach ([['Hypothesis or Hypotheses', 'Hypothesis'], ['Methods or Materials', 'Materials']] as [$templateTitle, $studentTitle]) {
            $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="600"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:t>'.$templateTitle.'</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>'.$studentTitle.'</w:t></w:r></w:p>');
            $report = (new PaperFormatter)->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            $this->assertSame('Heading2', $xp->evaluate('string(//w:p[.//w:t="'.$studentTitle.'"]/w:pPr/w:pStyle/@w:val)'));
            $this->assertSame('600', $xp->evaluate('string(//w:p[.//w:t="'.$studentTitle.'"]/w:pPr/w:spacing/@w:before)'));
            $this->assertContains('heading-text', array_column($report['template_mapping'], 'match'));
        }
    }

    public function test_repeatable_placeholder_heading_examples_are_scoped_to_their_chapter(): void
    {
        $example = static fn ($title) => '<w:p><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>['.$title.']</w:t></w:r></w:p>';
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:ind w:firstLine="300"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>First chapter topic</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:r><w:t>[Leave one (1) blank line before the next section heading.]</w:t></w:r></w:p>'.$example('First category label').'<w:p><w:r><w:t>Example body.</w:t></w:r></w:p>'.$example('Additional category label'));
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>My first chapter topic</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:ind w:firstLine="720"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Reading Development</w:t></w:r></w:p><w:p><w:r><w:t>My paragraph.</w:t></w:r></w:p><w:p><w:pPr><w:ind w:firstLine="720"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Storytelling Activities</w:t></w:r></w:p>');
        $service = new PaperFormatter; $report = $service->formatUsingReference($student, $reference);
        $xp = $this->xml($student);
        foreach (['Reading Development', 'Storytelling Activities'] as $title) {
            $path = '//w:p[.//w:t="'.$title.'"]';
            $this->assertSame('0', $xp->evaluate('string('.$path.'/w:pPr/w:ind/@w:firstLine)'));
            $this->assertSame('100', $xp->evaluate('string('.$path.'/w:pPr/w:spacing/@w:beforeLines)'));
        }
        $this->assertEquals(2, count(array_filter($report['template_mapping'], fn ($item) => $item['match'] === 'chapter-heading-example')));
        $this->assertNotContains('[Leave one (1) blank line before the next section heading.]', $service->referenceHeadings($reference));
    }

    public function test_same_heading_in_different_chapters_uses_its_local_template_style(): void
    {
        $heading = static fn ($gap) => '<w:p><w:pPr><w:spacing w:before="'.$gap.'"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Shared heading</w:t></w:r></w:p>';
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>'.$heading(300).'<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p>'.$heading(800));
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p>'.$heading(100));
        (new PaperFormatter)->formatUsingReference($student, $reference);
        $this->assertSame('800', $this->xml($student)->evaluate('string(//w:p[.//w:t="Shared heading"]/w:pPr/w:spacing/@w:before)'));
    }

    public function test_inconsistent_placeholder_examples_require_review(): void
    {
        $example = static fn ($label, $gap) => '<w:p><w:pPr><w:spacing w:before="'.$gap.'"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>['.$label.']</w:t></w:r></w:p>';
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p>'.$example('First category', 300).$example('Second category', 900));
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="100"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>My custom category</w:t></w:r></w:p>');
        $report = (new PaperFormatter)->formatUsingReference($student, $reference);
        $this->assertTrue($report['manual_review_required']);
        $this->assertSame('100', $this->xml($student)->evaluate('string(//w:p[.//w:t="My custom category"]/w:pPr/w:spacing/@w:before)'));
    }

    public function test_heading_word_variations_copy_the_template_alignment_spacing_and_section_body(): void
    {
        foreach ([
            ['Synthesis of the Reviewed Related Literature and Studies', 'Synthesis of the Review and Related Literature and Studies', 480],
            ['Analysis of Collected Records', 'Analysis of the Collected Record', 840],
        ] as [$templateTitle, $studentTitle, $gap]) {
            $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="100"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Other distinct heading</w:t></w:r></w:p><w:p><w:r><w:t>First example.</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:line="480"/></w:pPr></w:p><w:p><w:pPr><w:spacing w:before="'.$gap.'"/><w:ind w:left="0" w:firstLine="0"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>'.$templateTitle.'</w:t></w:r></w:p><w:p><w:pPr><w:ind w:firstLine="900"/></w:pPr><w:r><w:t>Section example body.</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:ind w:left="720" w:firstLine="720"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>'.$studentTitle.'</w:t></w:r></w:p><w:p><w:r><w:t>Own section content.</w:t></w:r></w:p>');
            $report = (new PaperFormatter)->formatUsingReference($student, $reference);
            $xp = $this->xml($student); $heading = '//w:p[.//w:t="'.$studentTitle.'"]';
            $this->assertSame('0', $xp->evaluate('string('.$heading.'/w:pPr/w:ind/@w:left)'));
            $this->assertSame('0', $xp->evaluate('string('.$heading.'/w:pPr/w:ind/@w:firstLine)'));
            $this->assertSame((string) $gap, $xp->evaluate('string('.$heading.'/w:pPr/w:spacing/@w:before)'));
            $this->assertEquals(1, $xp->evaluate('count('.$heading.'/preceding-sibling::w:p[1][not(.//w:t)])'));
            $this->assertSame('900', $xp->evaluate('string(//w:p[.//w:t="Own section content."]/w:pPr/w:ind/@w:firstLine)'));
            $this->assertContains('heading-words', array_column($report['template_mapping'], 'match'));
        }
    }

    public function test_contents_entries_do_not_compete_with_real_heading_matches(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>TABLE OF CONTENTS</w:t></w:r></w:p><w:p><w:pPr><w:tabs><w:tab w:leader="dot" w:pos="8000"/></w:tabs><w:ind w:left="1200"/></w:pPr><w:r><w:t>Analysis of the Collected Records</w:t><w:tab/><w:t>00</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="700"/><w:ind w:left="0"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Analysis of Collected Records</w:t></w:r></w:p>');
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Analysis of the Collected Record</w:t></w:r></w:p>');
        $service = new PaperFormatter; $service->formatUsingReference($student, $reference);
        $this->assertSame('700', $this->xml($student)->evaluate('string(//w:p[.//w:t="Analysis of the Collected Record"]/w:pPr/w:spacing/@w:before)'));
        $this->assertNotContains('Analysis of the Collected Records00', $service->referenceHeadings($reference));
    }

    public function test_ambiguous_similar_headings_are_reported_instead_of_choosing_a_layout(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="400"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Analysis of Collected Records</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="900"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Analysis of the Collected Records</w:t></w:r></w:p>');
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 2</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="200"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Analysis of the Collected Record</w:t></w:r></w:p>');
        $report = (new PaperFormatter)->formatUsingReference($student, $reference);
        $this->assertTrue($report['manual_review_required']);
        $this->assertSame('200', $this->xml($student)->evaluate('string(//w:p[.//w:t="Analysis of the Collected Record"]/w:pPr/w:spacing/@w:before)'));
    }

    public function test_section_boundary_before_combined_template_chapter_is_copied_to_separate_student_chapter(): void
    {
        foreach (['nextPage' => '1', 'continuous' => ''] as $sectionType => $expected) {
            $reference = $this->paper('<w:p><w:r><w:t>TABLE OF CONTENTS</w:t></w:r></w:p><w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>Last contents entry</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>CHAPTER 1</w:t><w:br/><w:t>CUSTOM CHAPTER TITLE</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p><w:sectPr><w:type w:val="'.$sectionType.'"/></w:sectPr>');
            $zip = new ZipArchive; $zip->open($reference);
            $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="Heading1"><w:pPr><w:keepNext/><w:spacing w:before="480"/></w:pPr></w:style></w:styles>'); $zip->close();
            $student = $this->paper('<w:p><w:r><w:t>Student cover</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>CUSTOM CHAPTER TITLE</w:t></w:r></w:p><w:p><w:r><w:t>Own paragraph.</w:t></w:r></w:p>');
            (new PaperFormatter)->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            $this->assertSame('Heading1', $xp->evaluate('string(//w:p[.//w:t="CHAPTER 1"]/w:pPr/w:pStyle/@w:val)'));
            $this->assertEquals($expected === '1' ? 1 : 0, $xp->evaluate('count(//w:p[.//w:t="CHAPTER 1"]/w:r/w:br[@w:type="page"])'));
            $this->assertSame('0', $xp->evaluate('string(//w:p[.//w:t="CUSTOM CHAPTER TITLE"]/w:pPr/w:pageBreakBefore/@w:val)'));
            $this->assertSame('0', $xp->evaluate('string(//w:p[.//w:t="CUSTOM CHAPTER TITLE"]/w:pPr/w:spacing/@w:before)'));
            $this->assertEquals(1, $xp->evaluate('count(//w:p[.//w:t="CUSTOM CHAPTER TITLE"]/w:pPr/w:keepNext)'));
        }
    }

    public function test_template_page_breaks_in_runs_and_empty_paragraphs_are_not_lost(): void
    {
        foreach (['<w:p><w:r><w:br w:type="page"/></w:r></w:p>' => '', '' => '<w:br w:type="page"/>'] as $preceding => $leading) {
            $reference = $this->paper('<w:p><w:r><w:t>Prior section.</w:t></w:r></w:p>'.$preceding.'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r>'.$leading.'<w:t>Custom next section</w:t></w:r></w:p><w:p><w:r><w:t>Example body.</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>Prior content.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Custom next section</w:t></w:r></w:p><w:p><w:r><w:t>Own body.</w:t></w:r></w:p>');
            (new PaperFormatter)->formatUsingReference($student, $reference);
            $this->assertEquals(1, $this->xml($student)->evaluate('count(//w:p[.//w:t="Custom next section"]/w:r/w:br[@w:type="page"])'));
        }
    }

    public function test_missing_template_sections_are_reported_without_inserting_placeholder_content(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>Template title</w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>APPROVAL SHEET</w:t></w:r></w:p><w:p><w:r><w:t>[Approval text goes here.]</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
        $student = $this->paper('<w:p><w:r><w:t>My title</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
        $report = (new PaperFormatter)->formatUsingReference($student, $reference);
        $this->assertTrue($report['manual_review_required']);
        $this->assertStringContainsString('Missing template section: APPROVAL SHEET', implode(' ', $report['manual_review_rules']));
        $this->assertEquals(0, $this->xml($student)->evaluate('count(//w:t[contains(.,"Approval text") or .="APPROVAL SHEET"])'));
    }

    public function test_custom_inherited_heading_styles_work_without_chapters_and_keep_student_titles(): void
    {
        foreach ([360, 840] as $gap) {
            $reference = $this->paper('<w:p><w:pPr><w:pStyle w:val="CustomSection"/></w:pPr><w:r><w:t>Sample section title</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="CustomBody"/></w:pPr><w:r><w:t>Sample paragraph.</w:t></w:r></w:p>');
            $zip = new ZipArchive; $zip->open($reference);
            $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="SectionBase"><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="'.$gap.'" w:after="160"/><w:pageBreakBefore w:val="1"/></w:pPr><w:rPr><w:b w:val="0"/><w:i/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CustomSection"><w:basedOn w:val="SectionBase"/></w:style><w:style w:type="paragraph" w:styleId="CustomBody"><w:pPr><w:spacing w:line="300"/></w:pPr></w:style></w:styles>'); $zip->close();
            $student = $this->paper('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>My original title</w:t></w:r></w:p><w:p><w:r><w:t>My own paragraph.</w:t></w:r></w:p>');
            $service = new PaperFormatter; $report = $service->formatUsingReference($student, $reference, $this->rules());
            $xp = $this->xml($student);
            $this->assertSame('CustomSection', $xp->evaluate('string(//w:p[.//w:t="My original title"]/w:pPr/w:pStyle/@w:val)'));
            $this->assertEquals(0, $xp->evaluate('count(//w:p[.//w:t="My original title"]/w:r/w:rPr/w:b)'));
            $this->assertSame('CustomBody', $xp->evaluate('string(//w:p[.//w:t="My own paragraph."]/w:pPr/w:pStyle/@w:val)'));
            $this->assertContains('Sample section title', $service->referenceHeadings($reference));
            $this->assertFalse($report['manual_review_required']);
            $zip = new ZipArchive; $zip->open($student); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
            $this->assertStringContainsString('w:before="'.$gap.'"', $styles);
            $this->assertStringContainsString('w:pageBreakBefore w:val="1"', $styles);
        }
    }

    public function test_reference_mode_preserves_font_and_chapter_breaks_while_isolating_dividers(): void
    {
        $reference = $this->paper('<w:p><w:pPr><w:pageBreakBefore w:val="0"/></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:sz w:val="22"/></w:rPr><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:sz w:val="26"/><w:b w:val="0"/></w:rPr><w:t>APPENDICES</w:t></w:r></w:p>');
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Own body.</w:t></w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p>');
        (new PaperFormatter)->formatUsingReference($student, $reference, $this->rules());
        $xp = $this->xml($student);
        $this->assertEquals(1, $xp->evaluate('count(//w:p[.//w:t="APPENDICES"]//w:br[@w:type="page"])'));
        $this->assertSame('0', $xp->evaluate('string(//w:p[.//w:t="CHAPTER 1"]/w:pPr/w:pageBreakBefore/@w:val)'));
        $this->assertSame('26', $xp->evaluate('string(//w:p[.//w:t="APPENDICES"]/w:r/w:rPr/w:sz/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string(//w:p[.//w:t="APPENDICES"]/w:r/w:rPr/w:b/@w:val)'));
        $this->assertSame('center', $xp->evaluate('string(//w:p[.//w:t="APPENDICES"]/w:pPr/w:jc/@w:val)'));
    }

    public function test_reference_body_formatting_follows_the_matching_section_and_copies_surrounding_gaps(): void
    {
        $heading = static fn($title) => '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>'.$title.'</w:t></w:r></w:p>';
        $reference = $this->paper($heading('First custom topic').'<w:p><w:pPr><w:spacing w:line="240"/><w:ind w:firstLine="300"/></w:pPr><w:r><w:t>First example.</w:t></w:r></w:p>'.$heading('Second custom topic').'<w:p><w:pPr><w:spacing w:line="360"/></w:pPr></w:p><w:p><w:pPr><w:spacing w:line="480"/><w:ind w:firstLine="900"/></w:pPr><w:r><w:t>Second example.</w:t></w:r></w:p>');
        $student = $this->paper($heading('First custom topic').'<w:p/><w:p><w:r><w:t>My first content.</w:t></w:r></w:p>'.$heading('Second custom topic').'<w:p><w:r><w:t>My second content.</w:t></w:r></w:p>');
        for ($pass = 0; $pass < 2; $pass++) {
            (new PaperFormatter)->formatUsingReference($student, $reference);
            $xp = $this->xml($student);
            $this->assertSame('240', $xp->evaluate('string(//w:p[.//w:t="My first content."]/w:pPr/w:spacing/@w:line)'));
            $this->assertSame('900', $xp->evaluate('string(//w:p[.//w:t="My second content."]/w:pPr/w:ind/@w:firstLine)'));
            $this->assertSame('480', $xp->evaluate('string(//w:p[.//w:t="My second content."]/w:pPr/w:spacing/@w:line)'));
            $this->assertEquals(1, $xp->evaluate('count(/w:document/w:body/w:p[not(.//w:t)])'));
        }
    }

    public function test_unmatched_template_structure_is_reported_and_not_renamed(): void
    {
        $reference = $this->paper('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Example heading</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $student = $this->paper('<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>Unmatched subsection</w:t></w:r></w:p>');
        $report = (new PaperFormatter)->formatUsingReference($student, $reference);
        $this->assertTrue($report['manual_review_required']);
        $this->assertStringContainsString('Unmatched subsection', implode(' ', $report['manual_review_rules']));
        $this->assertSame('Unmatched subsection', $this->xml($student)->evaluate('string(//w:p//w:t)'));
    }

    public function test_combined_reference_chapter_and_annotated_heading_keep_the_template_spacing(): void
    {
        foreach ([480, 720] as $gap) {
            $reference = $this->paper('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>CHAPTER 1</w:t><w:br/><w:t>THE PROBLEM AND ITS BACKGROUND</w:t></w:r></w:p><w:p><w:r><w:t>Reference introduction.</w:t></w:r></w:p><w:p><w:r><w:t>[Leave one (1) blank line before the next section heading.]</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="'.$gap.'"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:t>Theoretical Framework (Quantitative Research) or Philosophical Underpinning (Qualitative Research)</w:t></w:r></w:p><w:p><w:r><w:t>Reference theory.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="'.$gap.'"/></w:pPr><w:r><w:t>Conceptual Framework</w:t></w:r></w:p><w:p><w:r><w:t>Reference paradigm.</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>Student title</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Student introduction.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Theoretical Framework</w:t></w:r></w:p><w:p><w:r><w:t>Student theory.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Conceptual Framework</w:t></w:r></w:p><w:p><w:r><w:t>Student paradigm.</w:t></w:r></w:p>');
            $service = new PaperFormatter;
            $service->formatUsingReference($student, $reference, $this->rules());
            $xp = $this->xml($student);
            foreach (['Theoretical Framework', 'Conceptual Framework'] as $heading) {
                $path = '//w:p[.//w:t="'.$heading.'"]';
                $this->assertSame('Heading2', $xp->evaluate('string('.$path.'/w:pPr/w:pStyle/@w:val)'));
                $this->assertSame((string) $gap, $xp->evaluate('string('.$path.'/w:pPr/w:spacing/@w:before)'));
                $this->assertSame('', $xp->evaluate('string('.$path.'/w:pPr/w:spacing/@w:beforeLines)'));
            }
            $this->assertSame('CHAPTER 1', $xp->evaluate('string(//w:p[.//w:t="CHAPTER 1"]//w:t)'));
            $this->assertSame('Student title', $xp->evaluate('string(/w:document/w:body/w:p[1]//w:t)'));
            $this->assertContains('Conceptual Framework', $service->referenceHeadings($reference));
        }
    }

    public function test_section_gap_copies_blank_paragraphs_from_each_reference_without_accumulating(): void
    {
        foreach ([0, 1, 2] as $count) {
            $blank = '<w:p><w:pPr><w:spacing w:line="480" w:lineRule="auto"/></w:pPr></w:p>';
            $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>'.str_repeat($blank, $count).'<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Conceptual Framework</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Conceptual Framework</w:t></w:r></w:p>');
            $formatter = new PaperFormatter;
            for ($pass = 0; $pass < 2; $pass++) {
                $formatter->formatUsingReference($student, $reference);
                $xp = $this->xml($student);
                $this->assertEquals($count, $xp->evaluate('count(/w:document/w:body/w:p[not(.//w:t) and w:pPr/w:spacing[@w:line="480"]])'));
                $this->assertSame('Student body.', $xp->evaluate('string(//w:p[.//w:t="Student body."]//w:t)'));
            }
        }
    }

    public function test_section_gap_reads_the_reference_instruction_when_no_blank_paragraph_is_present(): void
    {
        foreach (['one (1)' => 100, 'two (2)' => 200] as $number => $expected) {
            $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>[Leave '.$number.' blank line before the next section heading.]</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Conceptual Framework</w:t></w:r></w:p>');
            $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Conceptual Framework</w:t></w:r></w:p>');
            (new PaperFormatter)->formatUsingReference($student, $reference);
            $this->assertSame((string) $expected, $this->xml($student)->evaluate('string(//w:p[.//w:t="Conceptual Framework"]/w:pPr/w:spacing/@w:beforeLines)'));
        }
    }

    public function test_reference_heading_spacing_is_not_overridden_by_general_rules(): void
    {
        $reference = $this->paper('<w:p><w:pPr><w:pStyle w:val="TemplateChapter"/></w:pPr><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $zip = new ZipArchive; $zip->open($reference);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="TemplateChapter"><w:pPr><w:spacing w:before="600" w:after="300"/><w:jc w:val="center"/></w:pPr></w:style></w:styles>');
        $zip->close();
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p>');

        (new PaperFormatter)->formatUsingReference($student, $reference, [['type' => 'spacing', 'value' => 2]]);

        $xp = $this->xml($student);
        $chapter = '//w:p[w:r/w:t="CHAPTER 1"]';
        $this->assertSame('TemplateChapter', $xp->evaluate('string('.$chapter.'/w:pPr/w:pStyle/@w:val)'));
        $this->assertSame('', $xp->evaluate('string('.$chapter.'/w:pPr/w:spacing/@w:before)'));
        $zip = new ZipArchive; $zip->open($student); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
        $this->assertStringContainsString('w:before="600"', $styles);
        $this->assertStringContainsString('w:after="300"', $styles);
    }

    public function test_leading_tab_in_reference_is_applied_as_body_first_line_indent(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>THE PROBLEM AND ITS BACKGROUND</w:t></w:r></w:p><w:p><w:r><w:t>Introduction</w:t></w:r></w:p><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:tab/></w:r><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>THE PROBLEM AND ITS BACKGROUND</w:t></w:r></w:p><w:p><w:r><w:t>Introduction</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p>');

        $report = (new PaperFormatter)->formatUsingReference($student, $reference);

        $this->assertSame(0.5, $report['settings']['indentation']);
        $this->assertSame('720', $this->xml($student)->evaluate('string(//w:p[w:r/w:t="Student body."]/w:pPr/w:ind/@w:firstLine)'));
    }

    public function test_reference_uppercase_section_title_and_topic_heading_keep_distinct_styles(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>ADMIN SAMPLE TITLE</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TemplateSectionTitle"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>THE PROBLEM AND ITS BACKGROUND</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TemplateTopic"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Introduction</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $zip = new ZipArchive; $zip->open($reference);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="TemplateSectionTitle"><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TemplateTopic"><w:pPr><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style></w:styles>');
        $zip->close();
        $student = $this->paper('<w:p><w:r><w:t>USER THESIS TITLE</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>USER SECTION TITLE</w:t></w:r></w:p><w:p><w:r><w:t>Introduction</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p>');

        (new PaperFormatter)->formatUsingReference($student, $reference);

        $xp = $this->xml($student);
        $this->assertSame('USER SECTION TITLE', $xp->evaluate('string(//w:p[w:pPr/w:pStyle[@w:val="TemplateSectionTitle"]]//w:t)'));
        $this->assertSame('TemplateSectionTitle', $xp->evaluate('string(//w:p[w:r/w:t="USER SECTION TITLE"]/w:pPr/w:pStyle/@w:val)'));
        $this->assertSame('TemplateTopic', $xp->evaluate('string(//w:p[w:r/w:t="Introduction"]/w:pPr/w:pStyle/@w:val)'));
        foreach (['USER SECTION TITLE', 'Introduction'] as $heading) {
            $this->assertSame('1', $xp->evaluate('string(count(//w:p[.//w:t="'.$heading.'"]/w:r/w:rPr/w:b[@w:val="1" or not(@w:val)]))'));
        }
        $this->assertSame('1', $xp->evaluate('string(count(//w:p[w:r/w:t="Introduction"]/w:r/w:rPr/w:b))'));
        $this->assertSame('Student body.', $xp->evaluate('string(//w:p[w:r/w:t="Student body."]/w:r/w:t)'));
        $this->assertSame('USER THESIS TITLE', $xp->evaluate('string(//w:p[w:r/w:t="USER THESIS TITLE"]//w:t)'));
    }

    public function test_reference_heading_matches_its_exact_admin_style_when_role_counts_differ(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TemplateRightHeading"/></w:pPr><w:r><w:t>OBJECTIVES</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="TemplateCenteredHeading"/></w:pPr><w:r><w:t>THE PROBLEM AND ITS BACKGROUND</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $zip = new ZipArchive; $zip->open($reference);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="TemplateRightHeading"><w:pPr><w:jc w:val="right"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="TemplateCenteredHeading"><w:pPr><w:jc w:val="center"/></w:pPr></w:style></w:styles>');
        $zip->close();
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>THE PROBLEM AND ITS BACKGROUND</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p>');

        (new PaperFormatter)->formatUsingReference($student, $reference);

        $xp = $this->xml($student);
        $heading = '//w:p[w:r/w:t="THE PROBLEM AND ITS BACKGROUND"]';
        $this->assertSame('TemplateCenteredHeading', $xp->evaluate('string('.$heading.'/w:pPr/w:pStyle/@w:val)'));
        $zip = new ZipArchive; $zip->open($student); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
        $stylesDoc = new DOMDocument; $this->assertTrue($stylesDoc->loadXML($styles));
        $stylesXp = new DOMXPath($stylesDoc); $stylesXp->registerNamespace('w', self::W);
        $this->assertSame('center', $stylesXp->evaluate('string(//w:style[@w:styleId="TemplateCenteredHeading"]/w:pPr/w:jc/@w:val)'));
    }

    public function test_bold_template_heading_matches_unstyled_student_heading_by_exact_text(): void
    {
        $reference = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Introduction</w:t></w:r></w:p><w:p><w:r><w:t>Reference body.</w:t></w:r></w:p>');
        $zip = new ZipArchive; $zip->open($reference);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="'.self::W.'"><w:style w:type="paragraph" w:styleId="Heading2"><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>');
        $zip->close();
        $student = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Introduction</w:t></w:r></w:p><w:p><w:r><w:t>Student body.</w:t></w:r></w:p>');

        (new PaperFormatter)->formatUsingReference($student, $reference);

        $xp = $this->xml($student);
        $this->assertSame('Heading2', $xp->evaluate('string(//w:p[w:r/w:t="Introduction"]/w:pPr/w:pStyle/@w:val)'));
        $zip = new ZipArchive; $zip->open($student); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
        $stylesDoc = new DOMDocument; $this->assertTrue($stylesDoc->loadXML($styles));
        $stylesXp = new DOMXPath($stylesDoc); $stylesXp->registerNamespace('w', self::W);
        $this->assertSame('1', $stylesXp->evaluate('string(count(//w:style[@w:styleId="Heading2"]/w:rPr/w:b))'));
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

    public function test_cover_date_stays_with_title_without_degree_statement_or_by_label(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>Research title</w:t></w:r></w:p><w:p><w:r><w:t>Researcher name</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/><w:keepNext/><w:spacing w:before="9000"/></w:pPr><w:r><w:br w:type="page"/><w:t>April 2026</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $date = '//w:p[w:r/w:t="April 2026"]';
        $this->assertEquals(0, $xp->evaluate('count('.$date.'//w:br[@w:type="page"])'));
        $this->assertSame('0', $xp->evaluate('string('.$date.'/w:pPr/w:pageBreakBefore/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string('.$date.'/w:pPr/w:keepNext/@w:val)'));
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="Researcher name"]/w:pPr/w:keepNext/@w:val)'));
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="CHAPTER 1"]//w:br[@w:type="page"])'));
        $this->assertEquals(1, $xp->evaluate('count(//w:br[@w:type="page"])'));
    }

    public function test_reference_title_layout_separates_thesis_statement_and_authors(): void
    {
        $body = '';
        foreach (['THESIS TITLE', 'A Thesis', 'Presented to the Faculty', 'In Partial Fulfillment of the Requirements', 'Computer Science', 'by', 'FIRST AUTHOR', 'SECOND AUTHOR', 'April 2026', 'CHAPTER 1'] as $text) $body .= '<w:p><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        $file = $this->paper($body); (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        foreach (['A Thesis', 'In Partial Fulfillment of the Requirements', 'by', 'FIRST AUTHOR', 'April 2026'] as $text) {
            $this->assertGreaterThan(0, (int) $xp->evaluate('string(//w:p[w:r/w:t="'.$text.'"]/w:pPr/w:spacing/@w:before)'));
            $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="'.$text.'"]/w:pPr/w:spacing/@w:line)'));
        }
        $this->assertSame('0', $xp->evaluate('string(//w:p[w:r/w:t="SECOND AUTHOR"]/w:pPr/w:spacing/@w:before)'));
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

    public function test_lettered_list_continuations_clear_padding_but_keep_numbering_indents(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="7"/></w:numPr><w:ind w:left="720" w:hanging="360"/><w:jc w:val="center"/></w:pPr><w:r><w:t>How can students submit payment requirements</w:t><w:br/><w:tab/><w:t xml:space="preserve">   receipts for service availing?</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $p = '//w:p[w:pPr/w:numPr]';
        $this->assertSame('left', $xp->evaluate('string('.$p.'/w:pPr/w:jc/@w:val)'));
        $this->assertSame('720', $xp->evaluate('string('.$p.'/w:pPr/w:ind/@w:left)'));
        $this->assertSame('360', $xp->evaluate('string('.$p.'/w:pPr/w:ind/@w:hanging)'));
        $this->assertSame('7', $xp->evaluate('string('.$p.'/w:pPr/w:numPr/w:numId/@w:val)'));
        $this->assertSame('receipts for service availing?', $xp->evaluate('string('.$p.'/w:r/w:t[2])'));
        $this->assertEquals(0, $xp->evaluate('count('.$p.'//w:tab)'));
        $this->assertSame('480', $xp->evaluate('string('.$p.'/w:pPr/w:spacing/@w:line)'));
    }

    public function test_different_templates_apply_their_own_values_to_every_body_paragraph(): void
    {
        foreach ([['Arial', 10, 1.5, 2], ['Times New Roman', 12, 2, 1.5]] as [$font, $size, $spacing, $left]) {
            $body = '<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>';
            for ($i = 0; $i < 30; $i++) $body .= '<w:p><w:r><w:t>Paragraph '.$i.'</w:t></w:r></w:p>';
            $file = $this->paper($body);
            $rules = [['type' => 'font', 'value' => $font], ['type' => 'size', 'value' => $size], ['type' => 'spacing', 'value' => $spacing], ['type' => 'margin', 'value' => ['left' => $left, 'right' => 1, 'top' => 1, 'bottom' => 1]], ['name' => 'Citation accuracy', 'detail' => 'All sources must be correctly cited.']];
            $report = (new PaperFormatter)->format($file, $rules); $xp = $this->xml($file);
            $this->assertEquals(31, $report['paragraphs_processed']);
            $this->assertSame(['Citation accuracy'], $report['manual_review_rules']);
            $this->assertSame((string) ($left * 1440), $xp->evaluate('string(//w:pgMar/@w:left)'));
            foreach ($xp->query('//w:p[w:r/w:t]') as $p) {
                $this->assertSame($font, $xp->evaluate('string(.//w:rFonts/@w:ascii)', $p));
                $this->assertSame((string) ($size * 2), $xp->evaluate('string(.//w:sz/@w:val)', $p));
                $this->assertSame((string) ($spacing * 240), $xp->evaluate('string(./w:pPr/w:spacing/@w:line)', $p));
            }
        }
    }

    public function test_topic_headings_keep_with_following_text_but_body_does_not(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Statement of the Problem</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>New Template Topic</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Custom Topic</w:t></w:r></w:p><w:p><w:r><w:t>Regular body paragraph.</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        foreach (['Statement of the Problem', 'New Template Topic', 'Custom Topic'] as $text) {
            $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="'.$text.'"]/w:pPr/w:keepNext/@w:val)'));
            $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="'.$text.'"]/w:pPr/w:keepLines/@w:val)'));
        }
        $this->assertSame('0', $xp->evaluate('string(//w:p[w:r/w:t="Regular body paragraph."]/w:pPr/w:keepNext/@w:val)'));
    }

    public function test_heading_moves_with_text_across_blank_spacers_and_existing_page_break(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Previous body text.</w:t></w:r></w:p><w:p><w:r><w:t>Theoretical Framework</w:t></w:r></w:p><w:p><w:r><w:t> </w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Following framework explanation.</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $heading = '//w:p[w:r/w:t="Theoretical Framework"]';
        $this->assertSame('page', $xp->evaluate('string('.$heading.'/w:r[1]/w:br/@w:type)'));
        $this->assertSame('Following framework explanation.', $xp->evaluate('string('.$heading.'/following-sibling::w:p[1]/w:r/w:t)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:p[w:r/w:t="Following framework explanation."]/w:pPr/w:pageBreakBefore)'));
        $this->assertEquals(4, $xp->evaluate('count(/w:document/w:body/w:p)'));
    }

    public function test_cover_date_has_no_old_page_break_and_topic_has_no_unrequested_gap(): void
    {
        $body = '';
        foreach (['THESIS TITLE', 'A Thesis', 'In Partial Fulfillment of the Requirements', 'by', 'AUTHOR'] as $text) $body .= '<w:p><w:r><w:t>'.$text.'</w:t></w:r></w:p>';
        $body .= '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:br w:type="page"/><w:t>April 2026</w:t></w:r></w:p><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Theoretical Framework</w:t></w:r></w:p><w:p><w:r><w:t>Explanation.</w:t></w:r></w:p>';
        $file = $this->paper($body); (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $date = '//w:p[w:r/w:t="April 2026"]';
        $this->assertEquals(0, $xp->evaluate('count('.$date.'//w:br[@w:type="page"])'));
        $this->assertSame('0', $xp->evaluate('string('.$date.'/w:pPr/w:pageBreakBefore/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string('.$date.'/w:pPr/w:keepNext/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string(//w:p[w:r/w:t="Theoretical Framework"]/w:pPr/w:spacing/@w:after)'));
        $this->assertSame('page', $xp->evaluate('string(//w:p[w:r/w:t="CHAPTER 1"]/w:r[1]/w:br/@w:type)'));
    }

    public function test_attention_copy_has_yellow_marks_and_card_anchors_without_inline_notes(): void
    {
        $original = $this->paper('<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:t>Body text.</w:t></w:r></w:p><w:sectPr><w:pgMar w:left="1440" w:top="125" w:right="1440" w:bottom="1440"/></w:sectPr>');
        $hash = hash_file('sha256', $original);
        $formatter = new PaperFormatter;
        $marked = (new PaperAttentionMarker)->mark($original, $formatter->settings($this->rules()));
        $this->assertCount(3, $marked['issues']);
        $this->assertSame($hash, hash_file('sha256', $original));
        $attention = tempnam(sys_get_temp_dir(), 'marked_test_'); $this->files[] = $attention;
        file_put_contents($attention, base64_decode($marked['document_base64'], true));
        $xp = $this->xml($attention);
        $this->assertSame('yellow', $xp->evaluate('string(//w:highlight/@w:val)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:color[@w:val="FF0000"])'));
        $this->assertEquals(1, $xp->evaluate('count(//w:p)'));
        $this->assertSame('Body text.', $xp->evaluate('string(//w:t)'));
        $this->assertSame($marked['issues'][0]['anchor'], $xp->evaluate('string(//w:bookmarkStart/@w:name)'));
        $this->assertSame($marked['issues'][0]['anchor'], $marked['issues'][1]['anchor']);
        $fixed = tempnam(sys_get_temp_dir(), 'fixed_test_'); $this->files[] = $fixed; copy($original, $fixed);
        $formatter->format($fixed, $this->rules()); $xp = $this->xml($fixed);
        $this->assertSame('480', $xp->evaluate('string(//w:spacing/@w:line)'));
        $this->assertSame('2160', $xp->evaluate('string(//w:pgMar/@w:left)'));
        $this->assertSame('1440', $xp->evaluate('string(//w:pgMar/@w:top)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:highlight)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:color[@w:val="FF0000"])'));
        $this->assertSame('Body text.', $xp->evaluate('string(//w:t)'));
    }
    public function test_margin_cards_anchor_to_their_section_and_unlocated_ai_findings_have_no_anchor(): void
    {
        $file = $this->paper('<w:p><w:pPr><w:sectPr><w:pgMar w:left="1440"/></w:sectPr></w:pPr><w:r><w:t>First section</w:t></w:r></w:p><w:p><w:r><w:t>Second section</w:t></w:r></w:p><w:sectPr><w:pgMar w:left="1440"/></w:sectPr>');
        $marked = (new PaperAttentionMarker)->mark($file, (new PaperFormatter)->settings($this->rules()), [['status' => 'fail', 'paragraph' => 0, 'rule' => 'Abstract', 'explanation' => 'Missing abstract', 'suggestion' => 'Add your abstract.']]);
        $this->assertSame(1, $marked['issues'][0]['paragraph']);
        $this->assertSame(2, $marked['issues'][1]['paragraph']);
        $this->assertNotSame($marked['issues'][0]['anchor'], $marked['issues'][1]['anchor']);
        $this->assertNull($marked['issues'][2]['anchor']);
        $this->assertStringContainsString('Add your abstract.', $marked['issues'][2]['message']);
    }

    public function test_attention_detects_figures_tables_images_and_unmatched_captions(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>Figure 1. System diagram</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p><w:p><w:r><w:t>Body text</w:t></w:r></w:p><w:p><w:r><w:pict/></w:r></w:p><w:p><w:r><w:t>Other body text</w:t></w:r></w:p><w:p><w:r><w:t>Table 1. Results</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Table 2. Missing object</w:t></w:r></w:p>');
        $marked = (new PaperAttentionMarker)->mark($file, (new PaperFormatter)->settings([]));
        $this->assertSame(['figure', 'image', 'table', 'caption'], array_column($marked['objects'], 'type'));
        $this->assertStringContainsString('System diagram', $marked['objects'][0]['message']);
        $this->assertStringContainsString('not confirmed', $marked['objects'][1]['message']);
        $this->assertStringContainsString('Table 1. Results', $marked['objects'][2]['message']);
        foreach ($marked['objects'] as $object) $this->assertNotEmpty($object['anchor']);
        $this->assertCount(0, $marked['issues']);
    }

    public function test_formatter_preserves_figure_anchor_and_text_box_layout(): void
    {
        $figure = '<w:p><w:pPr><w:spacing w:line="240" w:before="900"/><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:pict><w:txbxContent><w:p><w:pPr><w:spacing w:line="200" w:lineRule="exact"/><w:ind w:left="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="18"/></w:rPr><w:t>Independent Variable</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>';
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p>'.$figure.'<w:p><w:r><w:t>Figure 2. Conceptual paradigm</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:line="240"/></w:pPr><w:r><w:t>Explanation.</w:t></w:r></w:p>');
        $before = $this->xml($file)->query('//w:pict')->item(0)->C14N();
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertSame($before, $xp->query('//w:pict')->item(0)->C14N());
        $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="Explanation."]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('Figure 2. Conceptual paradigm', $xp->evaluate('string(//w:p[w:r/w:t="Figure 2. Conceptual paradigm"]//w:t)'));
    }

    public function test_figure_caption_is_adjacent_and_kept_with_its_drawing(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p><w:p/><w:p><w:pPr><w:pageBreakBefore/><w:ind w:firstLine="720"/></w:pPr><w:r><w:t>Figure 2. Conceptual framework</w:t></w:r></w:p><w:p><w:r><w:t>Figure 2 shows the relationships.</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:drawing]/following-sibling::*[1][w:r/w:t="Figure 2. Conceptual framework"])'));
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:drawing]/w:pPr/w:keepNext/@w:val)'));
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="Figure 2. Conceptual framework"]/w:pPr/w:keepLines/@w:val)'));
        $this->assertSame('0', $xp->evaluate('string(//w:p[w:r/w:t="Figure 2. Conceptual framework"]/w:pPr/w:ind/@w:firstLine)'));
        $this->assertSame('0', $xp->evaluate('string(//w:p[w:r/w:t="Figure 2. Conceptual framework"]/w:pPr/w:pageBreakBefore/@w:val)'));
    }

    public function test_cv_rules_are_scoped_and_photo_size_comes_from_selected_template(): void
    {
        $rules = array_merge($this->rules(), [['detail' => 'Curriculum Vitae: single-spaced, left-aligned, a 1.5 by 1.5 inch picture, maximum of one (1) page per author.']]);
        $formatter = new PaperFormatter;
        $this->assertSame(2, $formatter->settings($rules)['spacing']);
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Body text</w:t></w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Curriculum Vitae</w:t></w:r></w:p><w:p><w:r><w:t>PERSONAL INFORMATION</w:t></w:r></w:p><w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t>Name: Researcher</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="100" cy="200"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:spPr><a:xfrm><a:ext cx="100" cy="200"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:t>PERSONAL INFORMATION</w:t></w:r></w:p>');
        $formatter->format($file, $rules); $xp = $this->xml($file);
        $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="Body text"]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('240', $xp->evaluate('string(//w:p[w:r/w:t="Name: Researcher"]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('720', $xp->evaluate('string(//w:p[w:r/w:t="Name: Researcher"]/w:pPr/w:ind/@w:left)'));
        $this->assertSame('left', $xp->evaluate('string(//w:p[w:r/w:t="Name: Researcher"]/w:pPr/w:jc/@w:val)'));
        $this->assertSame('1371600', $xp->evaluate('string(//*[local-name()="extent"]/@cx)'));
        $this->assertSame('1371600', $xp->evaluate('string(//*[local-name()="extent"]/@cy)'));
        $this->assertEquals(1, $xp->evaluate('count((//w:p[w:r/w:t="PERSONAL INFORMATION"])[2]//w:br[@w:type="page"])'));
        $other = $formatter->settings([['detail' => 'Curriculum Vitae: a 2 by 2 inch picture, double-spaced.']]);
        $this->assertSame(2.0, $other['cv']['photo_width']);
        $this->assertSame(2, $other['cv']['spacing']);
    }

    public function test_appendices_word_is_alone_on_a_page_without_forcing_every_letter_to_a_new_page(): void
    {
        $file = $this->paper('<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>Appendix A - Letter</w:t></w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>APPENDIX A</w:t></w:r></w:p><w:p><w:r><w:t>Letter content.</w:t></w:r></w:p><w:p><w:r><w:t>Appendix B - Questionnaire</w:t></w:r></w:p><w:p><w:r><w:t>Questions.</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertEquals(0, $xp->evaluate('count(//w:p[w:pPr/w:pStyle[@w:val="TOC1"]]//w:br[@w:type="page"])'));
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="APPENDIX A"]//w:br[@w:type="page"])'));
        $this->assertEquals(0, $xp->evaluate('count(//w:p[w:r/w:t="Appendix B - Questionnaire"]//w:br[@w:type="page"])'));
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="APPENDICES"]//w:br[@w:type="page"])'));
        $this->assertSame('0', $xp->evaluate('string(//w:p[w:r/w:t="APPENDICES"]/w:pPr/w:keepNext/@w:val)'));
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="APPENDIX A"]/w:pPr/w:keepNext/@w:val)'));
        $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="Letter content."]/w:pPr/w:spacing/@w:line)'));
        $this->assertSame('Letter content.', $xp->evaluate('string(//w:p[w:r/w:t="Letter content."]//w:t)'));
    }

    public function test_appendices_divider_is_bold_38_point_centered_for_different_templates(): void
    {
        foreach ([['type' => 'size', 'value' => 10], ['type' => 'size', 'value' => 14]] as $sizeRule) {
            $file = $this->paper('<w:p><w:pPr><w:ind w:left="720" w:firstLine="720"/></w:pPr><w:r><w:t>Appendices</w:t></w:r></w:p><w:p><w:r><w:t>Appendix A</w:t></w:r></w:p>');
            (new PaperFormatter)->format($file, array_merge($this->rules(), [$sizeRule])); $xp = $this->xml($file);
            $divider = '//w:p[w:r/w:t="APPENDICES"]';
            $this->assertSame('center', $xp->evaluate('string('.$divider.'/w:pPr/w:jc/@w:val)'));
            $this->assertSame('76', $xp->evaluate('string('.$divider.'/w:r/w:rPr/w:sz/@w:val)'));
            $this->assertSame('1', $xp->evaluate('string('.$divider.'/w:r/w:rPr/w:b/@w:val)'));
            $this->assertSame('6024', $xp->evaluate('string('.$divider.'/w:pPr/w:spacing/@w:before)'));
            $this->assertSame('exact', $xp->evaluate('string('.$divider.'/w:pPr/w:spacing/@w:lineRule)'));
            $this->assertSame('0', $xp->evaluate('string('.$divider.'/w:pPr/w:ind/@w:left)'));
            $this->assertSame((string) ($sizeRule['value'] * 2), $xp->evaluate('string(//w:p[w:r/w:t="Appendix A"]/w:r/w:rPr/w:sz/@w:val)'));
        }
    }

    public function test_blank_page_breaks_are_collapsed_without_losing_text_or_graphics(): void
    {
        $file = $this->paper('<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>First page text</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Appendix A - Letter</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:sectPr><w:type w:val="oddPage"/></w:sectPr>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertEquals(1, $xp->evaluate('count(//w:br[@w:type="page"])'));
        $this->assertSame('First page text', $xp->evaluate('string(/w:document/w:body/w:p[1]//w:t)'));
        $this->assertEquals(1, $xp->evaluate('count(//w:drawing)'));
        $this->assertSame('nextPage', $xp->evaluate('string(//w:sectPr/w:type/@w:val)'));
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="Appendix A - Letter"]/w:pPr/w:keepNext/@w:val)'));
    }

    public function test_unused_body_spacers_are_removed_but_template_heading_gap_is_respected(): void
    {
        foreach ([[], [['detail' => 'Leave two blank lines after every heading.']]] as $extra) {
            $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Introduction</w:t></w:r></w:p><w:p/><w:p/><w:p><w:r><w:t>Explanation.</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p>');
            (new PaperFormatter)->format($file, array_merge($this->rules(), $extra)); $xp = $this->xml($file);
            $this->assertEquals(4, $xp->evaluate('count(/w:document/w:body/w:p)'));
            $this->assertSame($extra ? '960' : '0', $xp->evaluate('string(//w:p[w:r/w:t="Introduction"]/w:pPr/w:spacing/@w:after)'));
            $this->assertSame('480', $xp->evaluate('string(//w:p[w:r/w:t="Explanation."]/w:pPr/w:spacing/@w:line)'));
            $this->assertEquals(1, $xp->evaluate('count(//w:drawing)'));
        }
    }

    public function test_appendix_label_and_letter_attachment_share_page_without_changing_image_ratio(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Appendix A</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Letter of request to conduct study</w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="5943600" cy="8229600"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:spPr><a:xfrm><a:ext cx="5943600" cy="8229600"/></a:xfrm></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="Appendix A"]//w:br[@w:type="page"])'));
        $this->assertEquals(0, $xp->evaluate('count(//w:p[w:r/w:t="Letter of request to conduct study"]/w:pPr/w:pageBreakBefore)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:p[w:r/w:drawing]/w:pPr/w:pageBreakBefore)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:p[w:r/w:t="Letter of request to conduct study"]//w:br[@w:type="page"])'));
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:t="Letter of request to conduct study"]/w:pPr/w:keepNext/@w:val)'));
        $width = (float) $xp->evaluate('string(//*[local-name()="extent"]/@cx)');
        $height = (float) $xp->evaluate('string(//*[local-name()="extent"]/@cy)');
        $this->assertLessThan(8229600, $height);
        $this->assertSame('1', $xp->evaluate('string(//w:p[w:r/w:drawing]/w:pPr/w:keepLines/@w:val)'));
        $this->assertSame('auto', $xp->evaluate('string(//w:p[w:r/w:drawing]/w:pPr/w:spacing/@w:lineRule)'));
        $this->assertLessThan(9 * 914400, $height + 1392 * 635);
        $this->assertEqualsWithDelta(5943600 / 8229600, $width / $height, .00001);
    }

    public function test_appendix_titles_follow_selected_template_without_changing_contents_entries_or_content(): void
    {
        foreach (['Permission Letter', 'Institution Approval'] as $expected) {
            $rules = array_merge($this->rules(), [['detail' => 'Appendix A - '.$expected.': signed attachment.']]);
            $file = $this->paper('<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t>Appendix A - Old title</w:t></w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Appendix A - Wrong heading</w:t></w:r></w:p><w:p><w:r><w:t>Original attachment content.</w:t></w:r></w:p>');
            $formatter = new PaperFormatter;
            $attention = (new PaperAttentionMarker)->mark($file, $formatter->settings($rules));
            $this->assertSame('appendix-title', $attention['issues'][0]['type']);
            $this->assertNotEmpty($attention['issues'][0]['anchor']);
            $formatter->format($file, $rules); $xp = $this->xml($file);
            $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="Appendix A - '.$expected.'"])'));
            $this->assertSame('Original attachment content.', $xp->evaluate('string(//w:p[w:r/w:t="Original attachment content."]//w:t)'));
            $this->assertSame('Appendix A - Old title', $xp->evaluate('string(//w:p[w:pPr/w:pStyle[@w:val="TOC1"]]//w:t)'));
        }
        $cfg = (new PaperFormatter)->settings([['detail' => 'Appendix G - Statistical Analysis: certificate.'], ['detail' => 'Appendix G - Qualitative Analysis: alternative certificate.']]);
        $this->assertNull($cfg['appendix_titles']['G']);
    }

    public function test_separate_appendix_title_line_is_corrected_using_admin_rule(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>Appendix A</w:t></w:r></w:p><w:p><w:r><w:t>Old letter title</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p>');
        (new PaperFormatter)->format($file, [['detail' => 'Appendix A - Permission/Approval Letter: scanned and signed attachment.']]); $xp = $this->xml($file);
        $this->assertSame('Appendix A', $xp->evaluate('string(/w:document/w:body/w:p[1]//w:t)'));
        $this->assertSame('Permission/Approval Letter', $xp->evaluate('string(/w:document/w:body/w:p[2]//w:t)'));
        $this->assertEquals(1, $xp->evaluate('count(//w:drawing)'));
    }

    public function test_old_separate_appendix_title_is_replaced_instead_of_adding_another_title(): void
    {
        foreach (['Appendix D - Certificate of Validation', 'Appendix D - Wrong title'] as $label) {
            $file = $this->paper('<w:p><w:r><w:t>'.$label.'</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Research Ethics </w:t></w:r><w:r><w:t>Clearance</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p>');
            $rules = [['detail' => 'Appendix D - Certificate of Validation: scanned and signed validation form.']];
            $formatter = new PaperFormatter;
            $attention = (new PaperAttentionMarker)->mark($file, $formatter->settings($rules));
            $this->assertSame('appendix-title', $attention['issues'][0]['type']);
            $this->assertSame(2, $attention['issues'][0]['paragraph']);
            $formatter->format($file, $rules); $xp = $this->xml($file);
            $this->assertSame('Appendix D', $xp->evaluate('string(/w:document/w:body/w:p[1]//w:t)'));
            $this->assertSame('Certificate of Validation', $xp->evaluate('string(/w:document/w:body/w:p[2]//w:t)'));
            $this->assertStringNotContainsString('Research Ethics', $xp->evaluate('string(/w:document/w:body)'));
            $this->assertEquals(3, $xp->evaluate('count(/w:document/w:body/w:p)'));
            $this->assertEquals(1, $xp->evaluate('count(//w:drawing)'));
            $formatter->format($file, $rules); $xp = $this->xml($file);
            $this->assertSame('Certificate of Validation', $xp->evaluate('string(/w:document/w:body/w:p[2]//w:t)'));
        }
    }

    public function test_appendix_title_is_replaced_when_it_shares_an_image_paragraph_or_table(): void
    {
        $inline = '<w:p><w:r><w:t>Research Ethics Clearance</w:t><w:br/><w:drawing/></w:r></w:p>';
        $table = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Research Ethics Clearance</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p></w:tc></w:tr></w:tbl>';
        foreach ([$inline, $table] as $attachment) {
            $file = $this->paper('<w:p><w:r><w:t>Appendix D - Certificate of Validation</w:t></w:r></w:p>'.$attachment);
            $rules = [['detail' => 'Appendix D - Certificate of Validation: scanned signed form.']];
            $formatter = new PaperFormatter;
            $attention = (new PaperAttentionMarker)->mark($file, $formatter->settings($rules));
            $this->assertSame('appendix-title', $attention['issues'][0]['type']);
            $this->assertSame(2, $attention['issues'][0]['paragraph']);
            $formatter->format($file, $rules); $xp = $this->xml($file);
            $this->assertSame('Appendix D', $xp->evaluate('string(/w:document/w:body/w:p[1]//w:t)'));
            $this->assertEquals(1, $xp->evaluate('count(//w:t[text()="Certificate of Validation"])'));
            $this->assertEquals(0, $xp->evaluate('count(//w:t[contains(text(),"Research Ethics")])'));
            $this->assertEquals(1, $xp->evaluate('count(//w:drawing)'));
        }
    }

    public function test_floating_appendix_scans_flow_below_titles_without_changing_picture_content(): void
    {
        $picture = '<w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="2000000" cy="3000000"/><wp:docPr id="1" name="scan"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>';
        $file = $this->paper('<w:p><w:r><w:t>Body illustration</w:t>'.$picture.'</w:r></w:p><w:p><w:r><w:t>APPENDICES</w:t></w:r></w:p><w:p><w:r><w:t>Appendix F</w:t></w:r></w:p><w:p><w:r><w:t>Attachment heading</w:t></w:r><w:r>'.$picture.'</w:r></w:p><w:p><w:r><w:t>Appendix G</w:t></w:r></w:p><w:p><w:r>'.$picture.'</w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertEquals(2, $xp->evaluate('count(//*[local-name()="inline"])'));
        $this->assertEquals(1, $xp->evaluate('count(//*[local-name()="anchor"])'));
        $this->assertEquals(3, $xp->evaluate('count(//*[local-name()="blip"]/@*[local-name()="embed"])'));
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="Attachment heading"]/w:r/w:br[not(@w:type="page")])'));
        $this->assertEquals(0, $xp->evaluate('count(//*[local-name()="inline"]/*[local-name()="positionV"])'));
    }

    public function test_known_cv_title_uses_its_template_letter_instead_of_becoming_documentation(): void
    {
        foreach (['K', 'M'] as $expectedLetter) {
            $rules = array_merge($this->rules(), [['detail' => 'Appendix I - Documentation: research pictures.'], ['detail' => 'Appendix '.$expectedLetter.' - Curriculum Vitae: a 1.5 by 1.5 inch picture, maximum of one (1) page per author.']]);
            $file = $this->paper('<w:p><w:r><w:t>Appendix I</w:t></w:r></w:p><w:p><w:r><w:t>Curriculum Vitae</w:t><w:drawing/></w:r></w:p><w:p><w:r><w:t>PERSONAL INFORMATION</w:t></w:r></w:p><w:p><w:r><w:t>Researcher Signature: ______</w:t></w:r></w:p>');
            $formatter = new PaperFormatter;
            $attention = (new PaperAttentionMarker)->mark($file, $formatter->settings($rules));
            $this->assertStringContainsString('Appendix '.$expectedLetter, $attention['issues'][0]['message']);
            $formatter->format($file, $rules); $xp = $this->xml($file);
            $this->assertSame('Appendix '.$expectedLetter, $xp->evaluate('string(/w:document/w:body/w:p[1]//w:t)'));
            $this->assertSame('Curriculum Vitae', $xp->evaluate('string(/w:document/w:body/w:p[2]//w:t)'));
            $this->assertSame('Researcher Signature: ______', $xp->evaluate('string(//w:p[w:r/w:t="Researcher Signature: ______"]//w:t)'));
        }
    }

    public function test_rechecking_fixed_paper_does_not_flag_graphic_layout_as_body_spacing(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:line="240"/></w:pPr><w:r><w:t>Body text.</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:line="240"/></w:pPr><w:r><w:drawing/><w:t>Graphic label</w:t></w:r></w:p><w:p><w:r><w:pict><w:txbxContent><w:p><w:pPr><w:spacing w:line="240"/></w:pPr><w:r><w:t>Drawing label</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>');
        $formatter = new PaperFormatter;
        $before = (new PaperAttentionMarker)->mark($file, $formatter->settings($this->rules()));
        $this->assertCount(1, $before['issues']);
        $this->assertSame('spacing', $before['issues'][0]['type']);
        $formatter->format($file, $this->rules());
        $after = (new PaperAttentionMarker)->mark($file, $formatter->settings($this->rules()));
        $this->assertCount(0, $after['issues']);
    }

    public function test_fixed_copy_clears_source_and_style_highlights_without_affecting_attention_marks(): void
    {
        $file = $this->paper('<w:p><w:pPr><w:spacing w:line="240"/><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:pPr><w:r><w:rPr><w:highlight w:val="yellow"/><w:b/></w:rPr><w:t>Research text</w:t></w:r></w:p>');
        $zip = new ZipArchive; $zip->open($file);
        $zip->addFromString('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:style></w:styles>'); $zip->close();
        $formatter = new PaperFormatter;
        $attention = (new PaperAttentionMarker)->mark($file, $formatter->settings($this->rules()));
        $marked = tempnam(sys_get_temp_dir(), 'attention_clean_test_'); $this->files[] = $marked;
        file_put_contents($marked, base64_decode($attention['document_base64']));
        $this->assertGreaterThan(0, $this->xml($marked)->evaluate('count(//w:highlight[@w:val="yellow"])'));
        $formatter->format($file, $this->rules()); $xp = $this->xml($file);
        $this->assertEquals(0, $xp->evaluate('count(//w:highlight)'));
        $this->assertEquals(1, $xp->evaluate('count(//w:b)'));
        $this->assertSame('Research text', $xp->evaluate('string(//w:t)'));
        $zip->open($file); $styles = $zip->getFromName('word/styles.xml'); $zip->close();
        $this->assertStringNotContainsString('w:highlight', $styles);
        $this->assertGreaterThan(0, $this->xml($marked)->evaluate('count(//w:highlight[@w:val="yellow"])'));
    }

    public function test_references_title_matches_appendices_divider_and_entries_start_on_next_page(): void
    {
        $file = $this->paper('<w:p><w:r><w:t>Previous chapter text.</w:t></w:r></w:p><w:p><w:r><w:t>References</w:t></w:r></w:p><w:p><w:r><w:t>Author (2025). Research source.</w:t></w:r></w:p><w:p><w:r><w:t>Appendices</w:t></w:r></w:p><w:p><w:r><w:t>Appendix A</w:t></w:r></w:p>');
        (new PaperFormatter)->format($file, $this->rules()); $xp = $this->xml($file);
        foreach (['REFERENCES', 'APPENDICES'] as $word) {
            $p = '//w:p[w:r/w:t="'.$word.'"]';
            $this->assertSame('76', $xp->evaluate('string('.$p.'/w:r/w:rPr/w:sz/@w:val)'));
            $this->assertSame('1', $xp->evaluate('string('.$p.'/w:r/w:rPr/w:b/@w:val)'));
            $this->assertSame('center', $xp->evaluate('string('.$p.'/w:pPr/w:jc/@w:val)'));
            $this->assertSame('6024', $xp->evaluate('string('.$p.'/w:pPr/w:spacing/@w:before)'));
            $this->assertSame('0', $xp->evaluate('string('.$p.'/w:pPr/w:keepNext/@w:val)'));
            $this->assertEquals(1, $xp->evaluate('count('.$p.'//w:br[@w:type="page"])'));
        }
        $this->assertEquals(1, $xp->evaluate('count(//w:p[w:r/w:t="Author (2025). Research source."]//w:br[@w:type="page"])'));
        $this->assertSame('24', $xp->evaluate('string(//w:p[w:r/w:t="Author (2025). Research source."]/w:r/w:rPr/w:sz/@w:val)'));
    }

    public function test_reference_document_dividers_have_separate_centered_pages(): void
    {
        $body = '<w:p><w:r><w:t>Previous chapter text.</w:t></w:r></w:p>';
        foreach (['REFERENCES', 'APPENDICES'] as $word) {
            $body .= '<w:p><w:r><w:rPr><w:b/><w:sz w:val="76"/></w:rPr><w:t>'.$word.'</w:t></w:r></w:p><w:p><w:r><w:t>Content after '.$word.'</w:t></w:r></w:p>';
        }
        $reference = $this->paper($body);
        $student = $this->paper($body);
        (new PaperFormatter)->formatUsingReference($student, $reference);
        $xp = $this->xml($student);
        foreach (['REFERENCES', 'APPENDICES'] as $word) {
            $p = '//w:p[w:r/w:t="'.$word.'"]';
            $this->assertSame('center', $xp->evaluate('string('.$p.'/w:pPr/w:jc/@w:val)'));
            $this->assertEquals(1, $xp->evaluate('count('.$p.'//w:br[@w:type="page"])'));
            $this->assertEquals(1, $xp->evaluate('count('.$p.'/following-sibling::w:p[1]//w:br[@w:type="page"])'));
            $this->assertGreaterThan(0, (int) $xp->evaluate('string('.$p.'/w:pPr/w:spacing/@w:before)'));
        }
    }

    public function test_fixed_paper_removes_old_system_notes_and_verification_adds_no_marks(): void
    {
        $file = $this->paper('<w:p><w:pPr><w:spacing w:line="240"/></w:pPr><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Research text.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>Needs attention: Line spacing requires 2.</w:t></w:r></w:p>');
        $formatter = new PaperFormatter; $formatter->format($file, $this->rules());
        $hash = hash_file('sha256', $file);
        $verified = (new PaperAttentionMarker)->mark($file, $formatter->settings($this->rules()), [], false);
        $this->assertSame([], $verified['issues']);
        $this->assertArrayNotHasKey('document_base64', $verified);
        $this->assertSame($hash, hash_file('sha256', $file));
        $xp = $this->xml($file);
        $this->assertSame('Research text.', $xp->evaluate('string(//w:t)'));
        $this->assertEquals(1, $xp->evaluate('count(//w:p)'));
        $this->assertEquals(0, $xp->evaluate('count(//w:highlight | //w:color[@w:val="FF0000"])'));
    }

}
