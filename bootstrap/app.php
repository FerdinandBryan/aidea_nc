<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->prepend(HandleCors::class);
        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureAdmin::class,
            'reviewer' => \App\Http\Middleware\EnsureReviewer::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (\Symfony\Component\Mailer\Exception\TransportExceptionInterface $e, $request) {
            if ($request->is('api/*')) {
                \Illuminate\Support\Facades\Log::error('Mail transport failed: ' . $e->getMessage());

                return response()->json([
                    'success' => false,
                    'message' => 'We could not send the email right now. Please try again later.',
                ], 503);
            }
        });
    })->create();