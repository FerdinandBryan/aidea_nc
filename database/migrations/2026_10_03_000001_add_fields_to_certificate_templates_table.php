<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('certificate_templates', 'fields')) {
            Schema::table('certificate_templates', function (Blueprint $table) {
                $table->longText('fields')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('certificate_templates', 'fields')) {
            Schema::table('certificate_templates', function (Blueprint $table) {
                $table->dropColumn('fields');
            });
        }
    }
};