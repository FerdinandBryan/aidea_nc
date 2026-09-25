<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

    <div style="background:#1a1a1a;padding:32px;text-align:center;">
      <div style="font-size:30px;font-weight:bold;color:#f5c518;letter-spacing:6px;">AIDEA</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;letter-spacing:2px;">NORZAGARAY COLLEGE RESEARCH PLATFORM</div>
    </div>

    <div style="height:5px;background:#f5c518;"></div>

    <div style="background:#f0fdf4;padding:24px 32px;text-align:center;border-bottom:1px solid #bbf7d0;">
      <div style="width:52px;height:52px;margin:0 auto 10px;background:#22c55e;border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style="font-size:20px;font-weight:bold;color:#166534;margin:0 0 4px;">Account Approved!</div>
      <div style="font-size:13px;color:#15803d;">You can now log in to AIDEA.</div>
    </div>

    <div style="background:#ffffff;padding:32px;">
      <p style="font-size:15px;color:#1a1a1a;margin:0 0 14px;">Dear <strong>{{ $user->full_name }}</strong>,</p>

      <p style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 18px;">
        Great news! Your AIDEA account has been <strong style="color:#16a34a;">reviewed and approved</strong> by the Research President.
        You now have full access to the platform.
      </p>

      <div style="background:#1a1a1a;border-radius:10px;padding:20px 24px;margin:0 0 22px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px;letter-spacing:1px;">APPROVED BY</div>
        <div style="font-size:20px;font-weight:bold;color:#f5c518;letter-spacing:1px;">Romailyn Flores</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;">Research President · Norzagaray College</div>
        <div style="height:2px;background:#f5c518;width:60px;margin:10px auto 0;border-radius:2px;"></div>
      </div>

      <div style="background:#f9fafb;border-left:4px solid #22c55e;padding:16px 20px;margin-bottom:24px;">
        <p style="font-size:13px;color:#374151;margin:0 0 8px;font-weight:bold;">You now have access to:</p>
        <div style="font-size:13px;color:#6b7280;line-height:1.9;">
          <div>· Thesis submission and tracking</div>
          <div>· Research repository</div>
          <div>· AI-powered research tools</div>
          <div>· Events and announcements</div>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="http://127.0.0.1:5500/login/login.html" style="display:inline-block;background:#f5c518;color:#1a1a1a;text-decoration:none;padding:12px 36px;border-radius:8px;font-size:14px;font-weight:bold;">
          Log in to AIDEA
        </a>
      </div>

      <div style="border-top:1px solid #e5e7eb;padding-top:18px;">
        <p style="font-size:11px;color:#9ca3af;margin:0 0 10px;font-weight:bold;letter-spacing:1px;">YOUR ACCOUNT DETAILS</p>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:8px 0;color:#6b7280;width:45%;">Student Number</td>
            <td style="padding:8px 0;color:#1a1a1a;font-weight:bold;">{{ $user->student_number }}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:8px 0;color:#6b7280;">Full Name</td>
            <td style="padding:8px 0;color:#1a1a1a;font-weight:bold;">{{ $user->full_name }}</td>
          </tr>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:8px 0;color:#6b7280;">Course</td>
            <td style="padding:8px 0;color:#1a1a1a;font-weight:bold;">{{ $user->course }}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Year & Section</td>
            <td style="padding:8px 0;color:#1a1a1a;font-weight:bold;">{{ $user->year_level }} — {{ $user->section }}</td>
          </tr>
        </table>
      </div>
    </div>

    <div style="background:#1a1a1a;padding:24px 32px;text-align:center;">
      <div style="font-size:16px;font-weight:bold;color:#f5c518;letter-spacing:3px;margin-bottom:8px;">AIDEA</div>
      <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 4px;">Norzagaray College · Research Management Platform</p>
      <p style="font-size:11px;color:rgba(255,255,255,0.3);margin:0;">© {{ date('Y') }} All rights reserved · Data Privacy Protected</p>
    </div>

  </div>
</body>
</html>
