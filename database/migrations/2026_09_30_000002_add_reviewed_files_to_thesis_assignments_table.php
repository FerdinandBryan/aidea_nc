<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('thesis_assignments', function (Blueprint $table) {
            if (!Schema::hasColumn('thesis_assignments', 'reviewed_files')) {
                $table->json('reviewed_files')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('thesis_assignments', function (Blueprint $table) {
            $table->dropColumn('reviewed_files');
        });
    }
};