<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('thesis_assignments', function (Blueprint $table) {
            if (!Schema::hasColumn('thesis_assignments', 'title')) {
                $table->string('title')->nullable();
            }
            if (!Schema::hasColumn('thesis_assignments', 'student_name')) {
                $table->string('student_name')->nullable();
            }
        });
        Schema::table('thesis_assignments', function (Blueprint $table) {
            $table->unsignedBigInteger('thesis_submission_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('thesis_assignments', function (Blueprint $table) {
            $table->dropColumn(['title', 'student_name']);
        });
    }
};
