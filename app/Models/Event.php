<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Event extends Model
{
    protected $fillable = ['title', 'location', 'starts_at'];

    protected $casts = [
        'starts_at' => 'datetime',
    ];
}
