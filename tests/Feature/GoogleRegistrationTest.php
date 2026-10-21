<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleRegistrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.google' => [
            'client_id' => 'test-client', 'client_secret' => 'test-secret',
            'frontend_origin' => 'https://frontend.example',
        ]]);
        Http::preventStrayRequests();
    }

    public function test_configuration_never_exposes_client_secret(): void
    {
        $this->getJson('/api/auth/google/config')->assertOk()->assertExactJson(['client_id' => 'test-client']);
    }

    public function test_untrusted_origin_is_rejected_before_contacting_google(): void
    {
        $this->withHeaders(['Origin' => 'https://attacker.example', 'X-Requested-With' => 'XMLHttpRequest'])
            ->postJson('/api/auth/google/register', ['code' => 'test-code'])->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_rejected_google_code_does_not_create_account(): void
    {
        Http::fake(['oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant'], 400)]);
        $this->withHeaders(['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'])
            ->postJson('/api/auth/google/register', ['code' => 'invalid-code'])->assertStatus(422);
    }

    public function test_unverified_google_email_is_rejected(): void
    {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-access-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => '123', 'email' => 'student@example.com', 'email_verified' => false,
            ]),
        ]);
        $this->withHeaders(['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'])
            ->postJson('/api/auth/google/register', ['code' => 'test-code'])->assertStatus(422)
            ->assertJsonPath('message', 'Please use a Google account with a verified email address.');
    }

    private function createTestDatabase(): void
    {
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        \Illuminate\Support\Facades\DB::purge('sqlite');
        \Illuminate\Support\Facades\Schema::create('users', function ($table) {
            $table->id();
            $table->string('fname');
            $table->string('lname');
            $table->string('mi')->nullable();
            $table->string('full_name')->nullable();
            $table->string('email')->unique();
            $table->timestamp('archived_at')->nullable();
            $table->string('password_hash');
            $table->boolean('is_verified')->default(false);
            $table->boolean('is_admin')->default(false);
            $table->string('role');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamps();
        });
        (require database_path('migrations/2026_10_22_000001_add_google_sub_to_users_table.php'))->up();
        \Illuminate\Support\Facades\Schema::create('personal_access_tokens', function ($table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    public function test_verified_google_account_creates_only_a_student_and_does_not_link_existing_email(): void
    {
        $this->createTestDatabase();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-access-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => '123', 'email' => 'student@example.com', 'email_verified' => true,
                'given_name' => 'Test', 'family_name' => 'Student',
            ]),
        ]);
        $headers = ['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'];
        $this->withHeaders($headers)->postJson('/api/auth/google/register', ['code' => 'test-code', 'role' => 'admin'])
            ->assertCreated()->assertJsonPath('user.role', 'student')->assertJsonPath('user.is_admin', false)
            ->assertJsonMissingPath('user.password_hash')->assertJsonStructure(['token']);
        $this->withHeaders($headers)->postJson('/api/auth/google/register', ['code' => 'other-code'])
            ->assertStatus(409);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_google_sign_in_uses_linked_identity_and_blocks_archived_accounts(): void
    {
        $this->createTestDatabase();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-access-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => '123', 'email' => 'student@example.com', 'email_verified' => true,
            ]),
        ]);
        $headers = ['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'];
        $this->withHeaders($headers)->postJson('/api/auth/google/login', ['code' => 'first-code'])->assertNotFound();
        $this->withHeaders($headers)->postJson('/api/auth/google/register', ['code' => 'register-code'])->assertCreated();
        $this->withHeaders($headers)->postJson('/api/auth/google/login', ['code' => 'login-code'])
            ->assertOk()->assertJsonPath('user.role', 'student')->assertJsonStructure(['token'])
            ->assertJsonMissingPath('user.google_sub');
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('personal_access_tokens', 1);
        \Illuminate\Support\Facades\DB::table('users')->update(['archived_at' => now()]);
        $this->withHeaders($headers)->postJson('/api/auth/google/login', ['code' => 'archived-code'])->assertForbidden();
    }

    public function test_google_sign_in_rejects_untrusted_origin_and_unverified_email(): void
    {
        $this->withHeaders(['Origin' => 'https://attacker.example', 'X-Requested-With' => 'XMLHttpRequest'])
            ->postJson('/api/auth/google/login', ['code' => 'bad-code'])->assertForbidden();
        Http::assertNothingSent();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-access-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => '123', 'email' => 'student@gmail.com', 'email_verified' => false,
            ]),
        ]);
        $this->withHeaders(['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'])
            ->postJson('/api/auth/google/login', ['code' => 'unverified-code'])->assertStatus(422);
    }

    public function test_email_matching_cannot_take_over_a_non_google_mailbox(): void
    {
        $this->createTestDatabase();
        \App\Models\User::create([
            'fname' => 'Test', 'lname' => 'Student', 'email' => 'student@example.com',
            'password_hash' => 'unused', 'role' => 'student',
        ]);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-access-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => '123', 'email' => 'student@example.com', 'email_verified' => true,
            ]),
        ]);
        $this->withHeaders(['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'])
            ->postJson('/api/auth/google/login', ['code' => 'third-party-code'])->assertForbidden();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_verified_gmail_can_sign_in_without_changing_existing_role(): void
    {
        $this->createTestDatabase();
        \App\Models\User::create([
            'fname' => 'Test', 'lname' => 'Reviewer', 'email' => 'reviewer@gmail.com',
            'password_hash' => 'unused', 'role' => 'grammarian',
        ]);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-access-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => '456', 'email' => 'reviewer@gmail.com', 'email_verified' => true,
            ]),
        ]);
        $headers = ['Origin' => 'https://frontend.example', 'X-Requested-With' => 'XMLHttpRequest'];
        $this->withHeaders($headers)->postJson('/api/auth/google/login', ['code' => 'gmail-code'])
            ->assertOk()->assertJsonPath('user.role', 'grammarian');
        $this->assertDatabaseHas('users', ['email' => 'reviewer@gmail.com', 'google_sub' => '456']);
        \Illuminate\Support\Facades\Schema::create('email_verification_codes', function ($table) {
            $table->string('email');
        });
        \Illuminate\Support\Facades\DB::table('email_verification_codes')->insert(['email' => 'reviewer@gmail.com']);
        $this->withHeaders($headers)->postJson('/api/auth/google/login', ['code' => 'pending-code'])->assertForbidden();
    }
}
