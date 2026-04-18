<?php

// app/Models/User.php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    use HasApiTokens;

    protected $fillable = [
        'student_number',
        'full_name',
        'email',
        'password_hash',
        'role',          // 'student' | 'admin'
        'course',
        'year_level',
        'section',
        'is_verified',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'is_verified' => 'boolean',
        'year_level' => 'integer',
    ];

    /*
     * Sanctum / Laravel Auth uses $this->password internally.
     * Our column is password_hash, so we map it here.
     */
    public function getAuthPassword()
    {
        return $this->password_hash;
    }
}