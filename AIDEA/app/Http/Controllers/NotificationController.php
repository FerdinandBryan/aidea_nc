<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class NotificationController extends Controller
{
    // GET /api/notifications  -> the logged-in user's notifications
    public function index(Request $request)
    {
        $items = $request->user()->notifications()->latest()->take(50)->get()->map(function ($n) {
            $files = collect($n->data['files'] ?? [])->map(fn ($f) => [
                'name' => $f['name'],
                'url'  => url('storage/' . $f['path']),
            ])->values();

            return [
                'id'         => $n->id,
                'title'      => $n->data['title'] ?? 'Notification',
                'message'    => $n->data['message'] ?? null,
                'service'    => $n->data['service'] ?? null,
                'payment_id' => $n->data['payment_id'] ?? null,
                'files'      => $files,
                'read'       => $n->read_at !== null,
                'created_at' => $n->created_at,
            ];
        });

        return response()->json([
            'unread' => $request->user()->unreadNotifications()->count(),
            'items'  => $items,
        ]);
    }

    // POST /api/notifications/{id}/read
    public function markRead(Request $request, string $id)
    {
        $n = $request->user()->notifications()->where('id', $id)->firstOrFail();
        $n->markAsRead();
        return response()->json(['ok' => true]);
    }

    // POST /api/notifications/read-all
    public function readAll(Request $request)
    {
        $request->user()->unreadNotifications->markAsRead();
        return response()->json(['ok' => true]);
    }
}