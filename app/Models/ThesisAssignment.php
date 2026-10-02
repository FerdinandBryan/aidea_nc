<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class ThesisAssignment extends Model
{
    protected $fillable = [
        'thesis_submission_id',
        'title',
        'student_name',
        'payment_id',
        'reviewer_id',
        'note',
        'file_label',
        'file_path',
        'files',
        'reviewed_file_path',
        'reviewed_files',
        'comments_file_path',
        'status',
    ];

    protected $appends = ['file_url', 'file_items', 'reviewed_file_url', 'reviewed_file_urls', 'comments_file_url'];

    protected $casts = [
        'reviewed_files' => 'array',
        'files' => 'array',
    ];

    public function thesis()
    {
        return $this->belongsTo(ThesisSubmission::class, 'thesis_submission_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function getReviewedFileUrlsAttribute()
    {
        $paths = $this->reviewed_files ?: ($this->reviewed_file_path ? [$this->reviewed_file_path] : []);

        return array_values(array_map(function ($p) {
            return Storage::disk('public')->url($p);
        }, $paths));
    }

    public function getCommentsFileUrlAttribute()
    {
        return $this->comments_file_path ? Storage::disk('public')->url($this->comments_file_path) : null;
    }

    public function getFileItemsAttribute()
    {
        $items = $this->files ?: [];
        if (!$items && $this->file_path) {
            $items = [['path' => $this->file_path, 'label' => $this->file_label]];
        }

        return array_values(array_map(function ($i) {
            return ['url' => Storage::disk('public')->url($i['path']), 'label' => $i['label'] ?? null];
        }, $items));
    }

    public function getFileUrlAttribute()
    {
        return $this->file_path ? Storage::disk('public')->url($this->file_path) : null;
    }

    public function getReviewedFileUrlAttribute()
    {
        return $this->reviewed_file_path ? Storage::disk('public')->url($this->reviewed_file_path) : null;
    }
}