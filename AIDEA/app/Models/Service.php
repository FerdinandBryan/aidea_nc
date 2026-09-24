<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'price',
        'icon',
        'cls',
        'active',
        'gcash_number',
        'gcash_qr',
        'is_qr_valid',
        'requires_research_info',
        'research_requirement_text',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'active' => 'boolean',
        'is_qr_valid' => 'boolean',
        'requires_research_info' => 'boolean',
    ];
}