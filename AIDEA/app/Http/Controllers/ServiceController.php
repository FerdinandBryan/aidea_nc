<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Service;

class ServiceController extends Controller
{
    public function index()
    {
        return response()->json(Service::all());
    }

    public function show($id)
    {
        $service = Service::findOrFail($id);
        return response()->json($service);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'description'  => 'nullable|string',
            'price'        => 'required|numeric|min:0',
            'icon'         => 'nullable|string',
            'cls'          => 'nullable|string',
            'active'       => 'nullable|boolean',
            'gcash_number' => 'nullable|string|max:11',
            'gcash_qr'     => 'nullable|string',
            'is_qr_valid'  => 'nullable|boolean',
        ]);

        $service = Service::create($validated);
        return response()->json($service, 201);
    }

    public function update(Request $request, $id)
    {
        $service = Service::findOrFail($id);

        $validated = $request->validate([
            'name'         => 'sometimes|string|max:255',
            'description'  => 'nullable|string',
            'price'        => 'sometimes|numeric|min:0',
            'icon'         => 'nullable|string',
            'cls'          => 'nullable|string',
            'active'       => 'nullable|boolean',
            'gcash_number' => 'nullable|string|max:11',
            'gcash_qr'     => 'nullable|string',
            'is_qr_valid'  => 'nullable|boolean',
        ]);

        $service->update($validated);
        return response()->json($service);
    }

    public function toggle($id)
    {
        $service = Service::findOrFail($id);
        $service->active = !$service->active;
        $service->save();
        return response()->json($service);
    }

    public function destroy($id)
    {
        $service = Service::findOrFail($id);
        $service->delete();
        return response()->json(['message' => 'Deleted successfully']);
    }
}