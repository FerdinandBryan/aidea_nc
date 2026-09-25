<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Feedback extends Model
{
    use HasFactory;

    protected $table = 'feedbacks';

    protected $fillable = [
        'user_id', 'feedback_type', 'reference',
        'rating', 'comment', 'recommend', 'is_read',
    ];

    protected $casts = [
        'rating'  => 'integer',
        'is_read' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    public function getStarStringAttribute(): string
    {
        return str_repeat('*', $this->rating) . str_repeat('-', 5 - $this->rating);
    }
}