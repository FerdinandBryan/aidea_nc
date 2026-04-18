<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

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
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'active' => 'boolean',
        'is_qr_valid' => 'boolean',
    ];
}