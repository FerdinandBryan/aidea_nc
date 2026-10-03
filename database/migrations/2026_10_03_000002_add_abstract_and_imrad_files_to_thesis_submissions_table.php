<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->string('abstract_file_path')->nullable();
            $table->string('imrad_file_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->dropColumn(['abstract_file_path', 'imrad_file_path']);
        });
    }
};