<h2>New Payment Submitted</h2>

<p>A student has submitted a payment for a service. Details below:</p>

<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">
    <tr><td><strong>Service</strong></td><td>{{ $payment->service }}</td></tr>
    <tr><td><strong>Student</strong></td><td>{{ $payment->student }}</td></tr>
    <tr><td><strong>Student ID</strong></td><td>{{ $payment->student_id ?? '-' }}</td></tr>
    <tr><td><strong>Amount</strong></td><td>&#8369;{{ number_format($payment->amount, 2) }}</td></tr>
    <tr><td><strong>GCash Reference</strong></td><td>{{ $payment->gcash_ref }}</td></tr>
    <tr><td><strong>Internal Ref</strong></td><td>{{ $payment->ref }}</td></tr>
    <tr><td><strong>Date</strong></td><td>{{ $payment->date }}</td></tr>
    <tr><td><strong>Status</strong></td><td>{{ $payment->status }}</td></tr>
</table>

@if(!empty($payment->research_items))
    <h3>Research Info Submitted</h3>
    <ul>
    @foreach(json_decode($payment->research_items, true) as $item)
        <li>
            <strong>{{ $item['label'] }}</strong>:
            @if($item['type'] === 'text')
                {{ $item['value'] }}
            @else
                see attachment "{{ $item['file_name'] ?? 'file' }}"
            @endif
        </li>
    @endforeach
    </ul>
    <p style="color:#6b7280;font-size:.85rem;">Uploaded files/images are attached to this email.</p>
@endif

<p>Please log in to the admin panel to review and approve/reject this payment.</p>
