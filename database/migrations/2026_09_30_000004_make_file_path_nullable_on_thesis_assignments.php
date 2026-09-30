<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE thesis_assignments MODIFY file_path VARCHAR(255) NULL');
    }

    public function down(): void
    {
        // Intentionally empty: rows without a file can't go back to NOT NULL.
    }
};