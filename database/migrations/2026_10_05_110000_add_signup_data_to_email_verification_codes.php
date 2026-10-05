<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('email_verification_codes', 'password_hash')) {
            Schema::table('email_verification_codes', function (Blueprint $table) {
                $table->string('fname', 75)->nullable();
                $table->string('lname', 75)->nullable();
                $table->string('mi', 5)->nullable();
                $table->string('password_hash')->nullable();
            });
        }

        // Remove unconfirmed accounts created by the previous version (pending code, email never confirmed)
        $old = DB::table('email_verification_codes')->whereNull('password_hash')->pluck('email');
        if ($old->isNotEmpty()) {
            DB::table('users')
                ->whereIn('email', $old)
                ->whereNull('email_verified_at')
                ->where('is_admin', 0)
                ->delete();
            DB::table('email_verification_codes')->whereIn('email', $old)->delete();
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('email_verification_codes', 'password_hash')) {
            Schema::table('email_verification_codes', function (Blueprint $table) {
                $table->dropColumn(['fname', 'lname', 'mi', 'password_hash']);
            });
        }
    }
};