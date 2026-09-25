<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->unsignedBigInteger('file_size')->nullable()->after('original_filename');
            $table->string('file_type')->nullable()->after('file_size');
            $table->text('remarks')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->dropColumn(['file_size', 'file_type', 'remarks']);
        });
    }
};
