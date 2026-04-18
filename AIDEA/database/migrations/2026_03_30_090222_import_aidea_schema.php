<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('student_number')->unique()->nullable();
            $table->string('full_name');
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->enum('role', ['admin', 'staff', 'student', 'guest'])->default('student');
            $table->string('course')->nullable();
            $table->string('year_level')->nullable();
            $table->string('section')->nullable();
            $table->tinyInteger('is_verified')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};