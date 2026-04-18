<?php

namespace App\Http\Controllers;

use App\Models\Service;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class ServiceController extends Controller
{
    // ──────────────────────────────────────────────
    //  GET /api/services
    //  Return all services ordered by id
    // ──────────────────────────────────────────────
    public function index(): JsonResponse
    {
        $services = Service::orderBy('id')->get();

        return response()->json($services);
    }

    // ──────────────────────────────────────────────
    //  GET /api/services/{id}
    //  Return a single service
    // ──────────────────────────────────────────────
    public function show(Service $service): JsonResponse
    {
        return response()->json($service);
    }

    // ──────────────────────────────────────────────
    //  POST /api/services
    //  Create a new service
    // ──────────────────────────────────────────────
    public function store(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'name' => 'required|string|max:255',
                'description' => 'required|string',
                'price' => 'required|numeric|min:0',
                'icon' => 'nullable|string|max:10',
                'cls' => 'nullable|string|max:50',
                'active' => 'nullable|boolean',
                'gcash_number' => 'nullable|string|size:11|regex:/^09[0-9]{9}$/',
                'gcash_qr' => [
                    'nullable',
                    'string',
                    function ($attr, $value, $fail) {
                        if ($value && !str_starts_with($value, 'data:image/')) {
                            $fail('The GCash QR must be a valid base64 image string.');
                        }
                    }
                ],
                'is_qr_valid' => 'nullable|boolean',
            ]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        }

        $service = Service::create([
            'name' => $validated['name'],
            'description' => $validated['description'],
            'price' => $validated['price'],
            'icon' => $validated['icon'] ?? '🛠️',
            'cls' => $validated['cls'] ?? 'analysis',
            'active' => $validated['active'] ?? true,
            'gcash_number' => $validated['gcash_number'] ?? null,
            'gcash_qr' => $validated['gcash_qr'] ?? null,
            'is_qr_valid' => $validated['is_qr_valid'] ?? false,
        ]);

        return response()->json($service, 201);
    }

    // ──────────────────────────────────────────────
    //  PUT /api/services/{id}
    //  Update an existing service
    // ──────────────────────────────────────────────
    public function update(Request $request, Service $service): JsonResponse
    {
        try {
            $validated = $request->validate([
                'name' => 'required|string|max:255',
                'description' => 'required|string',
                'price' => 'required|numeric|min:0',
                'icon' => 'nullable|string|max:10',
                'cls' => 'nullable|string|max:50',
                'gcash_number' => 'nullable|string|size:11|regex:/^09[0-9]{9}$/',
                'gcash_qr' => [
                    'nullable',
                    'string',
                    function ($attr, $value, $fail) {
                        // Allow __REMOVE__ sentinel or a valid base64 image
                        if ($value && $value !== '__REMOVE__' && !str_starts_with($value, 'data:image/')) {
                            $fail('The GCash QR must be a valid base64 image string.');
                        }
                    }
                ],
                'is_qr_valid' => 'nullable|boolean',
            ]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        }

        // Handle QR removal sentinel sent from the frontend
        if (isset($validated['gcash_qr']) && $validated['gcash_qr'] === '__REMOVE__') {
            $validated['gcash_qr'] = null;
            $validated['is_qr_valid'] = false;
        }

        $service->update($validated);

        return response()->json($service);
    }

    // ──────────────────────────────────────────────
    //  PATCH /api/services/{id}/toggle
    //  Flip the active flag
    // ──────────────────────────────────────────────
    public function toggle(Service $service): JsonResponse
    {
        $service->update(['active' => !$service->active]);

        return response()->json($service);
    }

    // ──────────────────────────────────────────────
    //  DELETE /api/services/{id}
    //  Soft-delete (or hard-delete) a service
    // ──────────────────────────────────────────────
    public function destroy(Service $service): JsonResponse
    {
        $service->delete();

        return response()->json(['message' => 'Service deleted successfully.']);
    }
}