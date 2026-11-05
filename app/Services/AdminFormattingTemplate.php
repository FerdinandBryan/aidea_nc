<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminFormattingTemplate
{
    public function load(string $id): array
    {
        $row = DB::table('format_templates')->orderBy('id')->first();
        $list = $row ? json_decode($row->data, true) : [];
        $items = is_array($list) ? $list : [];
        $template = collect($items)->first(fn ($item) =>
            is_array($item) && (string) ($item['id'] ?? '') === (string) $id);

        if (!$template || empty($template['active'])) {
            throw ValidationException::withMessages(['template_id' => 'Select an active format template saved by the admin.']);
        }
        if (array_key_exists('rules', $template) && !is_array($template['rules'])) throw ValidationException::withMessages(['template_id' => 'The admin template has invalid formatting rules.']);
        $rules = is_array($template['rules'] ?? null) ? $template['rules'] : [];
        $formatting = $template['formatting'] ?? [];
        if (!is_array($formatting)) throw ValidationException::withMessages(['template_id' => 'The admin template has invalid formatting settings.']);
        $types = ['font' => 'font', 'font_size' => 'size', 'line_spacing' => 'spacing',
            'abstract_spacing' => 'abstract-spacing', 'margins' => 'margin',
            'alignment' => 'alignment', 'first_line_indent' => 'indentation', 'paper_size' => 'paper'];
        foreach ($formatting as $name => $value) {
            if (!isset($types[$name])) throw ValidationException::withMessages(['template_id' => 'Unknown admin formatting setting: '.$name]);
            if ($value === null || $value === '') continue;
            if (in_array($name, ['font_size', 'line_spacing', 'abstract_spacing', 'first_line_indent'], true) && !is_numeric($value)) throw ValidationException::withMessages(['template_id' => 'Admin setting '.$name.' must be a number.']);
            if (in_array($name, ['font', 'alignment', 'paper_size'], true) && !is_string($value)) throw ValidationException::withMessages(['template_id' => 'Admin setting '.$name.' must be text.']);
            if ($name === 'alignment' && !in_array(strtolower(trim($value)), ['left', 'right', 'center', 'both', 'justify', 'justified'], true)) throw ValidationException::withMessages(['template_id' => 'The admin template alignment is invalid.']);
            if ($name === 'margins') {
                if (!is_array($value)) throw ValidationException::withMessages(['template_id' => 'Admin margins must specify top, bottom, left and right in inches.']);
                foreach ($value as $side => $inch) if (!in_array($side, ['top', 'bottom', 'left', 'right'], true) || !is_numeric($inch)) throw ValidationException::withMessages(['template_id' => 'The admin template margins are invalid.']);
            }
            $rules[] = ['name' => 'Admin setting: '.$name, 'type' => $types[$name], 'value' => $value];
        }
        $template['effective_rules'] = $rules;
        $referenceHash = $this->hasDeclaredReference($template) ? $this->referenceHash($id) : null;
        $template['revision'] = hash('sha256', json_encode([
            'rules' => $rules,
            'reference' => $referenceHash,
        ], JSON_UNESCAPED_UNICODE));
        return $template;
    }

    public function referenceStoragePath(string $id): string
    {
        return storage_path('app/private/format-templates/'.hash('sha256', $id).'.docx');
    }

    public function referencePath(string $id): ?string
    {
        $path = $this->referenceStoragePath($id);
        $metadata = DB::table('format_template_reference_chunks')
            ->where('template_id', $id)->orderBy('chunk_index')->first(['sha256', 'file_size']);
        if (!$metadata) return is_file($path) ? $path : null;
        if (is_file($path) && hash_file('sha256', $path) === $metadata->sha256) return $path;

        $directory = dirname($path);
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new \RuntimeException('Could not create the private template cache directory.');
        }
        $temporary = $path.'.'.bin2hex(random_bytes(6)).'.tmp';
        $handle = fopen($temporary, 'wb');
        if ($handle === false) throw new \RuntimeException('Could not prepare the admin reference template.');
        $hash = hash_init('sha256'); $size = 0;
        try {
            DB::table('format_template_reference_chunks')->where('template_id', $id)->orderBy('chunk_index')
                ->chunk(16, function ($chunks) use ($handle, $hash, &$size) {
                    foreach ($chunks as $chunk) {
                        $contents = base64_decode($chunk->chunk_data, true);
                        if ($contents === false) throw new \RuntimeException('The stored admin reference template is corrupted.');
                        $length = strlen($contents); $written = 0;
                        while ($written < $length) {
                            $count = fwrite($handle, substr($contents, $written));
                            if ($count === false || $count === 0) throw new \RuntimeException('Could not restore the admin reference template.');
                            $written += $count;
                        }
                        hash_update($hash, $contents); $size += $length;
                    }
                });
            if (!fflush($handle)) throw new \RuntimeException('Could not restore the admin reference template.');
        } catch (\Throwable $e) {
            fclose($handle); @unlink($temporary); throw $e;
        }
        fclose($handle);
        if ($size !== (int) $metadata->file_size || hash_final($hash) !== $metadata->sha256) {
            @unlink($temporary);
            throw new \RuntimeException('The stored admin reference template failed integrity verification.');
        }
        @unlink($path);
        if (!rename($temporary, $path)) { @unlink($temporary); throw new \RuntimeException('Could not cache the admin reference template.'); }
        @chmod($path, 0600);
        return $path;
    }

    public function saveReference(string $id, string $sourcePath): void
    {
        $size = filesize($sourcePath);
        $hash = hash_file('sha256', $sourcePath);
        if ($size === false || $hash === false || $size > 50 * 1024 * 1024) {
            throw new \RuntimeException('The admin reference template exceeds the 50 MB limit.');
        }
        $source = fopen($sourcePath, 'rb');
        if ($source === false) throw new \RuntimeException('Could not read the admin reference template.');
        try {
            DB::transaction(function () use ($id, $source, $hash, $size) {
                DB::table('format_template_reference_chunks')->where('template_id', $id)->delete();
                $index = 0;
                while (!feof($source)) {
                    $contents = fread($source, 512 * 1024);
                    if ($contents === false) throw new \RuntimeException('Could not read the admin reference template.');
                    if ($contents === '') break;
                    DB::table('format_template_reference_chunks')->insert([
                        'template_id' => $id,
                        'chunk_index' => $index++,
                        'chunk_data' => base64_encode($contents),
                        'sha256' => $hash,
                        'file_size' => $size,
                    ]);
                }
            });
        } finally { fclose($source); }
        $path = $this->referenceStoragePath($id);
        $directory = dirname($path);
        if (!is_dir($directory)) @mkdir($directory, 0700, true);
        if (is_dir($directory) && @copy($sourcePath, $path)) @chmod($path, 0600);
    }

    public function referenceHash(string $id): ?string
    {
        $metadata = DB::table('format_template_reference_chunks')
            ->where('template_id', $id)->orderBy('chunk_index')->first(['sha256']);
        if ($metadata) return $metadata->sha256;
        $path = $this->referenceStoragePath($id);
        return is_file($path) ? hash_file('sha256', $path) : null;
    }

    public function hasDeclaredReference(array $template): bool
    {
        $file = $template['file'] ?? null;
        $name = is_array($file) ? (string) ($file['name'] ?? '') : '';
        return strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'docx';
    }

    public function hasMissingDeclaredReference(array $template, string $id): bool
    {
        return $this->hasDeclaredReference($template) && $this->referenceHash($id) === null;
    }
}
