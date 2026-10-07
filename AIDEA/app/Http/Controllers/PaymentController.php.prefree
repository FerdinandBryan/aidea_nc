<?php

namespace App\Http\Controllers;

use App\Mail\PaymentSubmitted;
use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class PaymentController extends Controller
{
    public function index(Request $request)
    {
        $query = Payment::latest();

        if ($request->filled('student')) {
            $query->where('student', $request->student);
        }

        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'gcash_ref' => 'required|string|min:6',
            'service' => 'required|string',
            'service_id' => 'nullable|integer',
            'student_id' => 'nullable|string',
            'date' => 'nullable|string',
            'date_iso' => 'nullable|date',
            'amount' => 'required|numeric|min:0',
            'method' => 'nullable|string',
            'proof_image' => 'required|string',
            'research_items' => 'nullable|array',
        ]);

        if (isset($validated['research_items'])) {
            $validated['research_items'] = json_encode($validated['research_items']);
        }

        $user = $request->user();
        $validated['user_id'] = $user->id;
        $validated['student'] = trim("{$user->fname} {$user->lname}");

        $validated['ref'] = 'TXN-' . now()->format('Ymd') . '-' . strtoupper(substr(uniqid(), -6));
        $validated['status'] = 'Pending';

        $payment = Payment::create($validated);

        Mail::to('norzagaraycollege.edu@gmail.com')->send(new PaymentSubmitted($payment));

        return response()->json($payment, 201);
    }

    public function approve(Payment $payment)
    {
        $payment->update(['status' => 'Paid']);
        return response()->json($payment);
    }

    public function reject(Payment $payment)
    {
        $payment->update(['status' => 'Rejected']);
        return response()->json($payment);
    }

    public function show(Payment $payment)
    {
        return response()->json($payment);
    }

    public function sendFiles(Request $request, Payment $payment)
    {
        $data = $request->validate([
            'type'    => 'required|in:files,certificate',
            'message' => 'nullable|string|max:1000',
            'files'   => 'required|array|min:1|max:10',
            'files.*' => 'file|mimes:pdf,jpg,jpeg,png,webp|max:5120',
        ]);

        $student = $payment->user ?? \App\Models\User::find($payment->user_id ?? null);
        if (!$student) {
            return response()->json(['message' => 'Student account not found for this payment.'], 404);
        }

        $paths = [];
        $firstUrl = null;
        $firstName = null;

        foreach ($request->file('files') as $f) {
            $folder = "payment-files/{$payment->id}" . ($data['type'] === 'certificate' ? '/certificate' : '');
            $stored = $f->storeAs($folder, $f->getClientOriginalName(), 'public');

            $paths[] = [
                'name' => $f->getClientOriginalName(),
                'path' => $stored,
            ];

            if (!$firstUrl) {
                $firstUrl = Storage::disk('public')->url($stored);
                $firstName = $f->getClientOriginalName();
            }
        }

        $payment->update([
            'certificate_url'  => $firstUrl,
            'certificate_name' => $firstName,
            'certificate_type' => $data['type'],
        ]);

        $student->notify(new \App\Notifications\PaymentFilesSent(
            $payment, $data['type'], $paths, $data['message'] ?? null
        ));

        return response()->json(['ok' => true, 'certificate' => [
            'url'  => $firstUrl,
            'name' => $firstName,
            'type' => $data['type'],
        ]]);
    }

    public function certificates()
    {
        $map = Payment::whereNotNull('certificate_url')
            ->get(['id', 'certificate_url', 'certificate_name', 'certificate_type'])
            ->mapWithKeys(function ($p) {
                return [$p->id => [
                    'url'  => $p->certificate_url,
                    'name' => $p->certificate_name,
                    'type' => $p->certificate_type,
                ]];
            });

        return response()->json($map);
    }
}
