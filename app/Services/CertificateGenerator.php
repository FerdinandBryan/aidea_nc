<?php

namespace App\Services;

use PhpOffice\PhpWord\Settings;
use PhpOffice\PhpWord\TemplateProcessor;

class CertificateGenerator
{
    /**
     * Fill a .docx template. Every ${TAG} in the file is replaced
     * if $values has a matching key; unknown tags are left untouched.
     * Returns the path of the filled temporary .docx.
     */
    public function fill(string $templatePath, array $values): string
    {
        Settings::setOutputEscapingEnabled(true);

        $tp = new TemplateProcessor($templatePath);
        foreach ($tp->getVariables() as $name) {
            if (array_key_exists($name, $values)) {
                $tp->setValue($name, (string) $values[$name]);
            }
        }

        $out = tempnam(sys_get_temp_dir(), 'cert_') . '.docx';
        $tp->saveAs($out);
        return $out;
    }
}