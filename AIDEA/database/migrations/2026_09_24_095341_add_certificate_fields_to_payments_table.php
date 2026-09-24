<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->string('certificate_url')->nullable();
            $table->string('certificate_name')->nullable();
            $table->string('certificate_type')->nullable(); // 'certificate' | 'files'
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropColumn(['certificate_url', 'certificate_name', 'certificate_type']);
        });
    }
};