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
            ['email' => 'admin@norzagaray.edu.ph'],
            [
                'student_number' => 'ADMIN-001',
                'full_name' => 'AIDEA Administrator',
                'email' => 'admin_norzagaray@gmail.com',
                'password_hash' => Hash::make('Admin@AIDEA2025'),
                'role' => 'admin',
                'is_verified' => 1,
            ]
        );
    }
}