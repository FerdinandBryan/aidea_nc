<?php

namespace App\Http\Controllers;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Http\Request;
use ZipArchive;

class DocxFormatController extends Controller
{
    private const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    private const MARGIN_LEFT = 2160;
    private const MARGIN_OTHER = 1440;
    private const LINE_DOUBLE = 480;
    private const FONT = 'Times New Roman';
    private const FONT_SIZE_HALF_PT = 24;
    private const SMALL_MARGIN = 720;

    private const PPR_ORDER = [
        'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl',
        'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens',
        'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE',
        'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind',
        'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
        'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr',
        'sectPr', 'pPrChange',
    ];

    private const RPR_ORDER = [
        'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike',
        'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid',
        'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz',
        'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign',
        'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath',
    ];

    public function format(Request $request)
    {
        $request->validate(['file' => 'required|file|max:20480']);
        $upload = $request->file('file');

        if (strtolower($upload->getClientOriginalExtension()) !== 'docx') {
            return response()->json(['error' => 'Only .docx files are supported.'], 422);
        }

        $tmp = tempnam(sys_get_temp_dir(), 'fmt') . '.docx';
        copy($upload->getRealPath(), $tmp);

        try {
            $zip = new ZipArchive();
            if ($zip->open($tmp) !== true) {
                throw new \RuntimeException('Not a valid .docx file.');
            }
            $xml = $zip->getFromName('word/document.xml');
            if ($xml === false) {
                $zip->close();
                throw new \RuntimeException('word/document.xml not found.');
            }

            $zip->addFromString('word/document.xml', $this->formatDocument($xml));
            $zip->close();
        } catch (\Throwable $e) {
            @unlink($tmp);
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $name = pathinfo($upload->getClientOriginalName(), PATHINFO_FILENAME) . '_formatted.docx';
        return response()->download($tmp, $name)->deleteFileAfterSend(true);
    }

    private function formatDocument(string $xml): string
    {
        $dom = new DOMDocument();
        $dom->preserveWhiteSpace = true;
        if (!$dom->loadXML($xml, LIBXML_NONET | LIBXML_PARSEHUGE)) {
            throw new \RuntimeException('Could not parse document.xml.');
        }
        $xp = new DOMXPath($dom);
        $xp->registerNamespace('w', self::W);

        $paras = $xp->query('//w:p[not(ancestor::w:tc) and not(ancestor::w:txbxContent)]');
        $pending = [];
        foreach ($paras as $p) {
            $pending[] = $p;
            $sp = $xp->query('w:pPr/w:sectPr', $p)->item(0);
            if ($sp instanceof DOMElement) {
                $this->flushSection($xp, $sp, $pending);
                $pending = [];
            }
        }
        $final = $xp->query('/w:document/w:body/w:sectPr')->item(0);
        $this->flushSection($xp, $final instanceof DOMElement ? $final : null, $pending);

        foreach ($xp->query('//w:r') as $r) {
            $this->formatRun($r);
        }

        return $dom->saveXML();
    }

    private function flushSection(DOMXPath $xp, ?DOMElement $sectPr, array $paras): void
    {
        $oldL = 1440;
        $oldR = 1440;
        $pgMar = null;

        if ($sectPr) {
            $pgMar = $xp->query('w:pgMar', $sectPr)->item(0);
            if ($pgMar instanceof DOMElement) {
                if ($pgMar->hasAttributeNS(self::W, 'left')) {
                    $oldL = (int) $pgMar->getAttributeNS(self::W, 'left');
                }
                if ($pgMar->hasAttributeNS(self::W, 'right')) {
                    $oldR = (int) $pgMar->getAttributeNS(self::W, 'right');
                }
            }
        }

        foreach ($paras as $p) {
            $this->formatParagraph($xp, $p, $oldL, $oldR);
        }

        if ($sectPr) {
            if (!($pgMar instanceof DOMElement)) {
                $pgMar = $sectPr->ownerDocument->createElementNS(self::W, 'w:pgMar');
                $pgSz = $xp->query('w:pgSz', $sectPr)->item(0);
                if ($pgSz && $pgSz->nextSibling) {
                    $sectPr->insertBefore($pgMar, $pgSz->nextSibling);
                } else {
                    $sectPr->appendChild($pgMar);
                }
            }
            $pgMar->setAttributeNS(self::W, 'w:top', (string) self::MARGIN_OTHER);
            $pgMar->setAttributeNS(self::W, 'w:bottom', (string) self::MARGIN_OTHER);
            $pgMar->setAttributeNS(self::W, 'w:left', (string) self::MARGIN_LEFT);
            $pgMar->setAttributeNS(self::W, 'w:right', (string) self::MARGIN_OTHER);
        }
    }

    private function formatParagraph(DOMXPath $xp, DOMElement $p, int $oldL, int $oldR): void
    {
        $pPr = $this->ensureFirst($p, 'pPr');

        $ind = $this->findChild($pPr, 'ind');
        $compL = $oldL < self::SMALL_MARGIN;
        $compR = $oldR < self::SMALL_MARGIN;
        if ($ind && ($compL || $compR)) {
            if ($compL) {
                $cur = $this->attrInt($ind, ['left', 'start']);
                $this->removeAttrs($ind, ['left', 'start']);
                $ind->setAttributeNS(self::W, 'w:left', (string) max(0, $oldL + $cur - self::MARGIN_LEFT));
            }
            if ($compR) {
                $cur = $this->attrInt($ind, ['right', 'end']);
                $this->removeAttrs($ind, ['right', 'end']);
                $ind->setAttributeNS(self::W, 'w:right', (string) max(0, $oldR + $cur - self::MARGIN_OTHER));
            }
        }

        $hasText = trim($p->textContent) !== '';
        $hasObject = $xp->query('.//w:drawing|.//w:pict', $p)->length > 0;
        if ($hasText || $hasObject) {
            $spacing = $this->ensure($pPr, 'spacing', self::PPR_ORDER);
            $spacing->setAttributeNS(self::W, 'w:line', (string) self::LINE_DOUBLE);
            $spacing->setAttributeNS(self::W, 'w:lineRule', 'auto');
        }
    }

    private function formatRun(DOMElement $r): void
    {
        $rPr = $this->ensureFirst($r, 'rPr');

        if ($old = $this->findChild($rPr, 'rFonts')) {
            $rPr->removeChild($old);
        }
        $fonts = $this->ensure($rPr, 'rFonts', self::RPR_ORDER);
        foreach (['ascii', 'hAnsi', 'cs', 'eastAsia'] as $a) {
            $fonts->setAttributeNS(self::W, 'w:' . $a, self::FONT);
        }

        foreach (['sz', 'szCs'] as $n) {
            $el = $this->ensure($rPr, $n, self::RPR_ORDER);
            $el->setAttributeNS(self::W, 'w:val', (string) self::FONT_SIZE_HALF_PT);
        }
    }

    private function findChild(DOMElement $parent, string $name): ?DOMElement
    {
        foreach ($parent->childNodes as $c) {
            if ($c instanceof DOMElement && $c->localName === $name && $c->namespaceURI === self::W) {
                return $c;
            }
        }
        return null;
    }

    private function ensureFirst(DOMElement $parent, string $name): DOMElement
    {
        if ($el = $this->findChild($parent, $name)) {
            return $el;
        }
        $el = $parent->ownerDocument->createElementNS(self::W, 'w:' . $name);
        $parent->insertBefore($el, $parent->firstChild);
        return $el;
    }

    private function ensure(DOMElement $parent, string $name, array $order): DOMElement
    {
        if ($el = $this->findChild($parent, $name)) {
            return $el;
        }
        $el = $parent->ownerDocument->createElementNS(self::W, 'w:' . $name);
        $following = array_slice($order, (int) array_search($name, $order, true) + 1);
        foreach ($parent->childNodes as $c) {
            if ($c instanceof DOMElement && in_array($c->localName, $following, true)) {
                $parent->insertBefore($el, $c);
                return $el;
            }
        }
        $parent->appendChild($el);
        return $el;
    }

    private function attrInt(DOMElement $el, array $names): int
    {
        foreach ($names as $n) {
            if ($el->hasAttributeNS(self::W, $n)) {
                return (int) $el->getAttributeNS(self::W, $n);
            }
        }
        return 0;
    }

    private function removeAttrs(DOMElement $el, array $names): void
    {
        foreach ($names as $n) {
            $el->removeAttributeNS(self::W, $n);
        }
    }
}