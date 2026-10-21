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
            $table->string('role', 30)->nullable()->default(null)->change();
        });

        // Student accounts use a null role; named roles identify staff/reviewers.
        DB::table('users')->where('is_admin', false)->where('role', 'student')
            ->update(['role' => null]);
    }

    public function down(): void
    {
        // Preserve reviewer roles that the original enum could not represent.
    }
};
