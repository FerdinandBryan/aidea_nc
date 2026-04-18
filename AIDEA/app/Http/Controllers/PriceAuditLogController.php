<?php

namespace App\Http\Controllers;

use App\Models\PriceAuditLog;
use Illuminate\Http\Request;

class PriceAuditLogController extends Controller
{
    public function index()
    {
        return PriceAuditLog::orderBy('id', 'desc')->get();
    }

    public function store(Request $request)
    {
        return PriceAuditLog::create($request->all());
    }
}
