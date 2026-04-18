<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('service');
            $table->decimal('oldPrice', 10, 2);
            $table->decimal('newPrice', 10, 2);
            $table->string('by')->default('Admin');
            $table->string('reason');
            $table->string('datetime');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_audit_logs');
    }
};
