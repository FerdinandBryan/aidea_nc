<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->boolean('visible_in_repo')->default(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->boolean('visible_in_repo')->default(true)->change();
        });
    }
};