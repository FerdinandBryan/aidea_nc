<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'fname')) {
                $table->string('fname', 75)->nullable();
            }
            if (!Schema::hasColumn('users', 'lname')) {
                $table->string('lname', 75)->nullable();
            }
            if (!Schema::hasColumn('users', 'mi')) {
                $table->string('mi', 5)->nullable();
            }
            if (!Schema::hasColumn('users', 'is_admin')) {
                $table->boolean('is_admin')->default(false);
            }
            $table->string('full_name')->nullable()->change();
        });

        DB::table('users')->where('role', 'admin')->update(['is_admin' => true]);
    }

    public function down(): void
    {
        // Keep account fields and data when rolling back.
    }
};
