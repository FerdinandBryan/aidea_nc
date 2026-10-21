<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')->where(function ($query) {
            $query->whereNull('full_name')->orWhere('full_name', '');
        })->orderBy('id')->chunkById(100, function ($users) {
            foreach ($users as $user) {
                $name = implode(' ', array_filter(array_map(
                    fn ($part) => trim((string) $part),
                    [$user->fname, $user->mi, $user->lname]
                ), fn ($part) => $part !== ''));

                if ($name !== '') {
                    DB::table('users')->where('id', $user->id)->update(['full_name' => $name]);
                }
            }
        });
    }

    public function down(): void
    {
        // Preserve names when rolling back.
    }
};
