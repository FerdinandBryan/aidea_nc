<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->boolean('visible_in_repo')->default(true);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('thesis_submissions', function (Blueprint $table) {
            $table->dropColumn('visible_in_repo');
        });
    }
};
