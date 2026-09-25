<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique()->nullable();       // auto-generated TXN ref
            $table->string('gcash_ref')->nullable();           // submitted by student
            $table->string('service');
            $table->unsignedBigInteger('service_id')->nullable();
            $table->string('student');
            $table->string('student_id')->nullable();
            $table->string('date')->nullable();                // human-readable "Jan 10, 2025"
            $table->date('date_iso')->nullable();
            $table->decimal('amount', 10, 2);
            $table->string('method')->default('GCash');
            $table->string('status')->default('Pending');      // Pending | Paid | Rejected
            $table->longText('proof_image')->nullable();       // base64 data URI
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};