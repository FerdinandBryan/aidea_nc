<?php

namespace App\Http\Controllers;

use App\Models\Service;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class ServiceController extends Controller
{
    // GET /api/services
    public function index(): JsonResponse
    {
        $services = Service::orderBy('id')->get();

        return response()->json($services);
    }

    // GET /api/services/{id}
    public function show(Service $service): JsonResponse
    {
        return response()->json($service);
    }

    // POST /api/services
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
                'requires_research_info' => 'nullable|boolean',
                'research_requirement_text' => 'nullable|string|max:2000',
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
            'requires_research_info' => $validated['requires_research_info'] ?? false,
            'research_requirement_text' => $validated['research_requirement_text'] ?? null,
        ]);

        return response()->json($service, 201);
    }

    // PUT /api/services/{id}
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
                        if ($value && $value !== '__REMOVE__' && !str_starts_with($value, 'data:image/')) {
                            $fail('The GCash QR must be a valid base64 image string.');
                        }
                    }
                ],
                'is_qr_valid' => 'nullable|boolean',
                'requires_research_info' => 'nullable|boolean',
                'research_requirement_text' => 'nullable|string|max:2000',
            ]);
        } catch (ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        }

        if (isset($validated['gcash_qr']) && $validated['gcash_qr'] === '__REMOVE__') {
            $validated['gcash_qr'] = null;
            $validated['is_qr_valid'] = false;
        }

        $service->update($validated);

        return response()->json($service);
    }

    // PATCH /api/services/{id}/toggle
    public function toggle(Service $service): JsonResponse
    {
        $service->update(['active' => !$service->active]);

        return response()->json($service);
    }

    // DELETE /api/services/{id}
    public function destroy(Service $service): JsonResponse
    {
        $service->delete();

        return response()->json(['message' => 'Service deleted successfully.']);
    }
}