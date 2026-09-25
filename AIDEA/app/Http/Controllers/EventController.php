<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Event;

class EventController extends Controller
{
    public function upcoming(Request $request)
    {
        $events = Event::where('starts_at', '>=', now())
            ->orderBy('starts_at')
            ->limit(5)
            ->get(['id', 'title', 'location', 'starts_at']);

        return response()->json($events);
    }
}
