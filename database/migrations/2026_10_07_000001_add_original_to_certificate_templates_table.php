<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('certificate_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('certificate_templates', 'original_path')) {
                $table->string('original_path')->nullable();
            }
            if (!Schema::hasColumn('certificate_templates', 'original_name')) {
                $table->string('original_name')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('certificate_templates', function (Blueprint $table) {
            if (Schema::hasColumn('certificate_templates', 'original_path')) { $table->dropColumn('original_path'); }
            if (Schema::hasColumn('certificate_templates', 'original_name')) { $table->dropColumn('original_name'); }
        });
    }
};