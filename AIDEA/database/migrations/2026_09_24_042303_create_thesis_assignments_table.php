<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('thesis_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thesis_submission_id')->constrained()->onDelete('cascade');
            $table->foreignId('reviewer_id')->constrained('users')->onDelete('cascade');
            $table->string('file_path');               // copy of the file admin sent
            $table->string('reviewed_file_path')->nullable(); // filled when reviewer sends it back
            $table->enum('status', ['pending', 'completed'])->default('pending');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('thesis_assignments');
    }
};