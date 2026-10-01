<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PricingSheetController extends Controller
{
    private function safeUrl($u)
    {
        $u = trim((string) $u);
        if (stripos($u, 'www.') === 0) {
            $u = 'https://' . $u;
        }
        return preg_match('#^(https?://|mailto:)#i', $u) ? $u : null;
    }

    public function show()
    {
        $row = DB::table('pricing_sheets')->where('id', 1)->first();
        if (!$row) {
            return response()->json(['success' => true, 'data' => null]);
        }
        return response()->json([
            'success' => true,
            'data' => [
                'name' => $row->name,
                'rows' => json_decode($row->rows, true),
                'updated_at' => $row->updated_at,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'rows' => 'required|array|min:1|max:2000',
            'rows.*' => 'array|max:30',
            'rows.*.*.t' => 'nullable|string|max:2000',
            'rows.*.*.u' => 'nullable|string|max:2000',
        ]);

        $clean = [];
        foreach ($request->input('rows') as $row) {
            $cells = [];
            foreach ((array) $row as $c) {
                $c = (array) $c;
                $cells[] = [
                    't' => (string) ($c['t'] ?? ''),
                    'u' => isset($c['u']) ? $this->safeUrl($c['u']) : null,
                ];
            }
            $clean[] = $cells;
        }

        $now = now();
        $exists = DB::table('pricing_sheets')->where('id', 1)->exists();
        $payload = [
            'name' => $request->input('name'),
            'rows' => json_encode($clean, JSON_UNESCAPED_UNICODE),
            'updated_at' => $now,
        ];
        if ($exists) {
            DB::table('pricing_sheets')->where('id', 1)->update($payload);
        } else {
            DB::table('pricing_sheets')->insert($payload + ['id' => 1, 'created_at' => $now]);
        }

        return response()->json(['success' => true, 'message' => 'Pricing sheet saved.']);
    }

    public function destroy()
    {
        DB::table('pricing_sheets')->where('id', 1)->delete();
        return response()->json(['success' => true, 'message' => 'Pricing sheet removed.']);
    }
}