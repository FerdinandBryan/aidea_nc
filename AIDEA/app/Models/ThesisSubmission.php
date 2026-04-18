<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ThesisSubmission extends Model
{
    protected $fillable = [
        'user_id',
        'title',
        'course',
        'academic_year',
        'abstract',
        'adviser_name',
        'submission_type',
        'authors',
        'file_path',
        'original_filename',
        'file_size',
        'file_type',
        'status',
        'remarks',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}