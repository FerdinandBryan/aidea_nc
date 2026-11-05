<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('format_template_reference_chunks')) return;

        Schema::create('format_template_reference_chunks', function (Blueprint $table) {
            $table->string('template_id', 120);
            $table->unsignedInteger('chunk_index');
            $table->longText('chunk_data');
            $table->char('sha256', 64);
            $table->unsignedBigInteger('file_size');
            $table->primary(['template_id', 'chunk_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('format_template_reference_chunks');
    }
};