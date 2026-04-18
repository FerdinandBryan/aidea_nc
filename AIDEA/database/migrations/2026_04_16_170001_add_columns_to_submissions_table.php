<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('submissions', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->after('id');
            $table->string('title')->after('user_id');
            $table->enum('status', ['pending', 'under_review', 'approved', 'rejected', 'revision'])
                  ->default('pending')->after('title');
            $table->timestamp('submitted_at')->nullable()->after('status');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('submissions', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropColumn(['user_id', 'title', 'status', 'submitted_at']);
        });
    }
};
