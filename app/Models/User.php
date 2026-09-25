<?php

// app/Models/User.php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Notifications\Notifiable;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;


class User extends Authenticatable implements MustVerifyEmail
{
    use \App\Models\Concerns\HasAvatar;

    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'fname',
        'lname',
        'mi',
        'email',
        'password_hash',
        'is_verified',
        'is_admin',
        'email_verified_at',
        'role',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'is_verified' => 'boolean',
        'is_admin' => 'boolean',
        'email_verified_at' => 'datetime',
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