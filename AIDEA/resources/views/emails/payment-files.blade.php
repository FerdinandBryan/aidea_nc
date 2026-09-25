@php
    $title = $isCertificate ? 'Your certificate is ready' : 'New files from the admin';
    $count = count($files);
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $title }}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{ $title }}@if($service) for {{ $service }}@endif</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fa;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e7f1;">

  <tr><td style="background:#0a1a3f;padding:24px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="36" height="36" align="center" style="background:#FFC72C;color:#0a1a3f;font-weight:bold;font-size:18px;border-radius:9px;">A</td>
      <td style="padding-left:12px;">
        <div style="color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:1px;">AIDEA</div>
        <div style="color:#9fb0d6;font-size:11px;margin-top:2px;">Norzagaray College Research Platform</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:#FFC72C;font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:32px 32px 0;">
    <span style="display:inline-block;background:#fff5d6;color:#8a5d00;font-size:12px;font-weight:bold;padding:4px 12px;border-radius:999px;">{{ $isCertificate ? 'Certificate' : 'Files' }}</span>
    <h1 style="margin:14px 0 6px;font-size:22px;line-height:1.3;color:#0e1a3a;">{{ $title }}</h1>
    @if($service)
    <p style="margin:0;font-size:14px;color:#5f6d8c;">For <strong style="color:#0e1a3a;">{{ $service }}</strong></p>
    @endif
  </td></tr>

  <tr><td style="padding:22px 32px 0;">
    <p style="margin:0;font-size:15px;line-height:1.7;color:#0e1a3a;">Hi {{ $name }},</p>
    <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#374151;">
      @if($isCertificate)
        Your certificate has been issued and is attached to this email.
      @else
        The admin sent you {{ $count === 1 ? 'a file' : $count . ' files' }}, attached to this email.
      @endif
    </p>
  </td></tr>

  @if($note)
  <tr><td style="padding:18px 32px 0;">
    <div style="background:#f8f9fd;border-left:4px solid #FFC72C;border-radius:6px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#5f6d8c;margin-bottom:6px;">MESSAGE FROM THE ADMIN</div>
      <div style="font-size:14px;line-height:1.7;color:#0e1a3a;">{!! nl2br(e($note)) !!}</div>
    </div>
  </td></tr>
  @endif

  @if($count)
  <tr><td style="padding:18px 32px 0;">
    <div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#5f6d8c;margin-bottom:8px;">ATTACHED</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e7f1;border-radius:10px;">
      @foreach($files as $f)
      <tr><td style="padding:11px 14px;font-size:14px;color:#0e1a3a;border-bottom:1px solid #e2e7f1;">{{ $f['name'] }}</td></tr>
      @endforeach

  {{-- Inline certificate image(s) --}}
  @foreach ($files as $__f)
    @php
      $__p = data_get($__f, 'path', is_string($__f) ? $__f : null);
    @endphp
    @if ($__p && preg_match('/\.(jpe?g|png|webp)$/i', $__p))
      <img src="{{ $message->embed(\Illuminate\Support\Facades\Storage::disk('public')->path($__p)) }}" alt="Certificate" style="display:block;width:100%;max-width:520px;height:auto;margin:16px 0;border-radius:8px;border:1px solid #e5e7eb;">
    @endif
  @endforeach
    </table>
  </td></tr>
  @endif

  <tr><td style="padding:22px 32px 30px;">
    <p style="margin:0;font-size:13px;line-height:1.7;color:#5f6d8c;">You will also see this in your AIDEA notifications.</p>
  </td></tr>

  <tr><td style="background:#f8f9fd;border-top:1px solid #e2e7f1;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#8a94ad;">Sent by AIDEA Admin &middot; Norzagaray College</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>