<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PriceAuditLog extends Model
{
    protected $fillable = [
        'service',
        'oldPrice',
        'newPrice',
        'by',
        'reason',
        'datetime',
    ];
}
