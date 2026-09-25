<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Storage;

/**
 * Adds profile-photo support to the User model.
 * Requires a nullable "avatar_path" column on the users table.
 */
trait HasAvatar
{
    /** Change to 's3' (or another disk) if you move storage off the local disk. */
    public static function avatarDisk(): string
    {
        return 'public';
    }

    /** Runs automatically when the model boots: never serialize these fields. */
    public function initializeHasAvatar(): void
    {
        $this->makeHidden(['password_hash', 'avatar_path']);
    }

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path
            ? Storage::disk(static::avatarDisk())->url($this->avatar_path)
            : null;
    }
}