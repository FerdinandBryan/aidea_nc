<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('thesis_assignments', function (Blueprint $table) {
            if (!Schema::hasColumn('thesis_assignments', 'payment_id')) {
                $table->string('payment_id', 64)->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('thesis_assignments', function (Blueprint $table) {
            $table->dropColumn('payment_id');
        });
    }
};