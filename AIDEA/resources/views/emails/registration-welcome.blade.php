<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

    <!-- Header -->
    <div style="background:#1a1a1a;padding:32px;text-align:center;">
      <div style="font-size:30px;font-weight:bold;color:#f5c518;letter-spacing:6px;">AIDEA</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;letter-spacing:2px;">NORZAGARAY COLLEGE RESEARCH PLATFORM</div>
    </div>

    <!-- Yellow bar -->
    <div style="height:5px;background:#f5c518;"></div>

    <!-- Welcome Banner -->
    <div style="background:#fffbeb;padding:24px 32px;text-align:center;border-bottom:1px solid #fde68a;">
      <div style="font-size:32px;margin-bottom:8px;">🎓</div>
      <h1 style="font-size:20px;font-weight:bold;color:#1a1a1a;margin:0 0 4px;">Welcome to AIDEA!</h1>
      <p style="font-size:13px;color:#92400e;margin:0;">Your registration has been received.</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:32px;">

      <p style="font-size:15px;color:#1a1a1a;margin:0 0 16px;">
        Dear <strong>{{ $user->full_name }}</strong>,
      </p>

      <p style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 20px;">
        Congratulations! You have successfully registered your account on <strong>AIDEA – Norzagaray College's Research Management Platform</strong>.
      </p>

      <p style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 20px;">
        Your account is currently <strong style="color:#d97706;">pending approval</strong>. Please wait for the review and approval of:
      </p>

      <!-- Approver Card -->
      <div style="background:#1a1a1a;border-radius:10px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:6px;letter-spacing:1px;">RESEARCH PRESIDENT</div>
        <div style="font-size:20px;font-weight:bold;color:#f5c518;letter-spacing:1px;">Romailyn Flores</div>
        <div style="height:2px;background:#f5c518;width:60px;margin:10px auto 0;border-radius:2px;"></div>
      </div>

      <p style="font-size:14px;color:#374151;line-height:1.8;margin:0 0 24px;">
        Once your account has been approved, you will be able to log in and access the full features of AIDEA including thesis submission, research repository, and AI-powered tools.
      </p>

      <!-- Info Box -->
      <div style="background:#f9fafb;border-left:4px solid #f5c518;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
        <p style="font-size:13px;color:#374151;margin:0 0 6px;font-weight:bold;">What happens next?</p>
        <ul style="font-size:13px;color:#6b7280;margin:0;padding-left:18px;line-height:1.9;">
          <li>The Research President will review your registration</li>
          <li>You will be notified once your account is approved</li>
          <li>After approval, log in using your student number</li>
        </ul>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:20px;"/>

      <!-- Account Details -->
      <p style="font-size:12px;color:#9ca3af;margin:0 0 10px;font-weight:bold;letter-spacing:1px;">YOUR ACCOUNT DETAILS</p>
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
          <td style="padding:8px 0;color:#6b7280;">Email</td>
          <td style="padding:8px 0;color:#1a1a1a;font-weight:bold;">{{ $user->email }}</td>
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

    <!-- Footer -->
    <div style="background:#1a1a1a;padding:24px 32px;text-align:center;">
      <div style="font-size:16px;font-weight:bold;color:#f5c518;letter-spacing:3px;margin-bottom:8px;">AIDEA</div>
      <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 4px;">Norzagaray College · Research Management Platform</p>
      <p style="font-size:11px;color:rgba(255,255,255,0.3);margin:0;">© {{ date('Y') }} All rights reserved · Data Privacy Protected</p>
    </div>

  </div>
</body>
</html>