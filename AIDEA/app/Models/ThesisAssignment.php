<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class ThesisAssignment extends Model
{
    protected $fillable = [
        'thesis_submission_id',
        'reviewer_id',
        'file_path',
        'reviewed_file_path',
        'status',
    ];

    protected $appends = ['file_url', 'reviewed_file_url'];

    public function thesis()
    {
        return $this->belongsTo(ThesisSubmission::class, 'thesis_submission_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
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