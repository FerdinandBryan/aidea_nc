<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $email = 'leemueljavillonar96@gmail.com';
        if (DB::table('users')->where('email', $email)->exists()) {
            return; // Never reset a password or change an existing account's role.
        }

        // Older installations still have the original role enum and name layout.
        foreach (['fname', 'lname'] as $column) {
            if (!Schema::hasColumn('users', $column)) {
                Schema::table('users', fn (Blueprint $table) => $table->string($column, 75)->nullable());
            }
        }
        if (!Schema::hasColumn('users', 'is_admin')) {
            Schema::table('users', fn (Blueprint $table) => $table->boolean('is_admin')->default(false));
        }
        if (DB::getDriverName() === 'mysql' && Schema::getColumnType('users', 'role') === 'enum') {
            Schema::table('users', fn (Blueprint $table) => $table->string('role', 30)->default('student')->change());
        }

        DB::table('users')->insert([
            'fname' => 'Leemuel',
            'lname' => 'Javillonar',
            'full_name' => 'Leemuel Javillonar',
            'email' => $email,
            'password_hash' => '$2y$12$R82RHw6aD1SQjz35cipcTOAdfuBPRrnZ0wo1AhnGB32x8S4R6SKXu',
            'role' => 'librarian',
            'is_admin' => false,
            'is_verified' => true,
            'email_verified_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // Preserve the account and its documents when rolling back migrations.
    }
};
