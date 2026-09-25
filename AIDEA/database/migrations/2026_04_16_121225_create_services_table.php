<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('icon')->default('🛠️');
            $table->text('description')->nullable();
            $table->decimal('price', 10, 2)->default(0);
            $table->string('cls')->default('analysis');
            $table->boolean('active')->default(true);
            $table->string('gcash_number', 11)->nullable();
            $table->longText('gcash_qr')->nullable();   // base64 image
            $table->boolean('is_qr_valid')->default(false); // QR code detected
            $table->timestamps();
        });

        // ── Seed default services ──────────────────────────────
        DB::table('services')->insert([
            [
                'name'         => 'Data Analysis',
                'icon'         => '📊',
                'description'  => 'Comprehensive statistical analysis and data visualization for thesis research.',
                'price'        => 850,
                'cls'          => 'analysis',
                'active'       => true,
                'gcash_number' => null,
                'gcash_qr'     => null,
                'is_qr_valid'  => false,
                'created_at'   => now(),
                'updated_at'   => now(),
            ],
            [
                'name'         => 'Statistician',
                'icon'         => '📐',
                'description'  => 'Expert statistical consultation, hypothesis testing, and interpretation.',
                'price'        => 600,
                'cls'          => 'statistician',
                'active'       => true,
                'gcash_number' => null,
                'gcash_qr'     => null,
                'is_qr_valid'  => false,
                'created_at'   => now(),
                'updated_at'   => now(),
            ],
            [
                'name'         => 'Grammarian',
                'icon'         => '✍️',
                'description'  => 'Full grammar review, proofreading, and academic writing enhancement.',
                'price'        => 500,
                'cls'          => 'grammarian',
                'active'       => true,
                'gcash_number' => null,
                'gcash_qr'     => null,
                'is_qr_valid'  => false,
                'created_at'   => now(),
                'updated_at'   => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};