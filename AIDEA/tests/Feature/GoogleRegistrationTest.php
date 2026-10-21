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

    public function test_verified_google_account_creates_only_a_student_and_does_not_link_existing_email(): void
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
            $table->string('password_hash');
            $table->boolean('is_verified')->default(false);
            $table->boolean('is_admin')->default(false);
            $table->string('role');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamps();
        });
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
}
