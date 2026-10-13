<?php
namespace Tests\Unit;
use App\Services\ChecklistStructureReview;
use PHPUnit\Framework\TestCase;
class ChecklistStructureReviewTest extends TestCase
{
    public function test_missing_heading_toc_and_explicit_order_are_checked_against_admin_rules(): void
    {
        $paragraphs=[['paragraph'=>1,'text'=>'ABSTRACT','toc'=>true],['paragraph'=>2,'text'=>'REFERENCES'],['paragraph'=>3,'text'=>'APPENDICES']];
        $rules=[['detail'=>'The manuscript has the required ABSTRACT.'],['detail'=>'The manuscript has the required REFERENCES.'],['detail'=>'"APPENDICES" must appear before "REFERENCES".'],['type'=>'Optional','detail'=>'The manuscript must include OPTIONAL SECTION.']];
        $findings=array_map(fn($i)=>['rule_index'=>$i,'status'=>'manual','paragraph'=>0,'explanation'=>'Pending'],range(0,3));
        $result=(new ChecklistStructureReview)->apply($paragraphs,$rules,$findings);
        $this->assertSame(['fail','pass','fail','manual'],array_column($result,'status'));
        $this->assertSame('missing_section',$result[0]['issue_kind']);
        $this->assertSame(0,$result[0]['paragraph']);
        $this->assertSame('misplaced_section',$result[2]['issue_kind']);
        $this->assertSame(3,$result[2]['paragraph']);
        $rules[2]['detail']='"APPENDICES" must appear after "REFERENCES".';
        $this->assertSame('pass',(new ChecklistStructureReview)->apply($paragraphs,$rules,$findings)[2]['status']);
    }
    public function test_new_template_headings_are_dynamic_and_length_is_not_assumed(): void
    {
        $rules=[['detail'=>'The manuscript must include CUSTOM SECTION.'],['detail'=>'The manuscript has the required ACKNOWLEDGEMENT. Maximum of 2 pages.']];
        $findings=[['rule_index'=>0,'status'=>'manual'],['rule_index'=>1,'status'=>'pass']];
        $result=(new ChecklistStructureReview)->apply([['paragraph'=>5,'text'=>'CUSTOM SECTION'],['paragraph'=>6,'text'=>'ACKNOWLEDGEMENT']],$rules,$findings);
        $this->assertSame('pass',$result[0]['status']);
        $this->assertSame('manual',$result[1]['status']);
    }
}
