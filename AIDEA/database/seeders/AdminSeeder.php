<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin_norzagaray@gmail.com'],
            [
                'fname' => 'AIDEA',
                'lname' => 'Administrator',
                'mi' => null,
                'password_hash' => Hash::make('Admin@AIDEA2026'),
                'is_verified' => 1,
                'is_admin' => 1,
            ]
        );
    }
}