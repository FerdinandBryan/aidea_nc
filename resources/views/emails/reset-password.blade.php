<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"/>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <!-- Header -->
    <div style="background:#1a1a1a;padding:32px;text-align:center;">
      <div style="font-size:30px;font-weight:bold;color:#f5c518;letter-spacing:6px;">AIDEA</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;letter-spacing:2px;">NORZAGARAY COLLEGE RESEARCH PLATFORM</div>
    </div>
    <div style="height:5px;background:#f5c518;"></div>
    <!-- Icon Banner -->
    <div style="background:#eff6ff;padding:24px 32px;text-align:center;border-bottom:1px solid #bfdbfe;">
      <div style="width:52px;height:52px;margin:0 auto 10px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div style="font-size:20px;font-weight:bold;color:#1e3a8a;margin:0 0 4px;">Password Reset Request</div>
      <div style="font-size:13px;color:#3b82f6;">Use the code below to reset your password</div>
    </div>
    <!-- Body -->
    <div style="background:#ffffff;padding:32px;">
      <p style="font-size:15px;color:#1a1a1a;margin:0 0 14px;">Hello,</p>
      <p style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 24px;">
        We received a request to reset the password for your AIDEA account.
        Use the verification code below to proceed. This code expires in <strong>30 minutes</strong>.
      </p>
      <!-- 6-Digit Code Box -->
      <div style="background:#1a1a1a;border-radius:10px;padding:28px 24px;margin:0 0 24px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:10px;letter-spacing:2px;">YOUR RESET CODE</div>
        <div style="font-size:42px;font-weight:bold;color:#f5c518;letter-spacing:12px;">{{ $code }}</div>
        <div style="height:2px;background:#f5c518;width:60px;margin:14px auto 0;border-radius:2px;"></div>
      </div>
      <!-- Warning box -->
      <div style="background:#fef9c3;border-left:4px solid #f5c518;padding:14px 18px;margin-bottom:24px;border-radius:0 6px 6px 0;">
        <p style="font-size:13px;color:#78350f;margin:0;">
          ⚠️ If you did not request a password reset, please ignore this email.
          Your account remains secure.
        </p>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:0;">
        Do not share this code with anyone. AIDEA staff will never ask for your reset code.
      </p>
    </div>
    <!-- Footer -->
    <div style="background:#1a1a1a;padding:24px 32px;text-align:center;">
      <div style="font-size:16px;font-weight:bold;color:#f5c518;letter-spacing:3px;margin-bottom:8px;">AIDEA</div>
      <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 4px;">Norzagaray College · Research Management Platform</p>
      <p style="font-size:11px;color:rgba(255,255,255,0.3);margin:0;">© {{ date('Y') }} All rights reserved · Data Privacy Protected</p>
    </div>
  </div>
</body>
</html>
