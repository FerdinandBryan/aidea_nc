<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = config('admin.email');
        if (User::where('email', $email)->exists()) {
            return;
        }

        $password = config('admin.initial_password');
        if (!$password) {
            throw new \RuntimeException('Set ADMIN_INITIAL_PASSWORD before creating the initial administrator.');
        }

        User::firstOrCreate(
            ['email' => $email],
            [
                'fname' => 'AIDEA',
                'lname' => 'Administrator',
                'mi' => null,
                'password_hash' => Hash::make($password),
                'is_verified' => 1,
                'is_admin' => 1,
                'email_verified_at' => now(),
                'role' => 'admin',
            ]
        );
    }
}
